import os

os.environ.setdefault("JWT_SECRET_KEY", "pytest-only-signing-secret-not-for-deployment-32-bytes")
# Tests talk to the ASGI app over plain http://test, where Secure cookies are not sent.
os.environ.setdefault("AUTH_COOKIE_SECURE", "false")

from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from auth.utils import create_access_token, get_password_hash
from database import Base, get_db
from main import app
from models import ShortSellingMaster, User
from repositories.short_selling_repository import ShortSellingRepository
from services.ingestion_runs import IngestionRunRecorder, get_ingestion_recorder
from services.short_selling_service import ShortSellingService, get_short_selling_service
from services.watchlist import WatchlistService, get_watchlist_service


class FakeRedis:
    """In-memory stand-in for the cache; mirrors the commands the service uses."""

    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.get_calls = 0
        self.set_calls = 0

    def get(self, key: str) -> str | None:
        self.get_calls += 1
        return self.values.get(key)

    def set(self, key: str, value: str, ex: int) -> None:
        self.set_calls += 1
        self.values[key] = value

    def scan_iter(self, match: str, count: int) -> list[str]:
        prefix = match.rstrip("*")
        return [key for key in self.values if key.startswith(prefix)]

    def delete(self, *keys: str) -> int:
        return sum(self.values.pop(key, None) is not None for key in keys)


@dataclass
class AppDatabase:
    session_factory: sessionmaker[Session]
    redis: FakeRedis

    def add_user(self, username: str, *, admin: bool = False, active: bool = True,
                 password: str = "correct-horse-battery") -> User:
        with self.session_factory.begin() as session:
            user = User(
                username=username,
                hashed_password=get_password_hash(password),
                is_admin=admin,
                is_active=active,
                created_at=datetime.now(UTC),
            )
            session.add(user)
            session.flush()
            session.expunge(user)
        return user

    def add_rows(self, rows: list[tuple[date, str, str, int]]) -> None:
        with self.session_factory.begin() as session:
            for index, (trade_date, symbol, name, quantity) in enumerate(rows, start=1):
                session.add(
                    ShortSellingMaster(
                        trade_date=trade_date,
                        symbol=symbol,
                        security_name=name,
                        quantity=quantity,
                        source_hash="fixture",
                        source_file="fixture.csv",
                        source_row_number=index,
                    )
                )


def auth_headers(username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': username})}"}


@pytest.fixture
def db() -> Iterator[AppDatabase]:
    """A fresh in-memory database wired into every dependency that touches storage."""
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(engine)
    redis = FakeRedis()

    def override_get_db() -> Iterator[Session]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    service = ShortSellingService(
        repository=ShortSellingRepository(session_factory),
        redis_client=redis,
        session_factory=session_factory,
    )
    overrides: dict[Any, Any] = {
        get_db: override_get_db,
        get_short_selling_service: lambda: service,
        get_ingestion_recorder: lambda: IngestionRunRecorder(session_factory),
        get_watchlist_service: lambda: WatchlistService(session_factory),
    }
    app.dependency_overrides.update(overrides)
    yield AppDatabase(session_factory, redis)
    for dependency in overrides:
        app.dependency_overrides.pop(dependency, None)
    engine.dispose()


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
