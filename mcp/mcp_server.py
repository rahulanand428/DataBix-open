import json
import os
from typing import Any
from urllib.parse import quote

import httpx
from mcp.server.fastmcp import FastMCP

# Initialize the server
mcp = FastMCP("Databix API Proxy")

# Resolve the backend service URL inside the Docker Compose network
# Defaults to localhost for easy local testing outside Docker
BACKEND_URL = os.getenv("BACKEND_INTERNAL_URL", "http://fastapi_backend:8000")
BACKEND_USERNAME = os.getenv("BACKEND_USERNAME")
BACKEND_PASSWORD = os.getenv("BACKEND_PASSWORD")


async def _get(path: str, params: dict[str, Any] | None = None) -> str:
    """Call the authenticated API as the MCP service account and return JSON text.

    Every tool goes through the public API rather than the database, so the
    service account's permissions and the API's validation always apply.
    """
    if not BACKEND_USERNAME or not BACKEND_PASSWORD:
        return "Authentication error: configure BACKEND_USERNAME and BACKEND_PASSWORD."
    query = {key: value for key, value in (params or {}).items() if value is not None}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            token_response = await client.post(
                f"{BACKEND_URL}/api/v1/auth/token",
                data={"username": BACKEND_USERNAME, "password": BACKEND_PASSWORD},
            )
            token_response.raise_for_status()
            access_token = token_response.json()["access_token"]
            response = await client.get(
                f"{BACKEND_URL}/api/v1{path}",
                params=query,
                headers={
                    "X-Client-Source": "mcp",
                    "Authorization": f"Bearer {access_token}",
                },
            )
            response.raise_for_status()
            return json.dumps(response.json())
        except httpx.HTTPStatusError as error:
            return f"Backend error: received status code {error.response.status_code}."
        except httpx.RequestError:
            return "Connection error: failed to reach the internal FastAPI service."


@mcp.tool()
async def get_short_selling_records(
    date_from: str | None = None,
    date_to: str | None = None,
    symbol: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> str:
    """Retrieve cached short-selling records with optional date and symbol filters."""
    return await _get(
        "/short-selling",
        {"date_from": date_from, "date_to": date_to, "symbol": symbol, "limit": limit, "offset": offset},
    )


@mcp.tool()
async def get_short_selling_summary(date_from: str | None = None, date_to: str | None = None) -> str:
    """Totals for a date range (YYYY-MM-DD): quantity, records, symbols, trading days, peak day, top symbol."""
    return await _get("/short-selling/summary", {"date_from": date_from, "date_to": date_to})


@mcp.tool()
async def get_daily_short_selling_totals(
    date_from: str | None = None, date_to: str | None = None
) -> str:
    """Total shorted quantity and distinct symbols for each trading day in a range."""
    return await _get("/short-selling/daily-totals", {"date_from": date_from, "date_to": date_to})


@mcp.tool()
async def get_top_short_sold_symbols(
    date_from: str | None = None, date_to: str | None = None, limit: int = 10
) -> str:
    """Symbols ranked by total shorted quantity in a date range (limit 1-50)."""
    return await _get(
        "/short-selling/top-symbols", {"date_from": date_from, "date_to": date_to, "limit": limit}
    )


@mcp.tool()
async def search_symbols(query: str, limit: int = 20) -> str:
    """Find symbols by symbol prefix or part of the security name."""
    return await _get("/short-selling/symbols", {"q": query, "limit": limit})


@mcp.tool()
async def get_symbol_short_selling_stats(symbol: str) -> str:
    """All-time short-selling statistics for one NSE symbol (e.g. RELIANCE, M&M)."""
    return await _get(f"/short-selling/symbols/{quote(symbol.strip().upper(), safe='')}")


@mcp.tool()
async def get_short_selling_coverage() -> str:
    """Earliest and latest dates in the data plus record and symbol counts."""
    return await _get("/short-selling/coverage")


# to allow proper server execution with standard input and TTY enabled
if __name__ == "__main__":
    mcp.run()
