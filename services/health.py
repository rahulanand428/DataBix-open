import time
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import text

from database import engine, get_mongo_database, get_redis_client

STARTED_AT = datetime.now(UTC)


def _timed(name: str, probe: Callable[[], object]) -> dict[str, object]:
    started = time.perf_counter()
    try:
        probe()
    except Exception as error:  # noqa: BLE001 - report any failure, never crash the page
        # Only the exception type: messages can contain hosts or credentials.
        return {
            "name": name,
            "status": "error",
            "latency_ms": round((time.perf_counter() - started) * 1000, 1),
            "detail": type(error).__name__,
        }
    return {
        "name": name,
        "status": "ok",
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
        "detail": None,
    }


def _postgres() -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def check_components() -> list[dict[str, object]]:
    return [
        {"name": "api", "status": "ok", "latency_ms": 0.0, "detail": None},
        _timed("postgres", _postgres),
        _timed("redis", lambda: get_redis_client().ping()),
        _timed("mongodb", lambda: get_mongo_database().command("ping")),
    ]


def get_health_checker() -> Callable[[], list[dict[str, object]]]:
    return check_components
