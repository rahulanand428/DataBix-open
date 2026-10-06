from typing import Annotated
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

from api.v1.schemas.short_selling import (
    ShortSellingFilters,
    ShortSellingIngestionResponse,
    ShortSellingPage,
)
from auth.dependencies import get_current_user
from services.short_selling_service import (
    ShortSellingService,
    get_short_selling_service,
)
from models.user_models import User


router = APIRouter(prefix="/short-selling", tags=["short-selling"])


@router.post("/ingest", response_model=ShortSellingIngestionResponse)
def ingest_short_selling(
    service: Annotated[ShortSellingService, Depends(get_short_selling_service)],
    _current_user: Annotated[User, Depends(get_current_user)],
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
    try:
        result = service.ingest_csv(filename=filename)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="CSV file not found") from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
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
