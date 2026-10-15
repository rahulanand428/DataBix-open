import hashlib
import json
import logging
import threading
from datetime import date
from pathlib import Path
from collections.abc import Callable
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError
from pymongo.database import Database as MongoDatabase
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy.orm import Session, sessionmaker

from database import SessionLocal, get_mongo_database, get_redis_client
from ingestion.short_selling import (
    DEFAULT_SHORT_SELLING_CSV,
    IngestionResult,
    ingest_short_selling_csv,
)
from repositories.short_selling_repository import ShortSellingRepository
from api.v1.schemas.short_selling import (
    Coverage,
    DailyTotals,
    DayTotal,
    PeakDay,
    SeriesPoint,
    ShortSellingPage,
    ShortSellingRecord,
    Summary,
    SymbolList,
    SymbolListItem,
    SymbolSeries,
    SymbolStats,
    TopSymbol,
    TopSymbols,
)

CachedModel = TypeVar("CachedModel", bound=BaseModel)


logger = logging.getLogger(__name__)
CACHE_KEY_PREFIX = "short_selling:v1"
CACHE_TTL_SECONDS = 300
DATAFILES_DIRECTORY = Path(__file__).resolve().parents[1] / "datafiles"

# The API runs a single uvicorn worker; this keeps concurrent ingestion
# requests from piling up in the threadpool and starving every other route.
_INGESTION_LOCK = threading.Lock()


class InvalidIngestionFilenameError(ValueError):
    """The requested filename is not a CSV basename inside datafiles."""


class IngestionInProgressError(RuntimeError):
    """Another ingestion is already running in this process."""


class SymbolNotFoundError(LookupError):
    """No rows exist for the requested symbol."""


def _iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


