"""Transaction listing and detail endpoints with filtering + pagination."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionListResponse, TransactionOut

router = APIRouter(tags=["transactions"])


@router.get("/transactions", response_model=TransactionListResponse)
def list_transactions(
    provider: str | None = Query(default=None),
    type: str | None = Query(default=None, description="credit | debit"),
    category: str | None = Query(default=None),
    verified: bool | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    min_amount: float | None = Query(default=None),
    max_amount: float | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> TransactionListResponse:
    conditions = []
    if provider:
        conditions.append(Transaction.provider == provider)
    if type:
        conditions.append(Transaction.transaction_type == type)
    if category:
        conditions.append(Transaction.category == category)
    if verified is not None:
        conditions.append(Transaction.verified == verified)
    if start_date:
        conditions.append(Transaction.transaction_datetime >= start_date)
    if end_date:
        conditions.append(Transaction.transaction_datetime <= end_date)
    if min_amount is not None:
        conditions.append(Transaction.amount >= min_amount)
    if max_amount is not None:
        conditions.append(Transaction.amount <= max_amount)

    base = select(Transaction)
    if conditions:
        base = base.where(*conditions)

    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()

    rows = db.execute(
        base.options(selectinload(Transaction.sources))
        .order_by(Transaction.transaction_datetime.desc().nullslast(), Transaction.id.desc())
        .limit(limit)
        .offset(offset)
    ).scalars().all()

    return TransactionListResponse(
        items=[TransactionOut.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/transactions/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)) -> TransactionOut:
    row = db.execute(
        select(Transaction)
        .options(selectinload(Transaction.sources))
        .where(Transaction.id == transaction_id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transaction not found")
    return TransactionOut.model_validate(row)
