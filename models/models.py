from datetime import date as DateValue

from sqlalchemy import BigInteger, Date, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from database import Base

# typed ShortSellingMaster ORM table

class ShortSellingMaster(Base):
    __tablename__ = "short_selling_master"
    __table_args__ = (
        UniqueConstraint(
            "source_file",
            "source_hash",
            "source_row_number",
            name="uq_short_selling_source_row",
        ),
        Index("ix_short_selling_date_symbol", "date", "symbol"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    source_file: Mapped[str] = mapped_column(String(255), nullable=False)
    source_row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    trade_date: Mapped[DateValue] = mapped_column("date", Date, nullable=False)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    security_name: Mapped[str] = mapped_column(String(256), nullable=False)
    quantity: Mapped[int] = mapped_column(BigInteger, nullable=False)
