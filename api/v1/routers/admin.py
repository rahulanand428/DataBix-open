import json
import logging
import os
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from api.v1.schemas.admin import (
    AdminUser,
    AdminUserCreate,
    AdminUserList,
    AdminUserUpdate,
    ComponentStatus,
    IngestionRunList,
    IngestionRunOut,
    PasswordReset,
    SourceFile,
    SourceFileList,
    SystemStatus,
)
from api.v1.schemas.short_selling import Coverage
from auth.dependencies import DatabaseSession, get_current_admin
from auth.sessions import revoke_user_sessions
from auth.utils import get_password_hash
from ingestion.short_selling import DEFAULT_SHORT_SELLING_CSV
from models import User
from services import short_selling_service as short_selling_module
from services.branding import BrandingConfig, BrandingResponse, load_branding, reset_branding, save_branding
from services.health import STARTED_AT, get_health_checker
from services.ingestion_runs import IngestionRunRecorder, get_ingestion_recorder
from services.short_selling_service import ShortSellingService, get_short_selling_service

router = APIRouter(prefix="/admin", tags=["admin"])
audit_logger = logging.getLogger("databix.audit")

Admin = Annotated[User, Depends(get_current_admin)]
Recorder = Annotated[IngestionRunRecorder, Depends(get_ingestion_recorder)]


def _audit(event: str, admin: User, **details: object) -> None:
    audit_logger.info(json.dumps({"event": event, "user": admin.username, **details}, default=str))


@router.get("/status", response_model=SystemStatus)
def system_status(
    _admin: Admin,
    recorder: Recorder,
    service: Annotated[ShortSellingService, Depends(get_short_selling_service)],
    checker: Annotated[Callable[[], list[dict[str, object]]], Depends(get_health_checker)],
) -> SystemStatus:
    components = [ComponentStatus.model_validate(item) for item in checker()]
    database_ok = next((c.status for c in components if c.name == "postgres"), "error") == "ok"
    coverage: Coverage | None = service.coverage() if database_ok else None
    runs = recorder.recent(1) if database_ok else []
    latest = coverage.latest_date if coverage else None
    return SystemStatus(
        checked_at=datetime.now(UTC),
        started_at=STARTED_AT,
        version=os.getenv("APP_VERSION", "dev"),
        components=components,
        coverage=coverage,
        last_ingestion=IngestionRunOut.model_validate(runs[0]) if runs else None,
        data_age_days=(datetime.now(UTC).date() - latest).days if latest else None,
        latest_data_date=latest,
    )


@router.get("/sources", response_model=SourceFileList)
def list_sources(_admin: Admin, recorder: Recorder) -> SourceFileList:
    directory = short_selling_module.DATAFILES_DIRECTORY
    runs = recorder.recent(200)
    latest_by_file: dict[str, IngestionRunOut] = {}
    for run in runs:
        name = DEFAULT_SHORT_SELLING_CSV.name if run.filename == "(default)" else run.filename
        latest_by_file.setdefault(name, IngestionRunOut.model_validate(run))
    items = []
    if directory.is_dir():
        for path in sorted(directory.glob("*.csv")):
            if not path.is_file():
                continue
            stat = path.stat()
            items.append(
                SourceFile(
                    filename=path.name,
                    size_bytes=stat.st_size,
                    modified_at=datetime.fromtimestamp(stat.st_mtime, UTC),
                    is_default=path.name == DEFAULT_SHORT_SELLING_CSV.name,
                    last_run=latest_by_file.get(path.name),
                )
            )
    return SourceFileList(items=items)


@router.get("/ingestions", response_model=IngestionRunList)
def list_ingestions(
    _admin: Admin, recorder: Recorder, limit: Annotated[int, Query(ge=1, le=200)] = 50
) -> IngestionRunList:
    return IngestionRunList(
        items=[IngestionRunOut.model_validate(run) for run in recorder.recent(limit)]
    )


@router.get("/users", response_model=AdminUserList)
def list_users(_admin: Admin, db: DatabaseSession) -> AdminUserList:
    users = db.scalars(select(User).order_by(User.username)).all()
    return AdminUserList(items=[AdminUser.model_validate(user) for user in users])


@router.post("/users", response_model=AdminUser, status_code=status.HTTP_201_CREATED)
def create_user(payload: AdminUserCreate, admin: Admin, db: DatabaseSession) -> AdminUser:
    if db.scalar(select(User).where(User.username == payload.username)) is not None:
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(
        username=payload.username,
        hashed_password=get_password_hash(payload.password),
        is_admin=payload.is_admin,
        created_at=datetime.now(UTC),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists") from error
    db.refresh(user)
    _audit("user_created", admin, target=user.username, is_admin=user.is_admin)
    return AdminUser.model_validate(user)


def _get_user_or_404(db: DatabaseSession, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=AdminUser)
def update_user(
    payload: AdminUserUpdate,
    admin: Admin,
    db: DatabaseSession,
    user_id: Annotated[int, PathParam(ge=1)],
) -> AdminUser:
    user = _get_user_or_404(db, user_id)
    if user.id == admin.id and (payload.is_admin is False or payload.is_active is False):
        raise HTTPException(
            status_code=400,
            detail="You cannot remove your own administrator access or deactivate yourself",
        )
    changes = payload.model_dump(exclude_none=True)
    for field, value in changes.items():
        setattr(user, field, value)
    if payload.is_active is False:
        revoke_user_sessions(db, user.id)
    db.commit()
    db.refresh(user)
    _audit("user_updated", admin, target=user.username, changes=changes)
    return AdminUser.model_validate(user)


@router.post("/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    payload: PasswordReset,
    admin: Admin,
    db: DatabaseSession,
    user_id: Annotated[int, PathParam(ge=1)],
) -> Response:
    user = _get_user_or_404(db, user_id)
    user.hashed_password = get_password_hash(payload.password)
    user.tokens_valid_after = datetime.now(UTC)
    revoke_user_sessions(db, user.id)
    db.commit()
    _audit("password_reset", admin, target=user.username)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/branding", response_model=BrandingResponse)
def get_branding_details(_admin: Admin, db: DatabaseSession) -> BrandingResponse:
    return load_branding(db)


@router.put("/branding", response_model=BrandingResponse)
def update_branding(payload: BrandingConfig, admin: Admin, db: DatabaseSession) -> BrandingResponse:
    result = save_branding(db, payload, admin.username)
    _audit("branding_updated", admin, product_name=payload.product_name)
    return result


@router.delete("/branding", response_model=BrandingResponse)
def delete_branding(admin: Admin, db: DatabaseSession) -> BrandingResponse:
    result = reset_branding(db)
    _audit("branding_reset", admin)
    return result
