from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
from pathlib import Path
from typing import Any

import pandas as pd
from pymongo import UpdateOne
from pymongo.database import Database as MongoDatabase
from sqlalchemy.orm import Session, sessionmaker

from database import SessionLocal, get_mongo_database
from repositories.short_selling_repository import ShortSellingRepository


CSV_COLUMNS = ("Date", "Symbol", "Security Name", "Quantity")
MONGODB_COLLECTION = "short_selling_history"
DEFAULT_SHORT_SELLING_CSV = (
    Path(__file__).resolve().parents[1]
    / "datafiles"
    / "Short-Selling-01-04-2026-to-01-10-2026.csv"
)


@dataclass(frozen=True)
class IngestionResult:
    source_file: str
    mongo_rows: int
    postgres_rows: int
    skipped_rows: int


def _read_normalized_chunks(
    csv_path: Path, chunk_size: int, source_hash: str
) -> Iterator[tuple[list[dict[str, str]], list[dict[str, Any]], int]]:
    row_offset = 0
    for chunk in pd.read_csv(
        csv_path, dtype=str, keep_default_na=False, chunksize=chunk_size
    ):
        chunk.columns = [str(column).strip() for column in chunk.columns]
        if tuple(chunk.columns) != CSV_COLUMNS:
            raise ValueError(
                f"Expected CSV columns {CSV_COLUMNS}; received {tuple(chunk.columns)}"
            )

        raw_records: list[dict[str, str]] = []
        normalized_records: list[dict[str, Any]] = []
        skipped_rows = 0
        for row_number, row in enumerate(
            chunk.to_dict(orient="records"), start=row_offset + 1
        ):
            raw = {column: str(row[column]).strip() for column in CSV_COLUMNS}
            if not all(raw.values()):
                raise ValueError(f"Empty required value in CSV chunk row {row_number}")
            if raw["Quantity"] == "-":
                skipped_rows += 1
                continue
            try:
                trade_date = datetime.strptime(raw["Date"], "%d-%b-%Y").date()
                quantity = int(raw["Quantity"].replace(",", ""))
            except ValueError as error:
                raise ValueError(
                    f"Invalid date or quantity in CSV chunk row {row_number}: {raw}"
                ) from error

            normalized_records.append(
                {
                    "source_hash": source_hash,
                    "source_file": csv_path.name,
                    "source_row_number": row_number,
                    "trade_date": trade_date,
                    "symbol": raw["Symbol"].upper(),
                    "security_name": raw["Security Name"],
                    "quantity": quantity,
                }
            )
            raw_records.append(raw)
        row_offset += len(chunk)
        yield raw_records, normalized_records, skipped_rows


def _mongo_operations(
    raw_records: list[dict[str, str]],
    normalized_records: list[dict[str, Any]],
    source_file: str,
    ingested_at: str,
) -> list[UpdateOne]:
    operations: list[UpdateOne] = []
    for raw, normalized in zip(raw_records, normalized_records, strict=True):
        record_id = (
            f"{source_file}|{normalized['source_hash']}|"
            f"{normalized['source_row_number']}"
        )
        document = {
            "source_hash": normalized["source_hash"],
            "source_file": source_file,
            "source_row_number": normalized["source_row_number"],
            "ingested_at": ingested_at,
            "raw": raw,
            "normalized": {
                "date": normalized["trade_date"].isoformat(),
                "symbol": normalized["symbol"],
                "security_name": normalized["security_name"],
                "quantity": normalized["quantity"],
            },
        }
        operations.append(UpdateOne({"_id": record_id}, {"$set": document}, upsert=True))
    return operations


def ingest_short_selling_csv(
    csv_path: str | Path = DEFAULT_SHORT_SELLING_CSV,
    chunk_size: int = 1_000,
    mongo_database: MongoDatabase | None = None,
    session_factory: sessionmaker[Session] = SessionLocal,
) -> IngestionResult:
    """Store historical rows in MongoDB before inserting new PostgreSQL rows."""
    if chunk_size < 1:
        raise ValueError("chunk_size must be greater than zero")

    path = Path(csv_path)
    mongo = mongo_database if mongo_database is not None else get_mongo_database()
    collection = mongo[MONGODB_COLLECTION]
    source_file = path.name
    with path.open("rb") as source:
        source_hash = hashlib.file_digest(source, "sha256").hexdigest()
    ingested_at = datetime.now(UTC).isoformat()
    mongo_rows = 0
    skipped_rows = 0

    for raw_records, normalized_records, skipped in _read_normalized_chunks(
        path, chunk_size, source_hash
    ):
        skipped_rows += skipped
        if raw_records:
            collection.bulk_write(
                _mongo_operations(raw_records, normalized_records, source_file, ingested_at),
                ordered=False,
            )
            mongo_rows += len(raw_records)

    repository = ShortSellingRepository(session_factory)
    postgres_rows = 0
    for _, normalized_records, _ in _read_normalized_chunks(path, chunk_size, source_hash):
        postgres_rows += repository.insert_missing(normalized_records)

    return IngestionResult(
        source_file=source_file,
        mongo_rows=mongo_rows,
        postgres_rows=postgres_rows,
        skipped_rows=skipped_rows,
    )
