"""FastAPI application entrypoint for FinSync."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    accounts,
    analytics,
    export,
    health,
    sync,
    transactions,
    webhooks,
)
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="FinSync",
    description="Personal finance transaction-ingestion system (ABL/HBL/NayaPay).",
    version="0.1.0",
)

# CORS: relaxed in development for the local React/Vite frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health at root (no version prefix) for probes.
app.include_router(health.router)

# Versioned API.
prefix = settings.api_v1_prefix
app.include_router(webhooks.router, prefix=prefix)
app.include_router(sync.router, prefix=prefix)
app.include_router(transactions.router, prefix=prefix)
app.include_router(accounts.router, prefix=prefix)
app.include_router(analytics.router, prefix=prefix)
app.include_router(export.router, prefix=prefix)


@app.get("/")
def root() -> dict:
    return {"name": "FinSync", "version": app.version, "docs": "/docs"}
