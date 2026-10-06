from collections.abc import Iterable
from datetime import date
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from models import ShortSellingMaster


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

    def get_page(
        self,
        date_from: date | None,
        date_to: date | None,
        symbol: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[ShortSellingMaster], int]:
        conditions = []
        if date_from is not None:
            conditions.append(ShortSellingMaster.trade_date >= date_from)
        if date_to is not None:
            conditions.append(ShortSellingMaster.trade_date <= date_to)
        if symbol is not None:
            conditions.append(ShortSellingMaster.symbol == symbol)

        with self._session_factory() as session:
            total = session.scalar(
                select(func.count()).select_from(ShortSellingMaster).where(*conditions)
            ) or 0
            statement = (
                select(ShortSellingMaster)
                .where(*conditions)
                .order_by(
                    ShortSellingMaster.trade_date.desc(),
                    ShortSellingMaster.symbol,
                    ShortSellingMaster.id,
                )
                .limit(limit)
                .offset(offset)
            )
            records = list(session.scalars(statement).all())
        return records, total
