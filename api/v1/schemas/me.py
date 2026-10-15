from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from api.v1.schemas.short_selling import SYMBOL_PATTERN


class WatchlistAdd(BaseModel):
    symbol: str = Field(min_length=1, max_length=32, pattern=SYMBOL_PATTERN)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.upper()


class WatchlistEntry(BaseModel):
    symbol: str
    security_name: str
    added_at: datetime
    last_date: date | None
    last_quantity: int | None
    baseline_quantity: float | None
    change_pct: float | None
    sparkline: list[int]


class Watchlist(BaseModel):
    items: list[WatchlistEntry]


class Alert(BaseModel):
    symbol: str
    security_name: str
    date: date
    quantity: int
    baseline_quantity: float
    ratio: float


class AlertList(BaseModel):
    items: list[Alert]
    days: int
    threshold: float
