"""Ingestion pipeline: parsed transaction -> fingerprint -> dedup -> persist.

This is the single choke point for writing transactions, so idempotency and
deduplication rules are enforced in exactly one place regardless of whether the
input came from email or SMS.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_providers_config, get_settings
from app.models.enums import DedupStatus, SourceType
from app.models.transaction import Transaction
from app.models.transaction_source import TransactionSource
from app.schemas.parsed import ParsedTransaction
from app.services.categorization.rules import categorize
from app.services.reconciliation.dedup import find_duplicate
from app.utils.fingerprint import compute_fingerprint


@dataclass
class IngestResult:
    status: str  # created | duplicate | linked | needs_review | ignored
    transaction_id: int | None = None
    detail: str | None = None


def ingest_parsed_transaction(
    db: Session,
    tx: ParsedTransaction,
    *,
    source_type: SourceType,
    source_id: str,
    raw_hash: str,
    source_thread_id: str | None = None,
) -> IngestResult:
    """Persist a parsed transaction idempotently.

    Returns without creating anything if the same source (by source_id or
    raw_hash) has already been ingested, making re-processing safe.
    """
    settings = get_settings()
    providers = get_providers_config()

    # ---- Idempotency: has this exact source already been ingested? ----
    already = db.execute(
        select(TransactionSource).where(
            (TransactionSource.source_type == source_type.value)
            & (TransactionSource.source_id == source_id)
        )
    ).scalar_one_or_none()
    if already is None:
        already = db.execute(
            select(TransactionSource).where(TransactionSource.raw_hash == raw_hash)
        ).scalar_one_or_none()
    if already is not None:
        return IngestResult("duplicate", already.transaction_id, "source already ingested")

    fingerprint = compute_fingerprint(tx, settings.dedup_time_window_seconds)
    dedup = find_duplicate(
        db,
        tx,
        fingerprint,
        time_window_seconds=settings.dedup_time_window_seconds,
        probable_enabled=settings.dedup_probable_enabled,
    )

    # ---- Attach source to an existing transaction (no new financial record) ----
    if dedup.existing is not None and dedup.status in (
        DedupStatus.EXACT_DUPLICATE,
        DedupStatus.PROBABLE_DUPLICATE,
    ):
        _attach_source(
            db,
            transaction_id=dedup.existing.id,
            source_type=source_type,
            source_id=source_id,
            raw_hash=raw_hash,
            received_at=tx.transaction_datetime,
            source_thread_id=source_thread_id,
        )
        # A corroborating second channel raises our confidence in the record.
        if dedup.status == DedupStatus.PROBABLE_DUPLICATE:
            dedup.existing.confidence = min(1.0, max(dedup.existing.confidence, tx.confidence) + 0.05)
        db.commit()
        status = "duplicate" if dedup.status == DedupStatus.EXACT_DUPLICATE else "linked"
        return IngestResult(status, dedup.existing.id, dedup.status.value)

    # ---- NEEDS_REVIEW: keep both, but flag the new one ----
    verified = False
    confidence = tx.confidence
    if dedup.status == DedupStatus.NEEDS_REVIEW:
        confidence = min(confidence, 0.5)

    transaction = Transaction(
        provider=tx.provider.value,
        account_identifier=tx.account_identifier,
        transaction_type=tx.transaction_type.value,
        amount=tx.amount,
        currency=tx.currency,
        transaction_datetime=tx.transaction_datetime,
        merchant=tx.merchant,
        description=tx.description,
        reference=tx.reference,
        balance_after=tx.balance_after,
        category=categorize(tx, providers),
        source_type=source_type.value,
        source_message_id=tx.source_message_id,
        source_message_hash=raw_hash,
        raw_data=tx.raw_data,
        fingerprint=fingerprint,
        confidence=confidence,
        verified=verified,
    )
    db.add(transaction)
    db.flush()  # assign transaction.id

    _attach_source(
        db,
        transaction_id=transaction.id,
        source_type=source_type,
        source_id=source_id,
        raw_hash=raw_hash,
        received_at=tx.transaction_datetime,
        source_thread_id=source_thread_id,
    )
    db.commit()

    status = "needs_review" if dedup.status == DedupStatus.NEEDS_REVIEW else "created"
    return IngestResult(status, transaction.id, dedup.status.value)


def _attach_source(
    db: Session,
    *,
    transaction_id: int,
    source_type: SourceType,
    source_id: str,
    raw_hash: str,
    received_at,
    source_thread_id: str | None,
) -> None:
    db.add(
        TransactionSource(
            transaction_id=transaction_id,
            source_type=source_type.value,
            source_id=source_id,
            source_thread_id=source_thread_id,
            received_at=received_at,
            raw_hash=raw_hash,
        )
    )
