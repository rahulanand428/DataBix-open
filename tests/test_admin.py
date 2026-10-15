import base64
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from main import app
from models import RefreshSession
from services import short_selling_service as short_selling_module
from services.health import get_health_checker
from tests.conftest import AppDatabase, auth_headers

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32).decode()
ADMIN_GETS = (
    "/api/v1/admin/status",
    "/api/v1/admin/sources",
    "/api/v1/admin/ingestions",
    "/api/v1/admin/users",
)


@pytest.fixture
def people(db: AppDatabase) -> AppDatabase:
    db.add_user("root", admin=True)
    db.add_user("analyst")
    return db


@pytest.fixture
def healthy() -> None:
    app.dependency_overrides[get_health_checker] = lambda: lambda: [
        {"name": "api", "status": "ok", "latency_ms": 0.0, "detail": None},
        {"name": "postgres", "status": "ok", "latency_ms": 1.2, "detail": None},
        {"name": "redis", "status": "error", "latency_ms": 2001.0, "detail": "TimeoutError"},
    ]
    yield
    app.dependency_overrides.pop(get_health_checker, None)


async def test_admin_endpoints_reject_non_admins(client: AsyncClient, people: AppDatabase) -> None:
    for path in ADMIN_GETS:
        assert (await client.get(path)).status_code == 401, path
        assert (await client.get(path, headers=auth_headers("analyst"))).status_code == 403, path
    analyst = auth_headers("analyst")
    assert (await client.post("/api/v1/admin/users", json={}, headers=analyst)).status_code == 403
    assert (await client.patch("/api/v1/admin/users/1", json={}, headers=analyst)).status_code == 403
    assert (await client.put("/api/v1/admin/branding", json={}, headers=analyst)).status_code == 403
    assert (await client.delete("/api/v1/admin/branding", headers=analyst)).status_code == 403


async def test_user_management_lifecycle(client: AsyncClient, people: AppDatabase) -> None:
    root = auth_headers("root")
    created = await client.post(
        "/api/v1/admin/users",
        json={"username": "  New.Analyst ", "password": "another-good-pass", "is_admin": False},
        headers=root,
    )
    assert created.status_code == 201
    user = created.json()
    assert user["username"] == "new.analyst" and user["is_admin"] is False

    duplicate = await client.post(
        "/api/v1/admin/users",
        json={"username": "new.analyst", "password": "another-good-pass"},
        headers=root,
    )
    assert duplicate.status_code == 409

    promoted = await client.patch(
        f"/api/v1/admin/users/{user['id']}", json={"is_admin": True}, headers=root
    )
    assert promoted.json()["is_admin"] is True

    listing = (await client.get("/api/v1/admin/users", headers=root)).json()
    assert [item["username"] for item in listing["items"]] == ["analyst", "new.analyst", "root"]
    assert "hashed_password" not in listing["items"][0]


async def test_admins_cannot_lock_themselves_out(client: AsyncClient, people: AppDatabase) -> None:
    root = auth_headers("root")
    users = (await client.get("/api/v1/admin/users", headers=root)).json()["items"]
    root_id = next(item["id"] for item in users if item["username"] == "root")
    for change in ({"is_admin": False}, {"is_active": False}):
        response = await client.patch(f"/api/v1/admin/users/{root_id}", json=change, headers=root)
        assert response.status_code == 400
    unknown_field = await client.patch(
        f"/api/v1/admin/users/{root_id}", json={"hashed_password": "x"}, headers=root
    )
    assert unknown_field.status_code == 422


async def test_password_reset_and_deactivation_revoke_sessions(
    client: AsyncClient, people: AppDatabase
) -> None:
    login = await client.post(
        "/api/v1/auth/token",
        data={"username": "analyst", "password": "correct-horse-battery"},
        headers={"X-Requested-With": "databix"},
    )
    assert login.status_code == 200
    root = auth_headers("root")
    users = (await client.get("/api/v1/admin/users", headers=root)).json()["items"]
    analyst_id = next(item["id"] for item in users if item["username"] == "analyst")

    too_short = await client.post(
        f"/api/v1/admin/users/{analyst_id}/password", json={"password": "short"}, headers=root
    )
    assert too_short.status_code == 422
    reset = await client.post(
        f"/api/v1/admin/users/{analyst_id}/password",
        json={"password": "brand-new-password"},
        headers=root,
    )
    assert reset.status_code == 204
    with people.session_factory() as session:
        records = session.scalars(select(RefreshSession)).all()
        assert records and all(record.revoked_at for record in records)

    old = await client.post(
        "/api/v1/auth/token", data={"username": "analyst", "password": "correct-horse-battery"}
    )
    assert old.status_code == 401
    deactivated = await client.patch(
        f"/api/v1/admin/users/{analyst_id}", json={"is_active": False}, headers=root
    )
    assert deactivated.json()["is_active"] is False
    blocked = await client.get("/api/v1/users/me", headers=auth_headers("analyst"))
    assert blocked.status_code == 401


