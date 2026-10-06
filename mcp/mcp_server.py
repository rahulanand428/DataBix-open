import json
import os

import httpx
from mcp.server.fastmcp import FastMCP

# Initialize the server
mcp = FastMCP("Databix API Proxy")

# Resolve the backend service URL inside the Docker Compose network
# Defaults to localhost for easy local testing outside Docker
BACKEND_URL = os.getenv("BACKEND_INTERNAL_URL", "http://fastapi_backend:8000")
BACKEND_USERNAME = os.getenv("BACKEND_USERNAME")
BACKEND_PASSWORD = os.getenv("BACKEND_PASSWORD")

@mcp.tool()
async def get_short_selling_records(
    date_from: str | None = None,
    date_to: str | None = None,
    symbol: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> str:
    """Retrieve cached short-selling records with optional date and symbol filters."""
    target_url = f"{BACKEND_URL}/api/v1/short-selling"
    params = {
        key: value
        for key, value in {
            "date_from": date_from,
            "date_to": date_to,
            "symbol": symbol,
            "limit": limit,
            "offset": offset,
        }.items()
        if value is not None
    }

    if not BACKEND_USERNAME or not BACKEND_PASSWORD:
        return "Authentication error: configure BACKEND_USERNAME and BACKEND_PASSWORD."

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            token_response = await client.post(
                f"{BACKEND_URL}/api/v1/auth/token",
                data={"username": BACKEND_USERNAME, "password": BACKEND_PASSWORD},
            )
            token_response.raise_for_status()
            access_token = token_response.json()["access_token"]
            response = await client.get(
                target_url,
                params=params,
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

# to allow proper server execution with standard input and TTY enabled
if __name__ == "__main__":
    mcp.run()
