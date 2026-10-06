from datetime import date as DateValue

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ShortSellingFilters(BaseModel):
    date_from: DateValue | None = None
    date_to: DateValue | None = None
    symbol: str | None = Field(default=None, min_length=1, max_length=32)
    limit: int = Field(default=100, ge=1, le=1_000)
    offset: int = Field(default=0, ge=0)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else value

    @model_validator(mode="after")
    def validate_date_range(self) -> "ShortSellingFilters":
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must be on or before date_to")
        return self


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
