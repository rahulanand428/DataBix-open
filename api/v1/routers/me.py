from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Query, Response, status

from api.v1.schemas.me import AlertList, Watchlist, WatchlistAdd, WatchlistEntry
from api.v1.schemas.short_selling import SYMBOL_PATTERN
from auth.dependencies import get_current_user
from models import User
from services.watchlist import (
    MAX_WATCHLIST_ITEMS,
    AlreadyWatchedError,
    UnknownSymbolError,
    WatchlistFullError,
    WatchlistService,
    get_watchlist_service,
)

router = APIRouter(prefix="/me", tags=["me"])

CurrentUser = Annotated[User, Depends(get_current_user)]
Service = Annotated[WatchlistService, Depends(get_watchlist_service)]


@router.get("/watchlist", response_model=Watchlist)
def get_watchlist(user: CurrentUser, service: Service) -> Watchlist:
    return Watchlist(items=[WatchlistEntry(**item) for item in service.entries(user.id)])


@router.post("/watchlist", response_model=Watchlist, status_code=status.HTTP_201_CREATED)
def add_to_watchlist(payload: WatchlistAdd, user: CurrentUser, service: Service) -> Watchlist:
    try:
        service.add(user.id, payload.symbol)
    except UnknownSymbolError as error:
        raise HTTPException(status_code=404, detail="Symbol not found") from error
    except AlreadyWatchedError as error:
        raise HTTPException(status_code=409, detail="Symbol is already on your watchlist") from error
    except WatchlistFullError as error:
        raise HTTPException(
            status_code=400, detail=f"Watchlists hold at most {MAX_WATCHLIST_ITEMS} symbols"
        ) from error
    return Watchlist(items=[WatchlistEntry(**item) for item in service.entries(user.id)])


@router.delete("/watchlist/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_watchlist(
    symbol: Annotated[str, PathParam(min_length=1, max_length=32, pattern=SYMBOL_PATTERN)],
    user: CurrentUser,
    service: Service,
) -> Response:
    if not service.remove(user.id, symbol.upper()):
        raise HTTPException(status_code=404, detail="Symbol is not on your watchlist")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/alerts", response_model=AlertList)
def get_alerts(
    user: CurrentUser,
    service: Service,
    days: Annotated[int, Query(ge=1, le=90)] = 14,
    threshold: Annotated[float, Query(ge=1.1, le=20)] = 2.0,
) -> AlertList:
    return AlertList(items=service.alerts(user.id, days, threshold), days=days, threshold=threshold)
