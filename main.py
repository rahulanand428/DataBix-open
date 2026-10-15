from contextlib import asynccontextmanager
import os
import time          # Required for calculation of process time duration
import uuid          # Required for generating unique Correlation IDs
import json          # Required for formatting dictionary logs as JSON strings
import logging       # Required for initializing the logging subsystem
import re
from typing import AsyncIterator

from fastapi import FastAPI, Request # Request object import for the telemetry middleware [health]
from fastapi.middleware.cors import CORSMiddleware
from api.v1.routers.users import router as users_router 
from api.v1.routers.short_selling import router as short_selling_router
from auth.routes import router as auth_router

from database import Base, engine
import models
from models.schema import upgrade_schema
from settings import env_flag


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    upgrade_schema(engine)
    yield

# Configure standard root logger to output clean JSON to the console screen
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("databix")

# Interactive docs and the OpenAPI schema are opt-in so production does not
# publish the full API surface by default.
docs_enabled = env_flag("API_DOCS_ENABLED")
app = FastAPI(
    title="DataBix Reporting Service",
    lifespan=lifespan,
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)
app.include_router(short_selling_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")

# Unset: local development origins. Set but empty (the Compose default): no
# cross-origin access, which suits a UI served from the same origin via nginx.
allowed_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    # Auth uses bearer headers, not cookies, so credentialed CORS is unnecessary.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

CORRELATION_ID_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,64}")
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}


@app.middleware("http")
async def telemetry_middleware(request: Request, call_next):
    start_time = time.time()
    # 1. Capture or generate a Correlation ID to track the query lifecycle.
    # Client-supplied IDs are accepted only in a safe, bounded format.
    correlation_id = request.headers.get("X-Correlation-ID", "")
    if not CORRELATION_ID_PATTERN.fullmatch(correlation_id):
        correlation_id = str(uuid.uuid4())
    # Self-reported by the caller; useful for dashboards, not for trust decisions.
    client_type = "mcp_agent" if request.headers.get("X-Client-Source") == "mcp" else "react_frontend"
    
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = correlation_id
    for header, value in SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    duration = time.time() - start_time
    
    # 2. Output a clean, single-line JSON log string
    log_data = {
        "timestamp": time.time(),
        "level": "INFO" if response.status_code < 400 else "ERROR",
        "correlation_id": correlation_id,
        "client": client_type,
        "client_ip": request.client.host if request.client else None,
        "method": request.method,
        "path": request.url.path,
        "status_code": response.status_code,
        "duration_ms": round(duration * 1000, 2)
    }
    logger.info(json.dumps(log_data))
    return response


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