class ShortSellingService:
    def __init__(
        self,
        repository: ShortSellingRepository | None = None,
        redis_client: Redis | None = None,
        mongo_database: MongoDatabase | None = None,
        session_factory: sessionmaker[Session] = SessionLocal,
    ) -> None:
        self._session_factory = session_factory
        self._repository = (
            repository if repository is not None else ShortSellingRepository(session_factory)
        )
        self._redis = redis_client if redis_client is not None else get_redis_client()
        self._mongo_database = mongo_database

    def _cached(
        self,
        kind: str,
        params: dict[str, Any],
        model: type[CachedModel],
        load: Callable[[], CachedModel],
    ) -> CachedModel:
        """Serve from Redis when possible; Redis failures fall back to PostgreSQL."""
        cache_key = self._cache_key({"kind": kind, **params})
        try:
            cached = self._redis.get(cache_key)
            if cached:
                try:
                    return model.model_validate_json(cached)
                except ValidationError:
                    logger.warning("Discarding invalid short-selling cache entry")
        except RedisError:
            logger.warning("Redis read failed; querying PostgreSQL", exc_info=True)

        result = load()
        try:
            self._redis.set(cache_key, result.model_dump_json(), ex=CACHE_TTL_SECONDS)
        except RedisError:
            logger.warning("Redis write failed; returning PostgreSQL result", exc_info=True)
        return result

    def list_records(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        symbol: str | None = None,
        limit: int = 100,
        offset: int = 0,
        sort: str = "-date",
    ) -> ShortSellingPage:
        def load() -> ShortSellingPage:
            records, total = self._repository.get_page(
                date_from=date_from,
                date_to=date_to,
                symbol=symbol,
                limit=limit,
                offset=offset,
                sort=sort,
            )
            return ShortSellingPage(
                items=[ShortSellingRecord.model_validate(record) for record in records],
                total=total,
                limit=limit,
                offset=offset,
            )

        params = {
            "date_from": _iso(date_from),
            "date_to": _iso(date_to),
            "symbol": symbol,
            "limit": limit,
            "offset": offset,
            "sort": sort,
        }
        return self._cached("page", params, ShortSellingPage, load)

    def coverage(self) -> Coverage:
        return self._cached(
            "coverage", {}, Coverage, lambda: Coverage(**self._repository.coverage())
        )

    def daily_totals(self, date_from: date | None, date_to: date | None) -> DailyTotals:
        return self._cached(
            "daily",
            {"date_from": _iso(date_from), "date_to": _iso(date_to)},
            DailyTotals,
            lambda: DailyTotals(
                items=[DayTotal(**row) for row in self._repository.daily_totals(date_from, date_to)]
            ),
        )

    def top_symbols(
        self, date_from: date | None, date_to: date | None, limit: int = 10
    ) -> TopSymbols:
        return self._cached(
            "top",
            {"date_from": _iso(date_from), "date_to": _iso(date_to), "limit": limit},
            TopSymbols,
            lambda: TopSymbols(
                items=[
                    TopSymbol(**row)
                    for row in self._repository.top_symbols(date_from, date_to, limit)
                ]
            ),
        )

    def summary(self, date_from: date | None, date_to: date | None) -> Summary:
        def load() -> Summary:
            totals = self._repository.range_totals(date_from, date_to)
            days = self._repository.daily_totals(date_from, date_to)
            peak = max(days, key=lambda day: day["total_quantity"], default=None)
            top = self._repository.top_symbols(date_from, date_to, 1)
            trading_days = totals["trading_days"]
            return Summary(
                date_from=date_from,
                date_to=date_to,
                total_quantity=totals["total_quantity"],
                records=totals["records"],
                symbols=totals["symbols"],
                trading_days=trading_days,
                average_daily_quantity=(
                    round(totals["total_quantity"] / trading_days, 2) if trading_days else 0.0
                ),
                peak_day=(
                    PeakDay(date=peak["date"], total_quantity=peak["total_quantity"])
                    if peak
                    else None
                ),
                top_symbol=TopSymbol(**top[0]) if top else None,
            )

        return self._cached(
            "summary", {"date_from": _iso(date_from), "date_to": _iso(date_to)}, Summary, load
        )

    def search_symbols(self, query: str | None, limit: int = 20, offset: int = 0) -> SymbolList:
        def load() -> SymbolList:
            items, total = self._repository.search_symbols(query, limit, offset)
            return SymbolList(
                items=[SymbolListItem(**item) for item in items],
                total=total,
                limit=limit,
                offset=offset,
            )

        return self._cached(
            "symbols", {"q": query, "limit": limit, "offset": offset}, SymbolList, load
        )

    def symbol_series(
        self, symbol: str, date_from: date | None = None, date_to: date | None = None
    ) -> SymbolSeries:
        def load() -> SymbolSeries:
            points = self._repository.symbol_series(symbol, date_from, date_to)
            return SymbolSeries(symbol=symbol, items=[SeriesPoint(**point) for point in points])

        return self._cached(
            "series",
            {"symbol": symbol, "date_from": _iso(date_from), "date_to": _iso(date_to)},
            SymbolSeries,
            load,
        )

    def symbol_stats(self, symbol: str) -> SymbolStats:
        def load() -> SymbolStats:
            points = self._repository.symbol_series(symbol, None, None)
            if not points:
                raise SymbolNotFoundError(symbol)
            name = self._repository.symbol_names([symbol]).get(symbol, symbol)
            peak = max(points, key=lambda point: point["quantity"])
            total = sum(point["quantity"] for point in points)
            return SymbolStats(
                symbol=symbol,
                security_name=name,
                total_quantity=total,
                trading_days=len(points),
                average_quantity=round(total / len(points), 2),
                max_quantity=peak["quantity"],
                max_date=peak["date"],
                first_date=points[0]["date"],
                last_date=points[-1]["date"],
            )

        return self._cached("stats", {"symbol": symbol}, SymbolStats, load)

    def export_rows(
        self,
        date_from: date | None,
        date_to: date | None,
        symbol: str | None,
        sort: str,
        limit: int,
    ):
        return self._repository.iter_rows(date_from, date_to, symbol, sort, limit)

    def count_rows(
        self, date_from: date | None, date_to: date | None, symbol: str | None
    ) -> int:
        return self._repository.count(date_from, date_to, symbol)

    def ingest_csv(
        self, filename: str | None = None, chunk_size: int = 1_000
    ) -> IngestionResult:
        """Ingest a CSV named by an API caller; only basenames inside datafiles are allowed."""
        csv_path = DEFAULT_SHORT_SELLING_CSV
        if filename is not None:
            candidate_name = Path(filename)
            if (
                candidate_name.is_absolute()
                or candidate_name.name != filename
                or "/" in filename
                or "\\" in filename
                or candidate_name.suffix.lower() != ".csv"
                or filename in {".", ".."}
            ):
                raise InvalidIngestionFilenameError(
                    "filename must be a CSV filename without a directory path"
                )
            datafiles_directory = DATAFILES_DIRECTORY.resolve()
            csv_path = (datafiles_directory / filename).resolve()
            if not csv_path.is_relative_to(datafiles_directory):
                raise InvalidIngestionFilenameError(
                    "filename must refer to a CSV inside datafiles"
                )
            if not csv_path.is_file():
                raise FileNotFoundError(filename)
        return self.ingest_path(csv_path, chunk_size=chunk_size)

    def ingest_path(
        self, csv_path: str | Path, chunk_size: int = 1_000
    ) -> IngestionResult:
        """Ingest any CSV path; for trusted operator tooling such as the CLI only."""
        if not _INGESTION_LOCK.acquire(blocking=False):
            raise IngestionInProgressError("An ingestion is already running")
        try:
            result = ingest_short_selling_csv(
                csv_path=Path(csv_path),
                chunk_size=chunk_size,
                mongo_database=(
                    self._mongo_database
                    if self._mongo_database is not None
                    else get_mongo_database()
                ),
                session_factory=self._session_factory,
            )
        finally:
            _INGESTION_LOCK.release()
        if result.postgres_rows:
            self.invalidate_cache()
        return result

    def invalidate_cache(self) -> int:
        deleted = 0
        batch: list[str] = []
        for key in self._redis.scan_iter(match=f"{CACHE_KEY_PREFIX}:*", count=500):
            batch.append(key)
            if len(batch) == 500:
                deleted += self._redis.delete(*batch)
                batch.clear()
        if batch:
            deleted += self._redis.delete(*batch)
        return deleted

    @staticmethod
    def _cache_key(filters: dict[str, Any]) -> str:
        encoded = json.dumps(filters, sort_keys=True, separators=(",", ":"))
        digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
        return f"{CACHE_KEY_PREFIX}:{digest}"


def get_short_selling_service() -> ShortSellingService:
    return ShortSellingService()
