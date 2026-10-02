"""Analytics endpoints: summary, monthly, provider breakdown."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.models.user import User

router = APIRouter(tags=["analytics"])


def _to_float(value: Decimal | None) -> float:
    return float(value) if value is not None else 0.0


@router.get("/analytics/summary")
def analytics_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Income vs expenses, net, and per-provider breakdown."""
    income = db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == current_user.id,
            Transaction.transaction_type == TransactionType.CREDIT.value,
        )
    ).scalar_one()
    expenses = db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == current_user.id,
            Transaction.transaction_type == TransactionType.DEBIT.value,
        )
    ).scalar_one()

    by_provider_rows = db.execute(
        select(
            Transaction.provider,
            Transaction.transaction_type,
            func.coalesce(func.sum(Transaction.amount), 0),
            func.count(Transaction.id),
        )
        .where(Transaction.user_id == current_user.id)
        .group_by(Transaction.provider, Transaction.transaction_type)
    ).all()

    providers: dict[str, dict] = {}
    for provider, ttype, total, count in by_provider_rows:
        entry = providers.setdefault(
            provider, {"provider": provider, "credit": 0.0, "debit": 0.0, "count": 0}
        )
        entry[ttype] = _to_float(total)
        entry["count"] += count

    return {
        "income": _to_float(income),
        "expenses": _to_float(expenses),
        "net": _to_float(income) - _to_float(expenses),
        "by_provider": list(providers.values()),
    }


@router.get("/analytics/monthly")
def analytics_monthly(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Monthly income/expense buckets by YYYY-MM."""
    month = func.to_char(Transaction.transaction_datetime, "YYYY-MM")
    rows = db.execute(
        select(
            month.label("month"),
            Transaction.transaction_type,
            func.coalesce(func.sum(Transaction.amount), 0),
        )
        .where(
            Transaction.user_id == current_user.id,
            Transaction.transaction_datetime.is_not(None),
        )
        .group_by("month", Transaction.transaction_type)
        .order_by("month")
    ).all()

    months: dict[str, dict] = {}
    for m, ttype, total in rows:
        entry = months.setdefault(m, {"month": m, "income": 0.0, "expenses": 0.0, "net": 0.0})
        if ttype == TransactionType.CREDIT.value:
            entry["income"] = _to_float(total)
        else:
            entry["expenses"] = _to_float(total)
        entry["net"] = entry["income"] - entry["expenses"]

    return {"months": list(months.values())}
