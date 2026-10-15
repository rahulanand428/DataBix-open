from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError

from auth import sessions
from auth.dependencies import DatabaseSession, authenticate_user, get_user
from auth.model import Token
from auth.schemas import UserCreate, UserResponse
from auth.utils import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, get_password_hash
from models.user_models import User
from settings import env_flag

router = APIRouter(prefix="/auth", tags=["authentication"])

# Browsers cannot send custom headers cross-site without a CORS preflight, which
# this API never grants, so requiring one blocks CSRF on the cookie endpoints.
CSRF_HEADER_VALUE = "databix"


def _token_response(user: User) -> Token:
    return Token(
        access_token=create_access_token(data={"sub": user.username}),
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        sessions.REFRESH_COOKIE_NAME,
        token,
        max_age=sessions.REFRESH_TOKEN_DAYS * 86_400,
        path=sessions.REFRESH_COOKIE_PATH,
        httponly=True,
        secure=env_flag("AUTH_COOKIE_SECURE", default=True),
        samesite="strict",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        sessions.REFRESH_COOKIE_NAME,
        path=sessions.REFRESH_COOKIE_PATH,
        httponly=True,
        secure=env_flag("AUTH_COOKIE_SECURE", default=True),
        samesite="strict",
    )


def _require_csrf_header(x_requested_with: str | None) -> None:
    if x_requested_with != CSRF_HEADER_VALUE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Missing X-Requested-With header"
        )


@router.post("/token", response_model=Token)
def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DatabaseSession,
    response: Response,
    x_requested_with: Annotated[str | None, Header()] = None,
) -> Token:
    """Exchange credentials for an access token.

    The web UI sends X-Requested-With and also receives the refresh cookie.
    Other clients (scripts, the MCP server) get only the access token. A
    cross-site form cannot set the header, so it cannot plant a session
    cookie in someone else's browser (login CSRF).
    """
    user = authenticate_user(db, form_data.username.strip().lower(), form_data.password)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user.last_login_at = datetime.now(UTC)
    if x_requested_with == CSRF_HEADER_VALUE:
        _set_refresh_cookie(response, sessions.issue(db, user))
    db.commit()
    return _token_response(user)


@router.post("/refresh", response_model=Token)
def refresh_access_token(
    db: DatabaseSession,
    response: Response,
    x_requested_with: Annotated[str | None, Header()] = None,
    databix_refresh: Annotated[str | None, Cookie()] = None,
) -> Token | JSONResponse:
    """Exchange the refresh cookie for a new access token, rotating the cookie."""
    _require_csrf_header(x_requested_with)
    if not databix_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")
    try:
        user, new_token = sessions.rotate(db, databix_refresh)
    except sessions.RefreshError:
        expired = JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": "Session expired"}
        )
        _clear_refresh_cookie(expired)
        return expired
    db.commit()
    _set_refresh_cookie(response, new_token)
    return _token_response(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: DatabaseSession,
    response: Response,
    x_requested_with: Annotated[str | None, Header()] = None,
    databix_refresh: Annotated[str | None, Cookie()] = None,
) -> Response:
    _require_csrf_header(x_requested_with)
    if databix_refresh:
        sessions.revoke(db, databix_refresh)
        db.commit()
    response.status_code = status.HTTP_204_NO_CONTENT
    _clear_refresh_cookie(response)
    return response

@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(user: UserCreate, db: DatabaseSession) -> User:
    if not env_flag("AUTH_SIGNUP_ENABLED"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-service signup is disabled",
        )
    if get_user(db, username=user.username) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already registered",
        )
    db_user = User(
        username=user.username,
        hashed_password=get_password_hash(user.password),
        created_at=datetime.now(UTC),
    )
    db.add(db_user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already registered",
        ) from error
    db.refresh(db_user)
    return db_user