from datetime import UTC, datetime, timedelta

import jwt
from httpx import AsyncClient
from sqlalchemy import select

from auth import sessions
from auth.utils import ALGORITHM, SECRET_KEY
from models import RefreshSession
from tests.conftest import AppDatabase

CSRF = {"X-Requested-With": "databix"}


async def login(client: AsyncClient, username: str = "alice") -> dict:
    response = await client.post(
        "/api/v1/auth/token",
        data={"username": username, "password": "correct-horse-battery"},
        headers=CSRF,
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_login_sets_a_locked_down_refresh_cookie(client: AsyncClient, db: AppDatabase) -> None:
    db.add_user("alice")
    response = await client.post(
        "/api/v1/auth/token",
        data={"username": "alice", "password": "correct-horse-battery"},
        headers=CSRF,
    )
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{sessions.REFRESH_COOKIE_NAME}=")
    for attribute in ("HttpOnly", "Path=/api/v1/auth", "SameSite=strict", "Max-Age=604800"):
        assert attribute.lower() in cookie.lower(), attribute
    assert response.json()["expires_in"] == 1800
    with db.session_factory() as session:
        stored = session.scalars(select(RefreshSession)).one()
    # Only a hash is stored server-side.
    assert stored.token_hash not in cookie and len(stored.token_hash) == 64


async def test_refresh_rotates_the_cookie_and_issues_an_access_token(
    client: AsyncClient, db: AppDatabase
) -> None:
    db.add_user("alice")
    await login(client)
    first_cookie = client.cookies.get(sessions.REFRESH_COOKIE_NAME)

    refreshed = await client.post("/api/v1/auth/refresh", headers=CSRF)
    assert refreshed.status_code == 200
    second_cookie = client.cookies.get(sessions.REFRESH_COOKIE_NAME)
    assert second_cookie and second_cookie != first_cookie

    me = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {refreshed.json()['access_token']}"}
    )
    assert me.json()["username"] == "alice"


async def test_refresh_requires_the_csrf_header(client: AsyncClient, db: AppDatabase) -> None:
    db.add_user("alice")
    await login(client)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 403
    assert (await client.post("/api/v1/auth/logout")).status_code == 403


async def test_refresh_without_a_cookie_is_rejected(client: AsyncClient, db: AppDatabase) -> None:
    assert (await client.post("/api/v1/auth/refresh", headers=CSRF)).status_code == 401


async def test_reusing_a_rotated_token_revokes_the_whole_family(
    client: AsyncClient, db: AppDatabase
) -> None:
    db.add_user("alice")
    await login(client)
    stolen = client.cookies.get(sessions.REFRESH_COOKIE_NAME)
    assert (await client.post("/api/v1/auth/refresh", headers=CSRF)).status_code == 200

    # Age the rotation past the concurrent-tab grace window.
    with db.session_factory.begin() as session:
        for record in session.scalars(select(RefreshSession).where(RefreshSession.revoked_at.is_not(None))):
            record.revoked_at = datetime.now(UTC) - timedelta(minutes=5)

    client.cookies.set(sessions.REFRESH_COOKIE_NAME, stolen, path="/api/v1/auth")
    replay = await client.post("/api/v1/auth/refresh", headers=CSRF)
    assert replay.status_code == 401
    with db.session_factory() as session:
        assert session.scalars(
            select(RefreshSession).where(RefreshSession.revoked_at.is_(None))
        ).all() == []


