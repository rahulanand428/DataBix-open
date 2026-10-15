"""Refresh-token sessions for the web UI.

Refresh tokens are random, opaque values sent only in an HttpOnly cookie and
stored server-side as SHA-256 hashes. Each use rotates the token. Presenting a
token that was already rotated (outside a short grace window for concurrent
tabs) is treated as theft and revokes every session in that login's family.
"""

import hashlib
import os
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from models import RefreshSession, User

REFRESH_COOKIE_NAME = "databix_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"
REFRESH_TOKEN_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "7"))
MAX_SESSIONS_PER_USER = 20
# Two tabs refreshing at the same moment both present the same token; the
# loser gets a 401 and retries with the cookie the winner received.
ROTATION_GRACE = timedelta(seconds=10)


class RefreshError(Exception):
    """The refresh token is missing, unknown, expired, revoked, or its user is inactive."""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _aware(value: datetime) -> datetime:
    # SQLite returns naive datetimes even for timezone-aware columns.
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def issue(session: Session, user: User, family_id: str | None = None) -> str:
    now = datetime.now(UTC)
    session.execute(
        delete(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.expires_at < now)
        .execution_options(synchronize_session=False)
    )
    active = session.scalars(
        select(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .order_by(RefreshSession.created_at.desc())
        .offset(MAX_SESSIONS_PER_USER - 1)
    ).all()
    for stale in active:
        stale.revoked_at = now

    token = secrets.token_urlsafe(32)
    session.add(
        RefreshSession(
            user_id=user.id,
            token_hash=_hash(token),
            family_id=family_id or secrets.token_hex(16),
            created_at=now,
            expires_at=now + timedelta(days=REFRESH_TOKEN_DAYS),
        )
    )
    return token


def rotate(session: Session, token: str) -> tuple[User, str]:
    record = session.scalar(select(RefreshSession).where(RefreshSession.token_hash == _hash(token)))
    if record is None:
        raise RefreshError
    now = datetime.now(UTC)
    if record.revoked_at is not None:
        if now - _aware(record.revoked_at) > ROTATION_GRACE:
            revoke_family(session, record.family_id)
            session.commit()
        raise RefreshError
    if _aware(record.expires_at) <= now:
        raise RefreshError
    user = session.get(User, record.user_id)
    if user is None or not user.is_active:
        raise RefreshError
    if not claim(session, record.id, now):
        # A concurrent request rotated this token first; it gets the new one.
        raise RefreshError
    return user, issue(session, user, record.family_id)


def claim(session: Session, record_id: int, now: datetime) -> bool:
    """Atomically mark a session as rotated; False if another request already did.

    A conditional UPDATE (rather than read-then-write) means two concurrent
    refreshes with the same token cannot both succeed and fork the session.
    """
    result = session.execute(
        update(RefreshSession)
        .where(RefreshSession.id == record_id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=now)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def revoke(session: Session, token: str) -> None:
    session.execute(
        update(RefreshSession)
        .where(RefreshSession.token_hash == _hash(token), RefreshSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
        .execution_options(synchronize_session=False)
    )


def revoke_family(session: Session, family_id: str) -> None:
    session.execute(
        update(RefreshSession)
        .where(RefreshSession.family_id == family_id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
        .execution_options(synchronize_session=False)
    )


def revoke_user_sessions(session: Session, user_id: int) -> None:
    session.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
        .execution_options(synchronize_session=False)
    )
