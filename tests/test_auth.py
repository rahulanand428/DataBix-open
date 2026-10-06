from collections.abc import Generator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from auth.dependencies import get_db
from database import Base
from main import app


@pytest.mark.asyncio
async def test_signup_login_and_protected_user_route() -> None:
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
    }
    assert login_response.status_code == 200
    assert login_response.json()["token_type"] == "bearer"
    assert user_response.status_code == 200
    assert user_response.json() == {"username": "alice", "id": 1, "is_active": True}
    assert protected_data_response.status_code == 401
