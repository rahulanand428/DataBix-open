"""Load demo data for local development, screenshots and sales demos.

    python -m scripts.seed_demo --password-env DEMO_PASSWORD [--brand branding/examples/acme.json]

Creates demo accounts (admin, analyst, a deactivated user), ingests every CSV
in datafiles/ through the real ingestion path (falling back to PostgreSQL only
when MongoDB is unreachable), records the runs in the admin history, fills
watchlists with symbols that have recent spikes, and optionally applies a
branding file. Safe to re-run. Never point this at production.
"""

import argparse
import json
import os
import secrets
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select, update

from auth.utils import get_password_hash
from database import Base, SessionLocal, engine
from ingestion.short_selling import _read_normalized_chunks  # noqa: PLC2701 - reuse the parser
from models import IngestionRun, User
from models.schema import upgrade_schema
from repositories.short_selling_repository import ShortSellingRepository
from services.branding import BrandingConfig, save_branding
from services.ingestion_runs import IngestionRunRecorder
from services.short_selling_service import DATAFILES_DIRECTORY, ShortSellingService
from services.watchlist import WatchlistService

DEMO_USERS = (
    ("admin", True, True, timedelta(minutes=12)),
    ("analyst", False, True, timedelta(hours=5)),
    ("research.desk", False, True, timedelta(days=2)),
    ("former.employee", False, False, timedelta(days=41)),
)


def ensure_users(password: str) -> None:
    now = datetime.now(UTC)
    with SessionLocal.begin() as session:
        for index, (username, admin, active, last_login) in enumerate(DEMO_USERS):
            user = session.scalar(select(User).where(User.username == username))
            if user is None:
                user = User(username=username, hashed_password=get_password_hash(password))
                session.add(user)
            user.is_admin = admin
            user.is_active = active
            user.created_at = user.created_at or now - timedelta(days=90 - index * 7)
            user.last_login_at = now - last_login
    print(f"Users ready: {', '.join(name for name, *_ in DEMO_USERS)}")


def ingest_all(skip_mongo: bool, names: list[str] | None) -> None:
    recorder = IngestionRunRecorder()
    service = ShortSellingService()
    # Rows are de-duplicated per source file, so files with overlapping dates
    # double-count; pass --files to load only non-overlapping ones.
    files = sorted(DATAFILES_DIRECTORY.glob("*.csv"), key=lambda path: path.stat().st_size, reverse=True)
    if names:
        files = [path for path in files if path.name in names]
    for path in files:
        run_id = recorder.start(path.name, "admin")
        try:
            if skip_mongo:
                rows = 0
                repository = ShortSellingRepository(SessionLocal)
                for _, records, _ in _read_normalized_chunks(path, 1_000, "seed"):
                    rows += repository.insert_missing(records)
                print(f"{path.name}: {rows} rows inserted into PostgreSQL (MongoDB skipped)")
                with SessionLocal.begin() as session:
                    session.execute(
                        update(IngestionRun)
                        .where(IngestionRun.id == run_id)
                        .values(status="succeeded", finished_at=datetime.now(UTC), mongo_rows=0, postgres_rows=rows, skipped_rows=0)
                    )
            else:
                result = service.ingest_path(path)
                recorder.finish(run_id, result)
                print(f"{path.name}: {result.postgres_rows} new rows, {result.skipped_rows} skipped")
        except Exception as error:  # noqa: BLE001 - record and continue
            recorder.fail(run_id, type(error).__name__)
            print(f"{path.name}: failed ({type(error).__name__})", file=sys.stderr)

    # A realistic failure in the history: a file that was never uploaded.
    failed = recorder.start("Short-Selling-01-10-2026-to-15-10-2026.csv", "admin")
    recorder.fail(failed, "CSV file not found")

    # Spread the runs out so the history reads like real use.
    with SessionLocal.begin() as session:
        runs = session.scalars(select(IngestionRun).order_by(IngestionRun.id)).all()
        now = datetime.now(UTC)
        for offset, run in zip((timedelta(days=9), timedelta(days=2, hours=3), timedelta(hours=6)), runs[-3:]):
            duration = (run.finished_at - run.started_at) if run.finished_at and run.started_at else timedelta(seconds=1)
            run.started_at = now - offset
            run.finished_at = run.started_at + duration


def fill_watchlists() -> None:
    watchlists = WatchlistService()
    repository = ShortSellingRepository(SessionLocal)
    candidates = [row["symbol"] for row in repository.top_symbols(None, None, 80)]
    with SessionLocal() as session:
        users = {user.username: user.id for user in session.scalars(select(User))}

    # Prefer symbols whose latest shorting spiked against their own history.
    scored = []
    for symbol in candidates:
        points = repository.symbol_series(symbol, None, None)
        quantities = [point["quantity"] for point in points]
        if len(quantities) < 8:
            continue
        baseline = sum(quantities[-21:-1]) / len(quantities[-21:-1])
        scored.append((quantities[-1] / baseline if baseline else 0, symbol))
    spiking = [symbol for _, symbol in sorted(scored, reverse=True)[:3]]
    steady = [symbol for symbol in candidates[:4] if symbol not in spiking]
    for username, symbols in (("admin", spiking + steady[:3]), ("analyst", steady[:2] + spiking[:1])):
        for symbol in symbols:
            try:
                watchlists.add(users[username], symbol)
            except Exception:  # noqa: BLE001 - already watched
                pass
    print(f"Watchlists ready (spiking: {', '.join(spiking)})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--password-env", default="DEMO_PASSWORD", help="Environment variable holding the demo password")
    parser.add_argument("--brand", type=Path, help="Branding JSON file to apply (e.g. branding/examples/acme.json)")
    parser.add_argument("--skip-mongo", action="store_true", help="Load PostgreSQL only (no MongoDB available)")
    parser.add_argument("--skip-ingest", action="store_true")
    parser.add_argument("--files", nargs="+", help="Only ingest these CSV basenames from datafiles/")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    upgrade_schema(engine)

    password = os.getenv(args.password_env)
    if not password:
        password = secrets.token_urlsafe(12)
        print(f"No ${args.password_env} set; generated demo password: {password}")
    ensure_users(password)
    if not args.skip_ingest:
        ingest_all(args.skip_mongo, args.files)
    fill_watchlists()
    if args.brand:
        config = BrandingConfig.model_validate(json.loads(args.brand.read_text(encoding="utf-8")))
        with SessionLocal() as session:
            save_branding(session, config, "admin")
        print(f"Applied branding from {args.brand}")


if __name__ == "__main__":
    main()
