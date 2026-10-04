"""Gmail sync endpoint.

Triggers an incremental Gmail sync for the signed-in user: fetches provider
notification emails that arrived after the latest transaction already on record
(e.g. a bank statement's closing date), parses them, and ingests them through
the shared pipeline so account balances move forward. Idempotent — safe to call
repeatedly. Pass ``dry_run=true`` to preview parsed rows without saving.
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import get_providers_config
from app.database import get_db
from app.models.enums import Provider
from app.models.gmail_sync_state import GmailSyncState
from app.models.transaction import Transaction
from app.models.user import User
from app.parsers import get_email_parser
from app.services.gmail.client import build_service
from app.services.gmail.oauth import load_credentials
from app.services.gmail.sync import sync_user_gmail

router = APIRouter(tags=["sync"])


@router.get("/sync/gmail/status")
def gmail_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Whether the inbox is authorized and, per provider, where the sync stands."""
    try:
        connected = load_credentials() is not None
    except Exception:  # expired/revoked refresh token, unreachable Google, etc.
        connected = False

    config = get_providers_config()
    states = {
        s.provider: s
        for s in db.execute(select(GmailSyncState)).scalars().all()
    }
    providers = []
    for key, cfg in config.providers.items():
        enum = Provider[key.upper()]
        latest = db.execute(
            select(func.max(Transaction.transaction_datetime)).where(
                Transaction.user_id == current_user.id,
                Transaction.provider == enum.value,
            )
        ).scalar_one()
        state = states.get(key)
        providers.append(
            {
                "key": key,
                "label": cfg.display_name,
                # A provider is syncable once it has real senders and a parser.
                "configured": bool(cfg.email_senders)
                and not any("REPLACE_WITH" in s.upper() for s in cfg.email_senders)
                and get_email_parser(key) is not None,
                "last_sync_at": state.last_sync_at.isoformat()
                if state and state.last_sync_at
                else None,
                "latest_transaction_at": latest.isoformat() if latest else None,
            }
        )
    return {"connected": connected, "providers": providers}


@router.post("/sync/gmail")
def sync_gmail(
    provider: str | None = Query(default=None, description="hbl | abl | nayapay; all if omitted"),
    start_date: str | None = Query(
        default=None,
        description="Override Gmail after: YYYY/MM/DD. Defaults to the latest transaction on record.",
    ),
    end_date: str | None = Query(default=None, description="Gmail before: YYYY/MM/DD"),
    max_results: int | None = Query(
        default=None,
        ge=1,
        le=2000,
        description="Cap on messages scanned per provider. Omit to scan all matches.",
    ),
    dry_run: bool = Query(default=False, description="Parse & preview without saving."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    try:
        service = build_service()
    except Exception as exc:  # revoked/expired refresh token surfaces here
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail=f"Gmail authorization failed: {exc}. Re-run scripts/gmail_authorize.py.",
        ) from exc
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="Gmail not authorized. Run scripts/gmail_authorize.py first.",
        )

    results = sync_user_gmail(
        db,
        service,
        user_id=current_user.id,
        providers=[provider] if provider else None,
        start_date=start_date,
        before=end_date,
        max_results=max_results,
        dry_run=dry_run,
    )

    totals = {
        "matched": sum(r.matched for r in results),
        "parsed": sum(r.parsed for r in results),
        "created": sum(r.created for r in results),
        "duplicates": sum(r.duplicates for r in results),
        "linked": sum(r.linked for r in results),
        "needs_review": sum(r.needs_review for r in results),
    }
    return {
        "status": "ok",
        "dry_run": dry_run,
        "totals": totals,
        "providers": [asdict(r) for r in results],
    }
