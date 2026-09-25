"""Accounts and providers metadata endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_providers_config
from app.database import get_db
from app.models.transaction import Transaction

router = APIRouter(tags=["metadata"])


@router.get("/providers")
def list_providers() -> dict:
    """Configured providers and their channels (from providers.yaml)."""
    providers = get_providers_config()
    out = []
    for key, cfg in providers.providers.items():
        out.append(
            {
                "key": key,
                "display_name": cfg.display_name,
                "default_currency": cfg.default_currency,
                "channels": {
                    "email": bool(cfg.email_senders),
                    "sms": bool(cfg.sms_senders),
                },
            }
        )
    return {"providers": out}


@router.get("/accounts")
def list_accounts(db: Session = Depends(get_db)) -> dict:
    """Distinct (provider, account_identifier) pairs seen in transactions."""
    rows = db.execute(
        select(
            Transaction.provider,
            Transaction.account_identifier,
            func.count(Transaction.id),
        ).group_by(Transaction.provider, Transaction.account_identifier)
    ).all()
    accounts = [
        {"provider": p, "account_identifier": acc, "transaction_count": cnt}
        for (p, acc, cnt) in rows
    ]
    return {"accounts": accounts}
