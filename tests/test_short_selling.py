from contextlib import contextmanager
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base
from auth.dependencies import get_current_user
from ingestion.short_selling import ingest_short_selling_csv
from main import app
from services.ingestion_runs import get_ingestion_recorder
from tests.conftest import FakeRedis
from models import ShortSellingMaster
from repositories.short_selling_repository import ShortSellingRepository
from services.short_selling_service import (
    CACHE_KEY_PREFIX,
    IngestionInProgressError,
    InvalidIngestionFilenameError,
    ShortSellingService,
    get_short_selling_service,
)
from services import short_selling_service as short_selling_service_module


class FakeRecorder:
    def __init__(self) -> None:
        self.events: list[tuple[str, Any]] = []

    def start(self, filename: str, triggered_by: str) -> int:
        self.events.append(("start", filename))
        return 1

    def finish(self, run_id: int, result: Any) -> None:
        self.events.append(("finish", result.postgres_rows))

    def fail(self, run_id: int, reason: str) -> None:
        self.events.append(("fail", reason))


@pytest.fixture(autouse=True)
def authenticated_test_user() -> Any:
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=1, username="test-user", is_active=True, is_admin=True
    )
    app.dependency_overrides[get_ingestion_recorder] = FakeRecorder
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_ingestion_recorder, None)


class FakeCollection:
    def __init__(self, events: list[str]) -> None:
        self.events = events
        self.operations: list[Any] = []

    def bulk_write(self, operations: list[Any], ordered: bool) -> None:
        assert ordered is False
        self.events.append("mongo")
        self.operations.extend(operations)


class FakeMongoDatabase:
    def __init__(self, events: list[str]) -> None:
        self.collection = FakeCollection(events)

    def __getitem__(self, name: str) -> FakeCollection:
        assert name == "short_selling_history"
        return self.collection


class FakeSession:
    def __init__(
        self, events: list[str], statements: list[Any], rowcount: int | None
    ) -> None:
        self.events = events
        self.statements = statements
        self.rowcount = rowcount

    def execute(self, statement: Any) -> SimpleNamespace:
        self.events.append("postgres")
        self.statements.append(statement)
        return SimpleNamespace(rowcount=self.rowcount)


class FakeSessionFactory:
    def __init__(self, events: list[str], rowcounts: list[int | None]) -> None:
        self.events = events
        self.statements: list[Any] = []
        self.rowcounts = rowcounts

    @contextmanager
    def begin(self) -> Any:
        rowcount = self.rowcounts.pop(0) if self.rowcounts else None
        yield FakeSession(self.events, self.statements, rowcount)


@pytest.fixture
async def api_service() -> Any:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(engine)
    with session_factory.begin() as session:
        session.add_all(
            [
                ShortSellingMaster(
                    trade_date=date(2026, 4, 1),
                    symbol="ABB",
                    security_name="ABB LTD.",
                    quantity=1,
                    source_hash="fixture",
                    source_file="fixture.csv",
                    source_row_number=1,
                ),
                ShortSellingMaster(
                    trade_date=date(2026, 4, 1),
                    symbol="ABB",
                    security_name="ABB LTD.",
                    quantity=2,
                    source_hash="fixture",
                    source_file="fixture.csv",
                    source_row_number=2,
                ),
                ShortSellingMaster(
                    trade_date=date(2026, 4, 1),
                    symbol="ABFRL",
                    security_name="ADITYA BIRLA FASHION & RT",
                    quantity=1512,
                    source_hash="fixture",
                    source_file="fixture.csv",
                    source_row_number=3,
                ),
            ]
        )
    redis = FakeRedis()
    service = ShortSellingService(
        repository=ShortSellingRepository(session_factory),
        redis_client=redis,
        session_factory=session_factory,
    )
    yield service, redis
    engine.dispose()


@pytest.mark.asyncio
async def test_short_selling_endpoint_filters_and_caches(api_service: Any) -> None:
    service, redis = api_service
    app.dependency_overrides[get_short_selling_service] = lambda: service
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            first = await client.get("/api/v1/short-selling", params={"symbol": "abb"})
            second = await client.get("/api/v1/short-selling", params={"symbol": "abb"})
    finally:
        app.dependency_overrides.pop(get_short_selling_service, None)

    assert first.status_code == 200
    assert first.json()["total"] == 2
    assert first.json()["items"][0] == {
        "id": 1,
        "date": "2026-04-01",
        "symbol": "ABB",
        "security_name": "ABB LTD.",
        "quantity": 1,
    }
    assert first.json()["items"][1]["quantity"] == 2
    assert second.json() == first.json()
    assert redis.set_calls == 1
    assert redis.get_calls == 2


