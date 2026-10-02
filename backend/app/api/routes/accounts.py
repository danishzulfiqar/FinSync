"""Accounts (user-owned) and provider metadata endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import get_providers_config
from app.database import get_db
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.account import AccountCreate, AccountOut

router = APIRouter(tags=["accounts"])


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


@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AccountOut]:
    """The signed-in user's accounts."""
    rows = db.execute(
        select(Account)
        .where(Account.user_id == current_user.id)
        .order_by(Account.created_at.asc())
    ).scalars().all()
    return [AccountOut.model_validate(r) for r in rows]


@router.post(
    "/accounts", response_model=AccountOut, status_code=status.HTTP_201_CREATED
)
def create_account(
    payload: AccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AccountOut:
    account = Account(
        user_id=current_user.id,
        name=payload.name.strip(),
        provider=payload.provider.lower(),
        type=payload.type,
        mask=payload.mask,
        opening_balance=payload.opening_balance,
        color=payload.color,
    )
    db.add(account)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this provider and number already exists.",
        )
    db.refresh(account)
    return AccountOut.model_validate(account)


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    account = db.get(Account, account_id)
    if account is None or account.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found."
        )
    db.delete(account)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/accounts/summary")
def accounts_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Distinct (provider, account_identifier) pairs seen in transactions."""
    rows = db.execute(
        select(
            Transaction.provider,
            Transaction.account_identifier,
            func.count(Transaction.id),
        )
        .where(Transaction.user_id == current_user.id)
        .group_by(Transaction.provider, Transaction.account_identifier)
    ).all()
    accounts = [
        {"provider": p, "account_identifier": acc, "transaction_count": cnt}
        for (p, acc, cnt) in rows
    ]
    return {"accounts": accounts}
