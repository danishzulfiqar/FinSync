"""Deduplication and reconciliation logic.

Given a freshly parsed transaction, decide whether it is:
  - UNIQUE            -> insert a new transaction
  - EXACT_DUPLICATE   -> same fingerprint already exists (attach source only)
  - PROBABLE_DUPLICATE-> very likely the same event from another channel
  - NEEDS_REVIEW      -> looks similar but cannot be merged safely

Phase 1 wires up EXACT and PROBABLE detection. When two records look like the
same transaction but cannot be safely merged, BOTH are kept and a reconciliation
relationship (shared transaction via an extra source row) is preferred over
silent deletion.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import DedupStatus
from app.models.transaction import Transaction
from app.schemas.parsed import ParsedTransaction


@dataclass
class DedupResult:
    status: DedupStatus
    existing: Transaction | None = None


def find_duplicate(
    db: Session,
    tx: ParsedTransaction,
    fingerprint: str,
    time_window_seconds: int = 180,
    probable_enabled: bool = True,
    *,
    user_id: int | None = None,
) -> DedupResult:
    # 1. Exact fingerprint match (scoped to the owner when known).
    exact_q = select(Transaction).where(Transaction.fingerprint == fingerprint)
    if user_id is not None:
        exact_q = exact_q.where(Transaction.user_id == user_id)
    existing = db.execute(exact_q).scalar_one_or_none()
    if existing is not None:
        return DedupResult(DedupStatus.EXACT_DUPLICATE, existing)

    if not probable_enabled or tx.transaction_datetime is None:
        return DedupResult(DedupStatus.UNIQUE)

    # 2. Probable duplicate: same provider + type + amount within a time window.
    lo = tx.transaction_datetime - timedelta(seconds=time_window_seconds)
    hi = tx.transaction_datetime + timedelta(seconds=time_window_seconds)
    probable_q = select(Transaction).where(
        Transaction.provider == tx.provider.value,
        Transaction.transaction_type == tx.transaction_type.value,
        Transaction.amount == tx.amount,
        Transaction.transaction_datetime.is_not(None),
        Transaction.transaction_datetime >= lo,
        Transaction.transaction_datetime <= hi,
    )
    if user_id is not None:
        probable_q = probable_q.where(Transaction.user_id == user_id)
    candidate = db.execute(probable_q).scalars().first()

    if candidate is None:
        return DedupResult(DedupStatus.UNIQUE)

    # If references exist and agree (or one is missing), treat as the same event.
    ref_a = (tx.reference or "").lower()
    ref_b = (candidate.reference or "").lower()
    if not ref_a or not ref_b or ref_a == ref_b:
        return DedupResult(DedupStatus.PROBABLE_DUPLICATE, candidate)

    # Same money/time but conflicting references -> keep both, flag for review.
    return DedupResult(DedupStatus.NEEDS_REVIEW, candidate)