@pytest.mark.asyncio
async def test_ingestion_endpoint_triggers_default_file_ingestion() -> None:
    result = SimpleNamespace(
        source_file="Short-Selling-01-04-2026-to-01-10-2026.csv",
        mongo_rows=14_000,
        postgres_rows=14_000,
        skipped_rows=36,
    )
    service = SimpleNamespace(ingest_csv=lambda filename=None: result)
    app.dependency_overrides[get_short_selling_service] = lambda: service
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post("/api/v1/short-selling/ingest")
    finally:
        app.dependency_overrides.pop(get_short_selling_service, None)

    assert response.status_code == 200
    assert response.json() == {
        "source_file": "Short-Selling-01-04-2026-to-01-10-2026.csv",
        "mongo_rows": 14_000,
        "postgres_rows": 14_000,
        "skipped_rows": 36,
    }


@pytest.mark.asyncio
async def test_ingestion_endpoint_passes_requested_filename() -> None:
    requested: dict[str, str | None] = {}
    result = SimpleNamespace(
        source_file="custom.csv",
        mongo_rows=1,
        postgres_rows=1,
        skipped_rows=0,
    )

    def ingest_csv(filename: str | None = None) -> SimpleNamespace:
        requested["filename"] = filename
        return result

    app.dependency_overrides[get_short_selling_service] = lambda: SimpleNamespace(
        ingest_csv=ingest_csv
    )
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/short-selling/ingest", params={"filename": "custom.csv"}
            )
    finally:
        app.dependency_overrides.pop(get_short_selling_service, None)

    assert response.status_code == 200
    assert requested["filename"] == "custom.csv"


@pytest.mark.asyncio
async def test_ingestion_endpoint_maps_invalid_filename_to_bad_request() -> None:
    def ingest_csv(filename: str | None = None) -> None:
        raise ValueError("filename must be a CSV filename without a directory path")

    app.dependency_overrides[get_short_selling_service] = lambda: SimpleNamespace(
        ingest_csv=ingest_csv
    )
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/short-selling/ingest", params={"filename": "../secret.csv"}
            )
    finally:
        app.dependency_overrides.pop(get_short_selling_service, None)

    assert response.status_code == 400


def test_ingestion_service_rejects_directory_and_path_traversal(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(short_selling_service_module, "DATAFILES_DIRECTORY", tmp_path)
    service = ShortSellingService(
        repository=SimpleNamespace(),
        redis_client=FakeRedis(),
        mongo_database=FakeMongoDatabase([]),
        session_factory=SimpleNamespace(),
    )

    with pytest.raises(ValueError):
        service.ingest_csv(filename="../outside.csv")


def test_ingestion_service_rejects_symlink_outside_datafiles(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    datafiles = tmp_path / "datafiles"
    datafiles.mkdir()
    outside_file = tmp_path / "outside.csv"
    outside_file.write_text("test", encoding="utf-8")
    try:
        (datafiles / "linked.csv").symlink_to(outside_file)
    except OSError:
        pytest.skip("Symlink creation is not available on this platform")

    monkeypatch.setattr(short_selling_service_module, "DATAFILES_DIRECTORY", datafiles)
    service = ShortSellingService(
        repository=SimpleNamespace(),
        redis_client=FakeRedis(),
        mongo_database=FakeMongoDatabase([]),
        session_factory=SimpleNamespace(),
    )

    with pytest.raises(ValueError, match="inside datafiles"):
        service.ingest_csv(filename="linked.csv")


@pytest.mark.asyncio
async def test_short_selling_endpoint_rejects_inverted_date_range(api_service: Any) -> None:
    service, _ = api_service
    app.dependency_overrides[get_short_selling_service] = lambda: service
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/v1/short-selling",
                params={"date_from": "2026-04-02", "date_to": "2026-04-01"},
            )
    finally:
        app.dependency_overrides.pop(get_short_selling_service, None)

    assert response.status_code == 422


def test_csv_ingestion_writes_mongo_before_postgres_and_invalidates_cache(
    tmp_path: Path,
) -> None:
    csv_path = tmp_path / "Short-Selling-sample.csv"
    csv_path.write_text(
        '"Date ","Symbol ","Security Name ","Quantity "\n'
        '"01-APR-2026","ABB","ABB LTD.","1"\n'
        '"01-APR-2026","ABB","ABB LTD.","2"\n'
        '"01-APR-2026","ABFRL","ADITYA BIRLA FASHION & RT","1,512"\n'
        '"09-JUL-2026","LIQUIDBEES","NIP IND ETF LIQUID BEES","-"\n',
        encoding="utf-8",
    )
    events: list[str] = []
    mongo = FakeMongoDatabase(events)
    session_factory = FakeSessionFactory(events, [3, 0])
    redis = FakeRedis()
    redis.values[f"{CACHE_KEY_PREFIX}:previous"] = "stale"
    service = ShortSellingService(
        redis_client=redis,
        mongo_database=mongo,
        session_factory=session_factory,
    )

    result = service.ingest_path(csv_path, chunk_size=100)

    assert result.mongo_rows == 3
    assert result.postgres_rows == 3
    assert result.skipped_rows == 1
    assert events == ["mongo", "postgres"]
    assert len(mongo.collection.operations) == 3
    assert not redis.values
    compiled = session_factory.statements[0].compile(dialect=postgresql.dialect())
    assert "ON CONFLICT (source_file, source_hash, source_row_number) DO NOTHING" in str(compiled)
    assert 1512 in compiled.params.values()

    redis.values[f"{CACHE_KEY_PREFIX}:valid"] = "cached"
    repeated = service.ingest_path(csv_path, chunk_size=100)

    assert repeated.mongo_rows == 3
    assert repeated.postgres_rows == 0
    assert repeated.skipped_rows == 1
    assert events == ["mongo", "postgres", "mongo", "postgres"]
    assert len(mongo.collection.operations) == 6
    assert redis.values == {f"{CACHE_KEY_PREFIX}:valid": "cached"}
    first_upsert = mongo.collection.operations[0]._doc
    assert "ingested_at" in first_upsert["$setOnInsert"]
    assert "ingested_at" not in first_upsert["$set"]


@pytest.mark.asyncio
async def test_ingestion_endpoint_requires_admin() -> None:
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=2, username="reader", is_active=True, is_admin=False
    )
    called: list[str | None] = []
    app.dependency_overrides[get_short_selling_service] = lambda: SimpleNamespace(
        ingest_csv=lambda filename=None: called.append(filename)
    )
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post("/api/v1/short-selling/ingest")
    finally:
        app.dependency_overrides.pop(get_short_selling_service, None)

    assert response.status_code == 403
    assert called == []


