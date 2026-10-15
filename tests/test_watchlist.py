from datetime import date, timedelta

import pytest
from httpx import AsyncClient

from services import watchlist as watchlist_module
from tests.conftest import AppDatabase, auth_headers

START = date(2026, 3, 1)


@pytest.fixture
def market(db: AppDatabase) -> AppDatabase:
    db.add_user("alice")
    db.add_user("bob")
    rows = []
    for day in range(30):
        trade_date = START + timedelta(days=day)
        # Steady at 100 shares, then a 5x spike on the final day.
        rows.append((trade_date, "ABB", "ABB LTD.", 500 if day == 29 else 100))
        rows.append((trade_date, "TCS", "TATA CONSULTANCY", 1_000))
    db.add_rows(rows)
    return db


async def test_watchlist_is_per_user(client: AsyncClient, market: AppDatabase) -> None:
    alice, bob = auth_headers("alice"), auth_headers("bob")
    added = await client.post("/api/v1/me/watchlist", json={"symbol": "abb"}, headers=alice)
    assert added.status_code == 201
    entry = added.json()["items"][0]
    assert entry["symbol"] == "ABB"
    assert entry["last_quantity"] == 500
    assert entry["baseline_quantity"] == 100
    assert entry["change_pct"] == 400.0
    assert len(entry["sparkline"]) == 30

    assert (await client.get("/api/v1/me/watchlist", headers=bob)).json()["items"] == []
    assert (await client.delete("/api/v1/me/watchlist/ABB", headers=bob)).status_code == 404
    assert (await client.delete("/api/v1/me/watchlist/ABB", headers=alice)).status_code == 204
    assert (await client.get("/api/v1/me/watchlist", headers=alice)).json()["items"] == []


async def test_watchlist_rejects_unknown_duplicate_and_overflow(
    client: AsyncClient, market: AppDatabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice = auth_headers("alice")
    assert (await client.post("/api/v1/me/watchlist", json={"symbol": "NOPE"}, headers=alice)).status_code == 404
    assert (await client.post("/api/v1/me/watchlist", json={"symbol": "ABB"}, headers=alice)).status_code == 201
    assert (await client.post("/api/v1/me/watchlist", json={"symbol": "ABB"}, headers=alice)).status_code == 409
    assert (await client.post("/api/v1/me/watchlist", json={"symbol": "A B"}, headers=alice)).status_code == 422
    monkeypatch.setattr(watchlist_module, "MAX_WATCHLIST_ITEMS", 1)
    assert (await client.post("/api/v1/me/watchlist", json={"symbol": "TCS"}, headers=alice)).status_code == 400


async def test_alerts_flag_spikes_on_watched_symbols_only(client: AsyncClient, market: AppDatabase) -> None:
    alice = auth_headers("alice")
    await client.post("/api/v1/me/watchlist", json={"symbol": "ABB"}, headers=alice)
    await client.post("/api/v1/me/watchlist", json={"symbol": "TCS"}, headers=alice)

    alerts = (await client.get("/api/v1/me/alerts", params={"days": 7}, headers=alice)).json()
    assert [(item["symbol"], item["date"], item["ratio"]) for item in alerts["items"]] == [
        ("ABB", "2026-03-30", 5.0)
    ]
    stricter = await client.get("/api/v1/me/alerts", params={"threshold": 6}, headers=alice)
    assert stricter.json()["items"] == []
    assert (await client.get("/api/v1/me/alerts", headers=auth_headers("bob"))).json()["items"] == []
    invalid = await client.get("/api/v1/me/alerts", params={"threshold": 0.5}, headers=alice)
    assert invalid.status_code == 422
