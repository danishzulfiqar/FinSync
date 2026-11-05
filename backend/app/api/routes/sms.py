"""On-demand SMS sync via the android-sms-gateway Cloud API.

A sync asks the phone (through api.sms-gate.app) to replay its inbox for a date
range as batch webhooks; HBL SMS are ingested by POST /webhooks/sms as they
arrive. Nothing runs on new SMS by itself. Safe to call repeatedly (idempotent).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import get_settings
from app.database import get_db
from app.models.enums import Provider, SourceType
from app.models.transaction import Transaction
from app.models.user import User
from app.services.sms.cloud import CloudGateway, CloudGatewayError, webhook_url

router = APIRouter(tags=["sms"])


def _parse_dt(value: str | None, *, field: str) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid {field}: expected ISO 8601 (YYYY-MM-DD or full timestamp).",
        )
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("/sms/status")
def sms_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Whether the cloud gateway is configured and the latest HBL SMS on record."""
    latest = _latest_hbl_sms(db, current_user.id)
    return {
        "configured": get_settings().sms_cloud_configured,
        "latest_hbl_sms_at": latest.isoformat() if latest else None,
    }


def _latest_hbl_sms(db: Session, user_id: int) -> datetime | None:
    return db.execute(
        select(func.max(Transaction.transaction_datetime)).where(
            Transaction.user_id == user_id,
            Transaction.provider == Provider.HBL.value,
            Transaction.source_type == SourceType.SMS.value,
        )
    ).scalar_one()


@router.post("/sms/sync")
def sync_sms(
    since: str | None = Query(
        default=None,
        description="Replay SMS received at/after this ISO time. Defaults to the "
        "latest HBL SMS on record, else SMS_SYNC_DEFAULT_LOOKBACK_DAYS ago.",
    ),
    until: str | None = Query(default=None, description="Replay SMS before this ISO time (default now)."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    settings = get_settings()
    if not settings.sms_cloud_configured:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="SMS cloud gateway not configured. Set SMS_CLOUD_USERNAME, "
            "SMS_CLOUD_PASSWORD and SMS_WEBHOOK_PUBLIC_URL in backend/.env.",
        )

    until_dt = _parse_dt(until, field="until") or datetime.now(timezone.utc)
    since_dt = _parse_dt(since, field="since")
    if since_dt is None:
        latest = _latest_hbl_sms(db, current_user.id)
        if latest is not None:
            # Small overlap; re-seen messages are deduped on ingest.
            since_dt = (latest if latest.tzinfo else latest.replace(tzinfo=timezone.utc)) - timedelta(days=1)
        else:
            since_dt = until_dt - timedelta(days=settings.sms_sync_default_lookback_days)
    if since_dt >= until_dt:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="since must be before until")

    try:
        with CloudGateway(settings) as gw:
            device_id = gw.device_id()
            gw.ensure_batch_webhook(webhook_url(settings, current_user.id), device_id)
            gw.request_inbox_refresh(device_id, since_dt, until_dt)
    except CloudGatewayError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return {
        "status": "requested",
        "since": since_dt.isoformat(),
        "until": until_dt.isoformat(),
        "detail": "The phone will deliver matching SMS to the webhook shortly; "
        "check GET /sms/status or your transactions.",
    }
