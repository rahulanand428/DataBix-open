import csv
import io
import json
import logging
from collections.abc import Iterator
from typing import Annotated
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Query, Request
from fastapi.responses import StreamingResponse

from api.v1.schemas.short_selling import (
    SYMBOL_PATTERN,
    Coverage,
    DailyTotals,
    DateRangeFilters,
    ExportFilters,
    ShortSellingFilters,
    ShortSellingIngestionResponse,
    ShortSellingPage,
    Summary,
    SymbolList,
    SymbolSearchFilters,
    SymbolSeries,
    SymbolStats,
    TopSymbolFilters,
    TopSymbols,
)
from auth.dependencies import get_current_admin, get_current_user
from services.ingestion_runs import IngestionRunRecorder, get_ingestion_recorder
from services.short_selling_service import (
    IngestionInProgressError,
    InvalidIngestionFilenameError,
    ShortSellingService,
    SymbolNotFoundError,
    get_short_selling_service,
)
from models.user_models import User


router = APIRouter(prefix="/short-selling", tags=["short-selling"])
audit_logger = logging.getLogger("databix.audit")

Service = Annotated[ShortSellingService, Depends(get_short_selling_service)]
CurrentUser = Annotated[User, Depends(get_current_user)]
SymbolParam = Annotated[
    str, PathParam(min_length=1, max_length=32, pattern=SYMBOL_PATTERN)
]
EXPORT_ROW_LIMIT = 100_000
# Cells starting with these characters are treated as formulas by spreadsheets.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


@router.post("/ingest", response_model=ShortSellingIngestionResponse)
def ingest_short_selling(
    request: Request,
    service: Service,
    recorder: Annotated[IngestionRunRecorder, Depends(get_ingestion_recorder)],
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
    run_id = recorder.start(filename or "(default)", admin.username)
    try:
        result = service.ingest_csv(filename=filename)
    except FileNotFoundError as error:
        recorder.fail(run_id, "CSV file not found")
        raise HTTPException(status_code=404, detail="CSV file not found") from error
    except IngestionInProgressError as error:
        recorder.fail(run_id, "Another ingestion was already running")
        raise HTTPException(status_code=409, detail=str(error)) from error
    except InvalidIngestionFilenameError as error:
        recorder.fail(run_id, str(error))
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ValueError as error:
        # Parser errors can quote raw file content; keep that in server logs.
        audit_logger.warning("CSV ingestion failed validation", exc_info=True)
        recorder.fail(run_id, "CSV file failed validation")
        raise HTTPException(
            status_code=400, detail="CSV file failed validation; see server logs"
        ) from error
    except Exception:
        recorder.fail(run_id, "Unexpected error; see server logs")
        raise
    recorder.finish(run_id, result)
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
    service: Service,
    _current_user: CurrentUser,
) -> ShortSellingPage:
    return service.list_records(
        date_from=filters.date_from,
        date_to=filters.date_to,
        symbol=filters.symbol,
        limit=filters.limit,
        offset=filters.offset,
        sort=filters.sort,
    )


@router.get("/coverage", response_model=Coverage)
def coverage(service: Service, _current_user: CurrentUser) -> Coverage:
    return service.coverage()


@router.get("/summary", response_model=Summary)
def summary(
    filters: Annotated[DateRangeFilters, Query()], service: Service, _current_user: CurrentUser
) -> Summary:
    return service.summary(filters.date_from, filters.date_to)


@router.get("/daily-totals", response_model=DailyTotals)
def daily_totals(
    filters: Annotated[DateRangeFilters, Query()], service: Service, _current_user: CurrentUser
) -> DailyTotals:
    return service.daily_totals(filters.date_from, filters.date_to)


@router.get("/top-symbols", response_model=TopSymbols)
def top_symbols(
    filters: Annotated[TopSymbolFilters, Query()], service: Service, _current_user: CurrentUser
) -> TopSymbols:
    return service.top_symbols(filters.date_from, filters.date_to, filters.limit)


@router.get("/symbols", response_model=SymbolList)
def search_symbols(
    filters: Annotated[SymbolSearchFilters, Query()], service: Service, _current_user: CurrentUser
) -> SymbolList:
    return service.search_symbols(filters.q, filters.limit, filters.offset)


@router.get("/symbols/{symbol}", response_model=SymbolStats)
def symbol_stats(symbol: SymbolParam, service: Service, _current_user: CurrentUser) -> SymbolStats:
    try:
        return service.symbol_stats(symbol.upper())
    except SymbolNotFoundError as error:
        raise HTTPException(status_code=404, detail="Symbol not found") from error


@router.get("/symbols/{symbol}/series", response_model=SymbolSeries)
def symbol_series(
    symbol: SymbolParam,
    filters: Annotated[DateRangeFilters, Query()],
    service: Service,
    _current_user: CurrentUser,
) -> SymbolSeries:
    return service.symbol_series(symbol.upper(), filters.date_from, filters.date_to)


def _safe_cell(value: str) -> str:
    return f"'{value}" if value.startswith(_FORMULA_PREFIXES) else value


@router.get("/export", response_class=StreamingResponse)
def export_csv(
    filters: Annotated[ExportFilters, Query()],
    service: Service,
    current_user: CurrentUser,
) -> StreamingResponse:
    total = service.count_rows(filters.date_from, filters.date_to, filters.symbol)
    audit_logger.info(
        json.dumps({"event": "export", "user": current_user.username, "rows": min(total, EXPORT_ROW_LIMIT)})
    )

    def generate() -> Iterator[str]:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["date", "symbol", "security_name", "quantity"])
        for trade_date, symbol, security_name, quantity in service.export_rows(
            filters.date_from, filters.date_to, filters.symbol, filters.sort, EXPORT_ROW_LIMIT
        ):
            writer.writerow(
                [trade_date.isoformat(), _safe_cell(symbol), _safe_cell(security_name), quantity]
            )
            if buffer.tell() > 64_000:
                yield buffer.getvalue()
                buffer.seek(0)
                buffer.truncate()
        yield buffer.getvalue()

    parts = [
        "short-selling",
        filters.date_from.isoformat() if filters.date_from else "start",
        filters.date_to.isoformat() if filters.date_to else "latest",
    ]
    if filters.symbol:
        parts.append(filters.symbol.replace("&", "and"))
    filename = "-".join(parts) + ".csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Export-Rows": str(min(total, EXPORT_ROW_LIMIT)),
            "X-Export-Truncated": "true" if total > EXPORT_ROW_LIMIT else "false",
            "Cache-Control": "no-store",
        },
    )
