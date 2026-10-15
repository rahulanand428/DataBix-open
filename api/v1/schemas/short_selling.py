from datetime import date as DateValue
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


MAX_OFFSET = 1_000_000
# NSE symbols use letters, digits, "&" and "-" (e.g. M&M, BAJAJ-AUTO).
SYMBOL_PATTERN = r"^[A-Za-z0-9&._-]+$"
SortOrder = Literal["-date", "date", "symbol", "-symbol", "quantity", "-quantity"]


class DateRangeFilters(BaseModel):
    date_from: DateValue | None = None
    date_to: DateValue | None = None

    @model_validator(mode="after")
    def validate_date_range(self) -> "DateRangeFilters":
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must be on or before date_to")
        return self


class ShortSellingFilters(DateRangeFilters):
    symbol: str | None = Field(
        default=None, min_length=1, max_length=32, pattern=SYMBOL_PATTERN
    )
    limit: int = Field(default=100, ge=1, le=1_000)
    offset: int = Field(default=0, ge=0, le=MAX_OFFSET)
    sort: SortOrder = "-date"

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else value


class ExportFilters(DateRangeFilters):
    symbol: str | None = Field(
        default=None, min_length=1, max_length=32, pattern=SYMBOL_PATTERN
    )
    sort: SortOrder = "-date"

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else value


class TopSymbolFilters(DateRangeFilters):
    limit: int = Field(default=10, ge=1, le=50)


class SymbolSearchFilters(BaseModel):
    q: str | None = Field(default=None, max_length=64)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=MAX_OFFSET)

    @field_validator("q")
    @classmethod
    def normalize_query(cls, value: str | None) -> str | None:
        stripped = value.strip() if value else ""
        return stripped or None


class ShortSellingRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    date: DateValue = Field(validation_alias="trade_date")
    symbol: str
    security_name: str
    quantity: int


class ShortSellingPage(BaseModel):
    items: list[ShortSellingRecord]
    total: int
    limit: int
    offset: int


class ShortSellingIngestionResponse(BaseModel):
    source_file: str
    mongo_rows: int
    postgres_rows: int
    skipped_rows: int


class Coverage(BaseModel):
    earliest_date: DateValue | None
    latest_date: DateValue | None
    records: int
    symbols: int


class DayTotal(BaseModel):
    date: DateValue
    total_quantity: int
    records: int
    symbols: int


class DailyTotals(BaseModel):
    items: list[DayTotal]


class TopSymbol(BaseModel):
    symbol: str
    security_name: str
    total_quantity: int
    trading_days: int


class TopSymbols(BaseModel):
    items: list[TopSymbol]


class PeakDay(BaseModel):
    date: DateValue
    total_quantity: int


class Summary(BaseModel):
    date_from: DateValue | None
    date_to: DateValue | None
    total_quantity: int
    records: int
    symbols: int
    trading_days: int
    average_daily_quantity: float
    peak_day: PeakDay | None
    top_symbol: TopSymbol | None


class SymbolListItem(BaseModel):
    symbol: str
    security_name: str
    total_quantity: int
    trading_days: int
    last_date: DateValue


class SymbolList(BaseModel):
    items: list[SymbolListItem]
    total: int
    limit: int
    offset: int


class SymbolStats(BaseModel):
    symbol: str
    security_name: str
    total_quantity: int
    trading_days: int
    average_quantity: float
    max_quantity: int
    max_date: DateValue
    first_date: DateValue
    last_date: DateValue


class SeriesPoint(BaseModel):
    date: DateValue
    quantity: int


class SymbolSeries(BaseModel):
    symbol: str
    items: list[SeriesPoint]
