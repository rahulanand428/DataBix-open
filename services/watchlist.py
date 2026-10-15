from datetime import UTC, date, datetime, timedelta
from statistics import fmean
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from database import SessionLocal
from models import WatchlistItem
from repositories.short_selling_repository import ShortSellingRepository

MAX_WATCHLIST_ITEMS = 50
# Spike baseline: the symbol's own previous observations (days it was shorted).
BASELINE_WINDOW = 20
MIN_BASELINE_POINTS = 5


class WatchlistFullError(Exception):
    pass


class AlreadyWatchedError(Exception):
    pass


class UnknownSymbolError(LookupError):
    pass


def _baseline(quantities: list[int]) -> float | None:
    window = quantities[-BASELINE_WINDOW:]
    return fmean(window) if len(window) >= MIN_BASELINE_POINTS else None


class WatchlistService:
    def __init__(self, session_factory: sessionmaker[Session] = SessionLocal) -> None:
        self._session_factory = session_factory
        self._repository = ShortSellingRepository(session_factory)

    def _symbols(self, user_id: int) -> list[tuple[str, datetime]]:
        with self._session_factory() as session:
            rows = session.execute(
                select(WatchlistItem.symbol, WatchlistItem.added_at)
                .where(WatchlistItem.user_id == user_id)
                .order_by(WatchlistItem.symbol)
            ).all()
        return [(row[0], row[1]) for row in rows]

    def entries(self, user_id: int) -> list[dict[str, Any]]:
        watched = self._symbols(user_id)
        names = self._repository.symbol_names(symbol for symbol, _ in watched)
        items = []
        for symbol, added_at in watched:
            points = self._repository.symbol_series(symbol, None, None)
            quantities = [point["quantity"] for point in points]
            last = points[-1] if points else None
            baseline = _baseline(quantities[:-1]) if quantities else None
            items.append(
                {
                    "symbol": symbol,
                    "security_name": names.get(symbol, symbol),
                    "added_at": added_at,
                    "last_date": last["date"] if last else None,
                    "last_quantity": last["quantity"] if last else None,
                    "baseline_quantity": round(baseline, 2) if baseline else None,
                    "change_pct": (
                        round((last["quantity"] / baseline - 1) * 100, 1)
                        if last and baseline
                        else None
                    ),
                    "sparkline": quantities[-30:],
                }
            )
        return items

    def add(self, user_id: int, symbol: str) -> None:
        if not self._repository.symbol_names([symbol]):
            raise UnknownSymbolError(symbol)
        watched = {existing for existing, _ in self._symbols(user_id)}
        if symbol in watched:
            raise AlreadyWatchedError(symbol)
        if len(watched) >= MAX_WATCHLIST_ITEMS:
            raise WatchlistFullError
        with self._session_factory.begin() as session:
            session.add(WatchlistItem(user_id=user_id, symbol=symbol, added_at=datetime.now(UTC)))

    def remove(self, user_id: int, symbol: str) -> bool:
        with self._session_factory.begin() as session:
            result = session.execute(
                delete(WatchlistItem).where(
                    WatchlistItem.user_id == user_id, WatchlistItem.symbol == symbol
                )
            )
        return bool(result.rowcount)

    def alerts(self, user_id: int, days: int, threshold: float) -> list[dict[str, Any]]:
        """Days in the recent window where a watched symbol's shorting spiked.

        A spike is a day whose quantity is at least `threshold` times the mean
        of that symbol's previous (up to 20) shorted days.
        """
        latest: date | None = self._repository.coverage()["latest_date"]
        if latest is None:
            return []
        window_start = latest - timedelta(days=days)
        watched = [symbol for symbol, _ in self._symbols(user_id)]
        names = self._repository.symbol_names(watched)
        alerts = []
        for symbol in watched:
            points = self._repository.symbol_series(symbol, None, None)
            for index, point in enumerate(points):
                if point["date"] < window_start:
                    continue
                baseline = _baseline([previous["quantity"] for previous in points[:index]])
                if not baseline:
                    continue
                ratio = point["quantity"] / baseline
                if ratio >= threshold:
                    alerts.append(
                        {
                            "symbol": symbol,
                            "security_name": names.get(symbol, symbol),
                            "date": point["date"],
                            "quantity": point["quantity"],
                            "baseline_quantity": round(baseline, 2),
                            "ratio": round(ratio, 2),
                        }
                    )
        alerts.sort(key=lambda alert: (alert["date"], alert["ratio"]), reverse=True)
        return alerts[:100]


def get_watchlist_service() -> WatchlistService:
    return WatchlistService()
