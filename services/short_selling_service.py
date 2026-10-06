import hashlib
import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

from pydantic import ValidationError
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
from api.v1.schemas.short_selling import ShortSellingPage, ShortSellingRecord


logger = logging.getLogger(__name__)
CACHE_KEY_PREFIX = "short_selling:v1"
CACHE_TTL_SECONDS = 300
DATAFILES_DIRECTORY = Path(__file__).resolve().parents[1] / "datafiles"


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

    def list_records(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        symbol: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> ShortSellingPage:
        filters: dict[str, Any] = {
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "symbol": symbol,
            "limit": limit,
            "offset": offset,
        }
        cache_key = self._cache_key(filters)
        try:
            cached = self._redis.get(cache_key)
            if cached:
                try:
                    return ShortSellingPage.model_validate_json(cached)
                except ValidationError:
                    logger.warning("Discarding invalid short-selling cache entry")
        except RedisError:
            logger.warning("Redis read failed; querying PostgreSQL", exc_info=True)

        records, total = self._repository.get_page(
            date_from=date_from,
            date_to=date_to,
            symbol=symbol,
            limit=limit,
            offset=offset,
        )
        page = ShortSellingPage(
            items=[ShortSellingRecord.model_validate(record) for record in records],
            total=total,
            limit=limit,
            offset=offset,
        )
        try:
            self._redis.set(cache_key, page.model_dump_json(), ex=CACHE_TTL_SECONDS)
        except RedisError:
            logger.warning("Redis write failed; returning PostgreSQL result", exc_info=True)
        return page

    def ingest_csv(
        self, filename: str | None = None, chunk_size: int = 1_000
    ) -> IngestionResult:
        csv_path = DEFAULT_SHORT_SELLING_CSV
        if filename is not None:
            candidate_name = Path(filename)
            if candidate_name.is_absolute():
                csv_path = candidate_name
            else:
                if (
                    candidate_name.name != filename
                    or "/" in filename
                    or "\\" in filename
                    or candidate_name.suffix.lower() != ".csv"
                    or filename in {".", ".."}
                ):
                    raise ValueError("filename must be a CSV filename without a directory path")
                datafiles_directory = DATAFILES_DIRECTORY.resolve()
                csv_path = (datafiles_directory / filename).resolve()
                if not csv_path.is_relative_to(datafiles_directory):
                    raise ValueError("filename must refer to a CSV inside datafiles")
            if not csv_path.is_file():
                raise FileNotFoundError(filename)

        result = ingest_short_selling_csv(
            csv_path=csv_path,
            chunk_size=chunk_size,
            mongo_database=(
                self._mongo_database
                if self._mongo_database is not None
                else get_mongo_database()
            ),
            session_factory=self._session_factory,
        )
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
