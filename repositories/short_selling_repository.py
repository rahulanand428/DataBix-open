from collections.abc import Iterable, Iterator
from datetime import date
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy import ColumnElement, Select, desc, distinct, func, or_, select
from sqlalchemy.orm import Session, sessionmaker

from models import ShortSellingMaster

Row = ShortSellingMaster

# Public sort keys mapped to ORDER BY clauses; a stable tiebreaker always follows.
SORT_ORDERS: dict[str, tuple[ColumnElement[Any], ...]] = {
    "-date": (Row.trade_date.desc(), Row.symbol, Row.id),
    "date": (Row.trade_date.asc(), Row.symbol, Row.id),
    "symbol": (Row.symbol.asc(), Row.trade_date.desc(), Row.id),
    "-symbol": (Row.symbol.desc(), Row.trade_date.desc(), Row.id),
    "quantity": (Row.quantity.asc(), Row.trade_date.desc(), Row.id),
    "-quantity": (Row.quantity.desc(), Row.trade_date.desc(), Row.id),
}


def _date_conditions(date_from: date | None, date_to: date | None) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    if date_from is not None:
        conditions.append(Row.trade_date >= date_from)
    if date_to is not None:
        conditions.append(Row.trade_date <= date_to)
    return conditions


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class ShortSellingRepository:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def insert_missing(self, records: Iterable[dict[str, Any]]) -> int:
        rows = [
            {
                "source_hash": record["source_hash"],
                "source_file": record["source_file"],
                "source_row_number": record["source_row_number"],
                "date": record["trade_date"],
                "symbol": record["symbol"],
                "security_name": record["security_name"],
                "quantity": record["quantity"],
            }
            for record in records
        ]
        if not rows:
            return 0

        table = ShortSellingMaster.__table__
        statement = pg_insert(table).values(rows)
        statement = statement.on_conflict_do_nothing(
            index_elements=[
                table.c.source_file,
                table.c.source_hash,
                table.c.source_row_number,
            ]
        )
        with self._session_factory.begin() as session:
            result = session.execute(statement)
        if result.rowcount is None or result.rowcount < 0:
            return len(rows)
        return result.rowcount

    def _filtered(
        self,
        date_from: date | None,
        date_to: date | None,
        symbol: str | None,
    ) -> list[ColumnElement[bool]]:
        conditions = _date_conditions(date_from, date_to)
        if symbol is not None:
            conditions.append(Row.symbol == symbol)
        return conditions

    def get_page(
        self,
        date_from: date | None,
        date_to: date | None,
        symbol: str | None,
        limit: int,
        offset: int,
        sort: str = "-date",
    ) -> tuple[list[ShortSellingMaster], int]:
        conditions = self._filtered(date_from, date_to, symbol)
        with self._session_factory() as session:
            total = session.scalar(
                select(func.count()).select_from(ShortSellingMaster).where(*conditions)
            ) or 0
            statement = (
                select(ShortSellingMaster)
                .where(*conditions)
                .order_by(*SORT_ORDERS[sort])
                .limit(limit)
                .offset(offset)
            )
            records = list(session.scalars(statement).all())
        return records, total

    def iter_rows(
        self,
        date_from: date | None,
        date_to: date | None,
        symbol: str | None,
        sort: str,
        limit: int,
    ) -> Iterator[tuple[date, str, str, int]]:
        """Stream rows for CSV export without loading them all into memory."""
        statement = (
            select(Row.trade_date, Row.symbol, Row.security_name, Row.quantity)
            .where(*self._filtered(date_from, date_to, symbol))
            .order_by(*SORT_ORDERS[sort])
            .limit(limit)
            .execution_options(yield_per=1_000)
        )
        with self._session_factory() as session:
            for row in session.execute(statement):
                yield row.trade_date, row.symbol, row.security_name, row.quantity

    def count(
        self, date_from: date | None, date_to: date | None, symbol: str | None
    ) -> int:
        with self._session_factory() as session:
            return session.scalar(
                select(func.count())
                .select_from(Row)
                .where(*self._filtered(date_from, date_to, symbol))
            ) or 0

    def coverage(self) -> dict[str, Any]:
        with self._session_factory() as session:
            row = session.execute(
                select(
                    func.min(Row.trade_date),
                    func.max(Row.trade_date),
                    func.count(),
                    func.count(distinct(Row.symbol)),
                )
            ).one()
        return {
            "earliest_date": row[0],
            "latest_date": row[1],
            "records": row[2] or 0,
            "symbols": row[3] or 0,
        }

    def range_totals(self, date_from: date | None, date_to: date | None) -> dict[str, int]:
        with self._session_factory() as session:
            row = session.execute(
                select(
                    func.sum(Row.quantity),
                    func.count(),
                    func.count(distinct(Row.symbol)),
                    func.count(distinct(Row.trade_date)),
                ).where(*_date_conditions(date_from, date_to))
            ).one()
        return {
            "total_quantity": int(row[0] or 0),
            "records": row[1] or 0,
            "symbols": row[2] or 0,
            "trading_days": row[3] or 0,
        }

    def daily_totals(
        self, date_from: date | None, date_to: date | None
    ) -> list[dict[str, Any]]:
        statement = (
            select(
                Row.trade_date,
                func.sum(Row.quantity),
                func.count(),
                func.count(distinct(Row.symbol)),
            )
            .where(*_date_conditions(date_from, date_to))
            .group_by(Row.trade_date)
            .order_by(Row.trade_date)
        )
        with self._session_factory() as session:
            rows = session.execute(statement).all()
        return [
            {
                "date": row[0],
                "total_quantity": int(row[1] or 0),
                "records": row[2],
                "symbols": row[3],
            }
            for row in rows
        ]

    def _symbol_totals(self) -> Select[Any]:
        total = func.sum(Row.quantity).label("total_quantity")
        return select(
            Row.symbol,
            func.max(Row.security_name).label("security_name"),
            total,
            func.count(distinct(Row.trade_date)).label("trading_days"),
            func.max(Row.trade_date).label("last_date"),
        ).group_by(Row.symbol)

    def top_symbols(
        self, date_from: date | None, date_to: date | None, limit: int
    ) -> list[dict[str, Any]]:
        statement = (
            self._symbol_totals()
            .where(*_date_conditions(date_from, date_to))
            .order_by(desc("total_quantity"), Row.symbol)
            .limit(limit)
        )
        with self._session_factory() as session:
            rows = session.execute(statement).mappings().all()
        return [
            {
                "symbol": row["symbol"],
                "security_name": row["security_name"],
                "total_quantity": int(row["total_quantity"] or 0),
                "trading_days": row["trading_days"],
            }
            for row in rows
        ]

    def search_symbols(
        self, query: str | None, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int]:
        conditions: list[ColumnElement[bool]] = []
        if query:
            escaped = _escape_like(query)
            conditions.append(
                or_(
                    Row.symbol.ilike(f"{escaped}%", escape="\\"),
                    Row.security_name.ilike(f"%{escaped}%", escape="\\"),
                )
            )
        grouped = self._symbol_totals().where(*conditions)
        with self._session_factory() as session:
            total = session.scalar(select(func.count()).select_from(grouped.subquery())) or 0
            rows = (
                session.execute(
                    grouped.order_by(desc("total_quantity"), Row.symbol)
                    .limit(limit)
                    .offset(offset)
                )
                .mappings()
                .all()
            )
        items = [
            {
                "symbol": row["symbol"],
                "security_name": row["security_name"],
                "total_quantity": int(row["total_quantity"] or 0),
                "trading_days": row["trading_days"],
                "last_date": row["last_date"],
            }
            for row in rows
        ]
        return items, total

    def symbol_series(
        self, symbol: str, date_from: date | None, date_to: date | None
    ) -> list[dict[str, Any]]:
        statement = (
            select(Row.trade_date, func.sum(Row.quantity))
            .where(Row.symbol == symbol, *_date_conditions(date_from, date_to))
            .group_by(Row.trade_date)
            .order_by(Row.trade_date)
        )
        with self._session_factory() as session:
            rows = session.execute(statement).all()
        return [{"date": row[0], "quantity": int(row[1] or 0)} for row in rows]

    def symbol_names(self, symbols: Iterable[str]) -> dict[str, str]:
        wanted = list(symbols)
        if not wanted:
            return {}
        statement = (
            select(Row.symbol, func.max(Row.security_name))
            .where(Row.symbol.in_(wanted))
            .group_by(Row.symbol)
        )
        with self._session_factory() as session:
            return {row[0]: row[1] for row in session.execute(statement)}
