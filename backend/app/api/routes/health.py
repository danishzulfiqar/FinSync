"""Health and readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Liveness probe — does not touch the database."""
    return {"status": "ok"}


@router.get("/health/db")
def health_db(db: Session = Depends(get_db)) -> dict:
    """Readiness probe — verifies database connectivity."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}
