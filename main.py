from contextlib import asynccontextmanager
import os
import time          # Required for calculation of process time duration
import uuid          # Required for generating unique Correlation IDs
import json          # Required for formatting dictionary logs as JSON strings
import logging       # Required for initializing the logging subsystem
from typing import AsyncIterator

from fastapi import FastAPI, Request # Request object import for the telemetry middleware [health]
from fastapi.middleware.cors import CORSMiddleware
from api.v1.routers.users import router as users_router 
from api.v1.routers.short_selling import router as short_selling_router
from auth.routes import router as auth_router

from database import Base, engine
import models


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    yield

# Configure standard root logger to output clean JSON to the console screen
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("databix")

app = FastAPI(title="DataBix Reporting Service", lifespan=lifespan)
app.include_router(short_selling_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")

allowed_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def telemetry_middleware(request: Request, call_next):
    start_time = time.time()
    # 1. Capture or generate a Correlation ID to track the query lifecycle
    correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    client_type = "mcp_agent" if request.headers.get("X-Client-Source") == "mcp" else "react_frontend"
    
    response = await call_next(request)
    duration = time.time() - start_time
    
    # 2. Output a clean, single-line JSON log string
    log_data = {
        "timestamp": time.time(),
        "level": "INFO" if response.status_code < 400 else "ERROR",
        "correlation_id": correlation_id,
        "client": client_type,
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
