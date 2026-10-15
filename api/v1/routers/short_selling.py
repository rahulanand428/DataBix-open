import json
import logging
from typing import Annotated
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from api.v1.schemas.short_selling import (
    ShortSellingFilters,
    ShortSellingIngestionResponse,
    ShortSellingPage,
)
from auth.dependencies import get_current_admin, get_current_user
from services.short_selling_service import (
    IngestionInProgressError,
    InvalidIngestionFilenameError,
    ShortSellingService,
    get_short_selling_service,
)
from models.user_models import User


router = APIRouter(prefix="/short-selling", tags=["short-selling"])
audit_logger = logging.getLogger("databix.audit")


@router.post("/ingest", response_model=ShortSellingIngestionResponse)
def ingest_short_selling(
    request: Request,
    service: Annotated[ShortSellingService, Depends(get_short_selling_service)],
    admin: Annotated[User, Depends(get_current_admin)],
    filename: Annotated[str | None, Query(min_length=5, max_length=255)] = None,
) -> ShortSellingIngestionResponse:
    if filename is not None and (
        Path(filename).name != filename
        or "/" in filename
        or "\\" in filename
        or Path(filename).suffix.lower() != ".csv"
    ):
        raise HTTPException(
            status_code=400,
            detail="filename must be a CSV filename without a directory path",
        )
    audit_logger.info(
        json.dumps(
            {
                "event": "ingest_requested",
                "user": admin.username,
                "client_ip": request.client.host if request.client else None,
                "filename": filename,
            }
        )
    )
    try:
        result = service.ingest_csv(filename=filename)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="CSV file not found") from error
    except IngestionInProgressError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except InvalidIngestionFilenameError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ValueError as error:
        # Parser errors can quote raw file content; keep that in server logs.
        audit_logger.warning("CSV ingestion failed validation", exc_info=True)
        raise HTTPException(
            status_code=400, detail="CSV file failed validation; see server logs"
        ) from error
    audit_logger.info(
        json.dumps(
            {
                "event": "ingest_completed",
                "user": admin.username,
                "source_file": result.source_file,
                "postgres_rows": result.postgres_rows,
            }
        )
    )
    return ShortSellingIngestionResponse.model_validate(result.__dict__)


@router.get("", response_model=ShortSellingPage)
def list_short_selling(
    filters: Annotated[ShortSellingFilters, Query()],
    service: Annotated[ShortSellingService, Depends(get_short_selling_service)],
    _current_user: Annotated[User, Depends(get_current_user)],
) -> ShortSellingPage:
    return service.list_records(
        date_from=filters.date_from,
        date_to=filters.date_to,
        symbol=filters.symbol,
        limit=filters.limit,
        offset=filters.offset,
    )
