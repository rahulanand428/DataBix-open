from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from auth.dependencies import get_db
from auth.utils import SECRET_KEY, get_password_hash, load_secret_key, verify_password
from database import Base
from main import app
from models import schema as schema_module
from models.schema import upgrade_schema
from models.user_models import User


@pytest.mark.asyncio
async def test_signup_login_and_protected_user_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AUTH_SIGNUP_ENABLED", "true")
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            protected_response = await client.get("/api/v1/users/me")
            signup_response = await client.post(
                "/api/v1/auth/signup",
                json={"username": "  Alice ", "password": "correct-horse-battery"},
            )
            login_response = await client.post(
                "/api/v1/auth/token",
                data={"username": "alice", "password": "correct-horse-battery"},
            )
            token = login_response.json()["access_token"]
            user_response = await client.get(
                "/api/v1/users/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            protected_data_response = await client.get("/api/v1/short-selling")
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()

    assert protected_response.status_code == 401
    assert signup_response.status_code == 201
    assert signup_response.json() == {
        "username": "alice",
        "id": 1,
        "is_active": True,
        "is_admin": False,
    }
    assert login_response.status_code == 200
    assert login_response.json()["token_type"] == "bearer"
    assert user_response.status_code == 200
    assert user_response.json() == {
        "username": "alice",
        "id": 1,
        "is_active": True,
        "is_admin": False,
    }
    assert protected_data_response.status_code == 401


@pytest.fixture
def auth_client_db() -> Generator[sessionmaker[Session], None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield session_factory
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


@pytest.mark.asyncio
async def test_signup_is_disabled_by_default(
    auth_client_db: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("AUTH_SIGNUP_ENABLED", raising=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/signup",
            json={"username": "mallory", "password": "correct-horse-battery"},
        )

    assert response.status_code == 403
    with auth_client_db() as session:
        assert session.scalar(select(User)) is None


@pytest.mark.asyncio
async def test_signup_cannot_grant_admin(
    auth_client_db: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AUTH_SIGNUP_ENABLED", "true")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/signup",
            json={"username": "mallory", "password": "correct-horse-battery", "is_admin": True},
        )

    assert response.status_code == 201
    assert response.json()["is_admin"] is False


@pytest.mark.asyncio
async def test_login_rejects_unknown_user_and_wrong_password_alike(
    auth_client_db: sessionmaker[Session],
) -> None:
    with auth_client_db.begin() as session:
        session.add(User(username="alice", hashed_password=get_password_hash("correct-horse-battery")))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        unknown = await client.post(
            "/api/v1/auth/token", data={"username": "nobody", "password": "whatever-123"}
        )
        wrong = await client.post(
            "/api/v1/auth/token", data={"username": "alice", "password": "wrong-password"}
        )
        too_long = await client.post(
            "/api/v1/auth/token", data={"username": "alice", "password": "x" * 100}
        )

    assert unknown.status_code == wrong.status_code == too_long.status_code == 401
    assert unknown.json() == wrong.json()


@pytest.mark.asyncio
async def test_tokens_signed_with_other_keys_or_algorithms_are_rejected(
    auth_client_db: sessionmaker[Session],
) -> None:
    with auth_client_db.begin() as session:
        session.add(User(username="alice", hashed_password=get_password_hash("correct-horse-battery")))
    expires = datetime.now(UTC) + timedelta(minutes=5)
    forged = jwt.encode({"sub": "alice", "exp": expires}, "x" * 48, algorithm="HS256")
    unsigned = jwt.encode({"sub": "alice", "exp": expires}, None, algorithm="none")
    no_expiry = jwt.encode({"sub": "alice"}, SECRET_KEY, algorithm="HS256")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        responses = [
            await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
            for token in (forged, unsigned, no_expiry)
        ]

    assert [response.status_code for response in responses] == [401, 401, 401]


def test_short_or_placeholder_signing_keys_are_rejected() -> None:
    for value in (None, "", "JWT secret here", "x" * 31):
        with pytest.raises(RuntimeError):
            load_secret_key(value)
    assert load_secret_key("x" * 32) == "x" * 32


def test_password_hashes_verify_and_reject_malformed_input() -> None:
    hashed = get_password_hash("correct-horse-battery")
    assert verify_password("correct-horse-battery", hashed)
    assert not verify_password("wrong-password", hashed)
    assert not verify_password("correct-horse-battery", "not-a-bcrypt-hash")


def test_upgrade_schema_adds_admin_column_to_existing_users_table() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:", poolclass=StaticPool)
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(100), "
                "hashed_password VARCHAR(255) NOT NULL, is_active BOOLEAN NOT NULL)"
            )
        )
        connection.execute(
            text("INSERT INTO users VALUES (1, 'legacy', 'hash', 1)")
        )

    upgrade_schema(engine)
    upgrade_schema(engine)

    with engine.connect() as connection:
        assert connection.execute(text("SELECT is_admin FROM users")).scalar_one() in (0, False)
    engine.dispose()



def test_upgrade_schema_tolerates_losing_a_concurrent_upgrade(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    real_has_column = schema_module._has_column
    calls: list[str] = []

    def has_column_after_race(*args: str) -> bool:
        # The first check misses the column, as if another process added it
        # between this check and the ALTER, which then fails as a duplicate.
        calls.append(args[-1])
        return len(calls) > 1 and real_has_column(*args)

    monkeypatch.setattr(schema_module, "_has_column", has_column_after_race)
    upgrade_schema(engine)

    # The ALTER for is_admin failed as a duplicate and the re-check accepted it.
    assert calls[:2] == ["is_admin", "is_admin"]
    engine.dispose()