async def test_concurrent_refresh_inside_grace_window_does_not_revoke_family(
    client: AsyncClient, db: AppDatabase
) -> None:
    db.add_user("alice")
    await login(client)
    original = client.cookies.get(sessions.REFRESH_COOKIE_NAME)
    assert (await client.post("/api/v1/auth/refresh", headers=CSRF)).status_code == 200
    newest = client.cookies.get(sessions.REFRESH_COOKIE_NAME)

    client.cookies.set(sessions.REFRESH_COOKIE_NAME, original, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh", headers=CSRF)).status_code == 401

    client.cookies.set(sessions.REFRESH_COOKIE_NAME, newest, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh", headers=CSRF)).status_code == 200


async def test_logout_revokes_the_session(client: AsyncClient, db: AppDatabase) -> None:
    db.add_user("alice")
    await login(client)
    token = client.cookies.get(sessions.REFRESH_COOKIE_NAME)
    assert (await client.post("/api/v1/auth/logout", headers=CSRF)).status_code == 204
    client.cookies.set(sessions.REFRESH_COOKIE_NAME, token, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh", headers=CSRF)).status_code == 401


async def test_deactivated_users_cannot_refresh(client: AsyncClient, db: AppDatabase) -> None:
    user = db.add_user("alice")
    await login(client)
    with db.session_factory.begin() as session:
        session.get(type(user), user.id).is_active = False
    assert (await client.post("/api/v1/auth/refresh", headers=CSRF)).status_code == 401


async def test_expired_refresh_tokens_are_rejected(client: AsyncClient, db: AppDatabase) -> None:
    db.add_user("alice")
    await login(client)
    with db.session_factory.begin() as session:
        for record in session.scalars(select(RefreshSession)):
            record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    assert (await client.post("/api/v1/auth/refresh", headers=CSRF)).status_code == 401


async def test_tokens_without_the_access_type_are_rejected(client: AsyncClient, db: AppDatabase) -> None:
    db.add_user("alice")
    untyped = jwt.encode(
        {"sub": "alice", "exp": datetime.now(UTC) + timedelta(minutes=5)}, SECRET_KEY, algorithm=ALGORITHM
    )
    response = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {untyped}"})
    assert response.status_code == 401


async def test_sessions_per_user_are_capped(client: AsyncClient, db: AppDatabase) -> None:
    db.add_user("alice")
    for _ in range(sessions.MAX_SESSIONS_PER_USER + 5):
        await login(client)
    with db.session_factory() as session:
        active = session.scalars(
            select(RefreshSession).where(RefreshSession.revoked_at.is_(None))
        ).all()
    assert len(active) == sessions.MAX_SESSIONS_PER_USER


async def test_logins_without_the_header_get_no_session_cookie(client: AsyncClient, db: AppDatabase) -> None:
    """A cross-site form cannot set the header, so it cannot plant a session (login CSRF)."""
    db.add_user("alice")
    response = await client.post(
        "/api/v1/auth/token", data={"username": "alice", "password": "correct-horse-battery"}
    )
    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    with db.session_factory() as session:
        assert session.scalars(select(RefreshSession)).all() == []


async def test_a_token_can_only_be_rotated_once(client: AsyncClient, db: AppDatabase) -> None:
    db.add_user("alice")
    await login(client)
    with db.session_factory() as session:
        record = session.scalars(select(RefreshSession)).one()
    now = datetime.now(UTC)
    # Two concurrent refreshes race to claim the same row; only one can win.
    with db.session_factory.begin() as first, db.session_factory.begin() as second:
        assert sessions.claim(first, record.id, now) is True
    with db.session_factory.begin() as second:
        assert sessions.claim(second, record.id, now) is False


async def test_password_reset_invalidates_existing_access_tokens(client: AsyncClient, db: AppDatabase) -> None:
    db.add_user("root", admin=True)
    db.add_user("alice")
    issued = (await login(client))["access_token"]
    root = {"Authorization": f"Bearer {jwt.encode({'sub': 'root', 'type': 'access', 'iat': datetime.now(UTC), 'exp': datetime.now(UTC) + timedelta(minutes=5)}, SECRET_KEY, algorithm=ALGORITHM)}"}
    users = (await client.get("/api/v1/admin/users", headers=root)).json()["items"]
    alice_id = next(user["id"] for user in users if user["username"] == "alice")

    # Backdate alice's token so it predates the reset by more than iat's 1 s resolution.
    payload = jwt.decode(issued, SECRET_KEY, algorithms=[ALGORITHM])
    payload["iat"] = payload["iat"] - 5
    old_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    assert (await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {old_token}"})).status_code == 200

    reset = await client.post(
        f"/api/v1/admin/users/{alice_id}/password", json={"password": "brand-new-password"}, headers=root
    )
    assert reset.status_code == 204
    assert (await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {old_token}"})).status_code == 401
