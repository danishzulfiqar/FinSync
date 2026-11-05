"""FastAPI application entrypoint for FinSync."""

from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import get_current_user
from app.api.routes import (
    accounts,
    analytics,
    auth,
    export,
    gmail_oauth,
    health,
    maintenance,
    preferences,
    sms,
    statements,
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

# CORS: allow the configured frontend origins (set CORS_ORIGINS in production).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health at root (no version prefix) for probes.
app.include_router(health.router)

# Versioned API.
prefix = settings.api_v1_prefix

# Public: authentication + inbound SMS webhooks (own HMAC auth).
app.include_router(auth.router, prefix=prefix)
app.include_router(webhooks.router, prefix=prefix)
# Gmail OAuth: callback is public (Google can't send a bearer token); the
# authorize endpoint enforces auth via its own dependency.
app.include_router(gmail_oauth.router, prefix=prefix)

# Protected: require a valid bearer token.
protected = [Depends(get_current_user)]
app.include_router(sync.router, prefix=prefix, dependencies=protected)
app.include_router(sms.router, prefix=prefix, dependencies=protected)
app.include_router(transactions.router, prefix=prefix, dependencies=protected)
app.include_router(accounts.router, prefix=prefix)
app.include_router(analytics.router, prefix=prefix, dependencies=protected)
app.include_router(export.router, prefix=prefix, dependencies=protected)
app.include_router(statements.router, prefix=prefix, dependencies=protected)
app.include_router(preferences.router, prefix=prefix, dependencies=protected)
app.include_router(maintenance.router, prefix=prefix, dependencies=protected)


@app.get("/")
def root() -> dict:
    return {"name": "FinSync", "version": app.version, "docs": "/docs"}
