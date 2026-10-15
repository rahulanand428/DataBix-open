from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from database import SessionLocal
from ingestion.short_selling import IngestionResult
from models import IngestionRun


class IngestionRunRecorder:
    """Persists one row per ingestion attempt for the admin console's history."""

    def __init__(self, session_factory: sessionmaker[Session] = SessionLocal) -> None:
        self._session_factory = session_factory

    def start(self, filename: str, triggered_by: str) -> int:
        with self._session_factory.begin() as session:
            run = IngestionRun(
                filename=filename,
                status="running",
                triggered_by=triggered_by,
                started_at=datetime.now(UTC),
            )
            session.add(run)
            session.flush()
            return run.id

    def finish(self, run_id: int, result: IngestionResult) -> None:
        with self._session_factory.begin() as session:
            run = session.get(IngestionRun, run_id)
            if run is None:
                return
            run.status = "succeeded"
            run.finished_at = datetime.now(UTC)
            run.mongo_rows = result.mongo_rows
            run.postgres_rows = result.postgres_rows
            run.skipped_rows = result.skipped_rows

    def fail(self, run_id: int, reason: str) -> None:
        with self._session_factory.begin() as session:
            run = session.get(IngestionRun, run_id)
            if run is None:
                return
            run.status = "failed"
            run.finished_at = datetime.now(UTC)
            run.error = reason[:255]

    def recent(self, limit: int = 50) -> list[IngestionRun]:
        with self._session_factory() as session:
            return list(
                session.scalars(
                    select(IngestionRun).order_by(IngestionRun.started_at.desc()).limit(limit)
                )
            )


def get_ingestion_recorder() -> IngestionRunRecorder:
    return IngestionRunRecorder()
