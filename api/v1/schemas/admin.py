from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from api.v1.schemas.short_selling import Coverage
from auth.schemas import BcryptPassword, UserCreate


class AdminUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    is_admin: bool
    is_active: bool
    created_at: datetime | None
    last_login_at: datetime | None


class AdminUserList(BaseModel):
    items: list[AdminUser]


class AdminUserCreate(UserCreate):
    is_admin: bool = False


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_admin: bool | None = None
    is_active: bool | None = None


class PasswordReset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: BcryptPassword


class IngestionRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    status: Literal["running", "succeeded", "failed"]
    triggered_by: str
    started_at: datetime
    finished_at: datetime | None
    mongo_rows: int | None
    postgres_rows: int | None
    skipped_rows: int | None
    error: str | None


class IngestionRunList(BaseModel):
    items: list[IngestionRunOut]


class SourceFile(BaseModel):
    filename: str
    size_bytes: int
    modified_at: datetime
    is_default: bool
    last_run: IngestionRunOut | None


class SourceFileList(BaseModel):
    items: list[SourceFile]


class ComponentStatus(BaseModel):
    name: str
    status: Literal["ok", "error"]
    latency_ms: float
    detail: str | None


class SystemStatus(BaseModel):
    checked_at: datetime
    started_at: datetime
    version: str
    components: list[ComponentStatus]
    coverage: Coverage | None
    last_ingestion: IngestionRunOut | None
    data_age_days: int | None
    latest_data_date: date | None
