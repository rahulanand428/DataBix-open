import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from models import ShortSellingMaster


def test_layered_model_is_exported() -> None:
    assert ShortSellingMaster.__tablename__ == "short_selling_master"


@pytest.mark.asyncio
async def test_health_endpoint() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_cors_allows_localhost_origin() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


@pytest.mark.asyncio
async def test_api_docs_are_disabled_by_default() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        docs = await client.get("/docs")
        schema = await client.get("/openapi.json")

    assert docs.status_code == 404
    assert schema.status_code == 404


@pytest.mark.asyncio
async def test_responses_carry_security_headers_and_safe_correlation_id() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        accepted = await client.get("/health", headers={"X-Correlation-ID": "req-123"})
        replaced = await client.get(
            "/health", headers={"X-Correlation-ID": "x" * 65}
        )

    assert accepted.headers["x-correlation-id"] == "req-123"
    assert replaced.headers["x-correlation-id"] != "x" * 65
    assert accepted.headers["x-content-type-options"] == "nosniff"
    assert accepted.headers["x-frame-options"] == "DENY"


@pytest.mark.asyncio
async def test_cors_does_not_allow_credentials() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert "access-control-allow-credentials" not in response.headers
