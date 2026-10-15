import csv
import io
from datetime import date

import pytest
from httpx import AsyncClient

from tests.conftest import AppDatabase, auth_headers

ROWS = [
    (date(2026, 4, 1), "ABB", "ABB LTD.", 100),
    (date(2026, 4, 1), "ABB", "ABB LTD.", 50),
    (date(2026, 4, 1), "M&M", "MAHINDRA & MAHINDRA LTD", 400),
    (date(2026, 4, 2), "ABB", "ABB LTD.", 300),
    (date(2026, 4, 2), "BAJAJ-AUTO", "BAJAJ AUTO LIMITED", 20),
    (date(2026, 4, 3), "M&M", "MAHINDRA & MAHINDRA LTD", 10),
    (date(2026, 4, 3), "EVIL", "=HYPERLINK(\"http://x\")", 5),
]


@pytest.fixture
def seeded(db: AppDatabase) -> AppDatabase:
    db.add_user("analyst")
    db.add_rows(ROWS)
    return db


async def test_analytics_endpoints_require_authentication(client: AsyncClient, seeded: AppDatabase) -> None:
    for path in (
        "/api/v1/short-selling/coverage",
        "/api/v1/short-selling/summary",
        "/api/v1/short-selling/daily-totals",
        "/api/v1/short-selling/top-symbols",
        "/api/v1/short-selling/symbols",
        "/api/v1/short-selling/symbols/ABB",
        "/api/v1/short-selling/symbols/ABB/series",
        "/api/v1/short-selling/export",
    ):
        assert (await client.get(path)).status_code == 401, path


async def test_coverage_and_summary(client: AsyncClient, seeded: AppDatabase) -> None:
    headers = auth_headers("analyst")
    coverage = (await client.get("/api/v1/short-selling/coverage", headers=headers)).json()
    assert coverage == {
        "earliest_date": "2026-04-01",
        "latest_date": "2026-04-03",
        "records": 7,
        "symbols": 4,
    }

    summary = (
        await client.get(
            "/api/v1/short-selling/summary",
            params={"date_from": "2026-04-01", "date_to": "2026-04-02"},
            headers=headers,
        )
    ).json()
    assert summary["total_quantity"] == 870
    assert summary["records"] == 5
    assert summary["symbols"] == 3
    assert summary["trading_days"] == 2
    assert summary["average_daily_quantity"] == 435.0
    assert summary["peak_day"] == {"date": "2026-04-01", "total_quantity": 550}
    assert summary["top_symbol"]["symbol"] == "ABB"
    assert summary["top_symbol"]["total_quantity"] == 450


async def test_summary_of_empty_range(client: AsyncClient, seeded: AppDatabase) -> None:
    response = await client.get(
        "/api/v1/short-selling/summary",
        params={"date_from": "2030-01-01"},
        headers=auth_headers("analyst"),
    )
    assert response.json()["total_quantity"] == 0
    assert response.json()["peak_day"] is None
    assert response.json()["top_symbol"] is None


async def test_daily_totals_and_top_symbols(client: AsyncClient, seeded: AppDatabase) -> None:
    headers = auth_headers("analyst")
    daily = (await client.get("/api/v1/short-selling/daily-totals", headers=headers)).json()
    assert [(day["date"], day["total_quantity"], day["symbols"]) for day in daily["items"]] == [
        ("2026-04-01", 550, 2),
        ("2026-04-02", 320, 2),
        ("2026-04-03", 15, 2),
    ]

    top = (
        await client.get("/api/v1/short-selling/top-symbols", params={"limit": 2}, headers=headers)
    ).json()
    assert [(item["symbol"], item["total_quantity"], item["trading_days"]) for item in top["items"]] == [
        ("ABB", 450, 2),
        ("M&M", 410, 2),
    ]


async def test_symbol_search_matches_prefix_and_name_and_escapes_wildcards(
    client: AsyncClient, seeded: AppDatabase
) -> None:
    headers = auth_headers("analyst")

    async def search(query: str) -> list[str]:
        response = await client.get(
            "/api/v1/short-selling/symbols", params={"q": query}, headers=headers
        )
        return [item["symbol"] for item in response.json()["items"]]

    assert await search("m&") == ["M&M"]
    assert await search("auto") == ["BAJAJ-AUTO"]
    assert await search("%") == []
    assert await search("_") == []
    everything = await client.get("/api/v1/short-selling/symbols", headers=headers)
    assert everything.json()["total"] == 4
    assert everything.json()["items"][0]["symbol"] == "ABB"


async def test_symbol_stats_and_series(client: AsyncClient, seeded: AppDatabase) -> None:
    headers = auth_headers("analyst")
    stats = (await client.get("/api/v1/short-selling/symbols/m&m", headers=headers)).json()
    assert stats == {
        "symbol": "M&M",
        "security_name": "MAHINDRA & MAHINDRA LTD",
        "total_quantity": 410,
        "trading_days": 2,
        "average_quantity": 205.0,
        "max_quantity": 400,
        "max_date": "2026-04-01",
        "first_date": "2026-04-01",
        "last_date": "2026-04-03",
    }
    series = (await client.get("/api/v1/short-selling/symbols/ABB/series", headers=headers)).json()
    assert series["items"] == [
        {"date": "2026-04-01", "quantity": 150},
        {"date": "2026-04-02", "quantity": 300},
    ]
    missing = await client.get("/api/v1/short-selling/symbols/NOPE", headers=headers)
    assert missing.status_code == 404
    invalid = await client.get("/api/v1/short-selling/symbols/AB%22C", headers=headers)
    assert invalid.status_code == 422


async def test_list_sorting(client: AsyncClient, seeded: AppDatabase) -> None:
    headers = auth_headers("analyst")
    response = await client.get(
        "/api/v1/short-selling", params={"sort": "-quantity", "limit": 3}, headers=headers
    )
    assert [item["quantity"] for item in response.json()["items"]] == [400, 300, 100]
    invalid = await client.get("/api/v1/short-selling", params={"sort": "id; drop"}, headers=headers)
    assert invalid.status_code == 422


async def test_export_streams_csv_and_neutralizes_formulas(
    client: AsyncClient, seeded: AppDatabase
) -> None:
    response = await client.get(
        "/api/v1/short-selling/export",
        params={"date_from": "2026-04-03", "sort": "symbol"},
        headers=auth_headers("analyst"),
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == (
        'attachment; filename="short-selling-2026-04-03-latest.csv"'
    )
    assert response.headers["x-export-rows"] == "2"
    rows = list(csv.reader(io.StringIO(response.text)))
    assert rows[0] == ["date", "symbol", "security_name", "quantity"]
    assert rows[1] == ["2026-04-03", "EVIL", "'=HYPERLINK(\"http://x\")", "5"]
    assert rows[2][1] == "M&M"


async def test_export_rejects_header_breaking_symbols(client: AsyncClient, seeded: AppDatabase) -> None:
    response = await client.get(
        "/api/v1/short-selling/export",
        params={"symbol": 'A"B'},
        headers=auth_headers("analyst"),
    )
    assert response.status_code == 422


async def test_analytics_are_cached_and_invalidated_by_prefix(
    client: AsyncClient, seeded: AppDatabase
) -> None:
    headers = auth_headers("analyst")
    await client.get("/api/v1/short-selling/summary", headers=headers)
    await client.get("/api/v1/short-selling/summary", headers=headers)
    assert seeded.redis.set_calls == 1
    assert all(key.startswith("short_selling:v1:") for key in seeded.redis.values)