@pytest.mark.asyncio
async def test_ingestion_endpoint_hides_csv_parser_details() -> None:
    def ingest_csv(filename: str | None = None) -> None:
        raise ValueError("Invalid date or quantity in CSV chunk row 7: {'Symbol': 'SECRET'}")

    app.dependency_overrides[get_short_selling_service] = lambda: SimpleNamespace(
        ingest_csv=ingest_csv
    )
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post("/api/v1/short-selling/ingest")
    finally:
        app.dependency_overrides.pop(get_short_selling_service, None)

    assert response.status_code == 400
    assert "SECRET" not in response.text


@pytest.mark.asyncio
async def test_ingestion_endpoint_reports_concurrent_run() -> None:
    def ingest_csv(filename: str | None = None) -> None:
        raise IngestionInProgressError("An ingestion is already running")

    app.dependency_overrides[get_short_selling_service] = lambda: SimpleNamespace(
        ingest_csv=ingest_csv
    )
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post("/api/v1/short-selling/ingest")
    finally:
        app.dependency_overrides.pop(get_short_selling_service, None)

    assert response.status_code == 409


def test_ingestion_service_allows_one_run_at_a_time(tmp_path: Path) -> None:
    service = ShortSellingService(
        repository=SimpleNamespace(),
        redis_client=FakeRedis(),
        mongo_database=FakeMongoDatabase([]),
        session_factory=SimpleNamespace(),
    )
    assert short_selling_service_module._INGESTION_LOCK.acquire(blocking=False)
    try:
        with pytest.raises(IngestionInProgressError):
            service.ingest_path(tmp_path / "any.csv")
    finally:
        short_selling_service_module._INGESTION_LOCK.release()


def test_ingestion_service_rejects_absolute_paths_from_api_callers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(short_selling_service_module, "DATAFILES_DIRECTORY", tmp_path)
    outside = tmp_path.parent / "outside.csv"
    service = ShortSellingService(
        repository=SimpleNamespace(),
        redis_client=FakeRedis(),
        mongo_database=FakeMongoDatabase([]),
        session_factory=SimpleNamespace(),
    )

    with pytest.raises(InvalidIngestionFilenameError):
        service.ingest_csv(filename=str(outside))


@pytest.mark.asyncio
async def test_short_selling_endpoint_rejects_oversized_offset(api_service: Any) -> None:
    service, _ = api_service
    app.dependency_overrides[get_short_selling_service] = lambda: service
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/v1/short-selling", params={"offset": 10**30}
            )
    finally:
        app.dependency_overrides.pop(get_short_selling_service, None)

    assert response.status_code == 422