async def test_sources_and_ingestion_history(
    client: AsyncClient, people: AppDatabase, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "Short-Selling-01-04-2026-to-01-10-2026.csv").write_text("x")
    (tmp_path / "extra.csv").write_text("xy")
    (tmp_path / "notes.txt").write_text("ignored")
    monkeypatch.setattr(short_selling_module, "DATAFILES_DIRECTORY", tmp_path)

    root = auth_headers("root")
    await client.post("/api/v1/short-selling/ingest?filename=missing.csv", headers=root)

    sources = (await client.get("/api/v1/admin/sources", headers=root)).json()["items"]
    assert [(item["filename"], item["is_default"]) for item in sources] == [
        ("Short-Selling-01-04-2026-to-01-10-2026.csv", True),
        ("extra.csv", False),
    ]
    history = (await client.get("/api/v1/admin/ingestions", headers=root)).json()["items"]
    assert history[0]["filename"] == "missing.csv"
    assert history[0]["status"] == "failed"
    assert history[0]["triggered_by"] == "root"
    assert history[0]["error"] == "CSV file not found"


async def test_status_reports_components_without_details(
    client: AsyncClient, people: AppDatabase, healthy: None
) -> None:
    status = (await client.get("/api/v1/admin/status", headers=auth_headers("root"))).json()
    assert {item["name"]: item["status"] for item in status["components"]} == {
        "api": "ok",
        "postgres": "ok",
        "redis": "error",
    }
    assert status["coverage"]["records"] == 0
    assert status["last_ingestion"] is None


async def test_branding_defaults_are_public(client: AsyncClient, db: AppDatabase) -> None:
    response = await client.get("/api/v1/branding")
    assert response.status_code == 200
    assert response.json()["product_name"] == "DataBix"
    assert response.json()["customized"] is False


async def test_branding_update_and_reset(client: AsyncClient, people: AppDatabase) -> None:
    root = auth_headers("root")
    payload = {
        "product_name": "Acme Markets",
        "primary_color": "#7c3aed",
        "logo_data_url": f"data:image/png;base64,{PNG}",
        "support_email": "help@acme.example",
        "show_powered_by": False,
    }
    saved = await client.put("/api/v1/admin/branding", json=payload, headers=root)
    assert saved.status_code == 200, saved.text
    public = (await client.get("/api/v1/branding")).json()
    assert public["product_name"] == "Acme Markets"
    assert public["primary_color"] == "#7C3AED"
    assert public["customized"] is True
    # Who changed it is for administrators only.
    assert "updated_by" not in public and "updated_at" not in public
    details = (await client.get("/api/v1/admin/branding", headers=root)).json()
    assert details["updated_by"] == "root"
    assert (await client.get("/api/v1/admin/branding", headers=auth_headers("analyst"))).status_code == 403

    reset = await client.delete("/api/v1/admin/branding", headers=root)
    assert reset.json()["product_name"] == "DataBix"


@pytest.mark.parametrize(
    "override",
    [
        {"primary_color": "red"},
        {"primary_color": "#12345"},
        {"primary_color": "#123456; background:url(x)"},
        {"font_family": "Comic Sans"},
        {"logo_data_url": "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="},
        {"logo_data_url": "https://evil.example/logo.png"},
        {"logo_data_url": "data:image/png;base64," + base64.b64encode(b"GIF89a").decode()},
        {"logo_data_url": "data:image/png;base64,not base64!"},
        {"logo_data_url": "data:image/png;base64,"
         + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 300_000).decode()},
        {"support_email": "not-an-email"},
        {"product_name": ""},
        {"unexpected": "field"},
    ],
)
async def test_branding_rejects_unsafe_values(
    client: AsyncClient, people: AppDatabase, override: dict
) -> None:
    response = await client.put(
        "/api/v1/admin/branding", json=override, headers=auth_headers("root")
    )
    assert response.status_code == 422, override
