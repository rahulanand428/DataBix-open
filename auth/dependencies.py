from datetime import UTC
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.model import TokenData
from auth.utils import ALGORITHM, DUMMY_PASSWORD_HASH, SECRET_KEY, verify_password
from database import get_db
from models.user_models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")
DatabaseSession = Annotated[Session, Depends(get_db)]
BearerToken = Annotated[str, Depends(oauth2_scheme)]


def get_user(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username))


def authenticate_user(db: Session, username: str, password: str) -> User | None:
    user = get_user(db, username)
    if user is None:
        verify_password(password, DUMMY_PASSWORD_HASH)
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def get_current_user(db: DatabaseSession, token: BearerToken) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "sub", "iat"]},
        )
        username = payload.get("sub")
        if not isinstance(username, str) or payload.get("type") != "access":
            raise credentials_exception
        token_data = TokenData(username=username)
    except jwt.InvalidTokenError:
        raise credentials_exception
    user = get_user(db, username=token_data.username)
    if user is None or not user.is_active:
        raise credentials_exception
    if user.tokens_valid_after is not None:
        cutoff = user.tokens_valid_after
        cutoff = cutoff if cutoff.tzinfo else cutoff.replace(tzinfo=UTC)
        # iat has one-second resolution; tokens from the reset's own second stay valid.
        if int(payload["iat"]) < int(cutoff.timestamp()):
            raise credentials_exception
    return user


def get_current_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required",
        )
    return current_user
