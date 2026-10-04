"""Transaction fingerprinting for deduplication.

The fingerprint deliberately combines multiple stable attributes so the same
financial transaction produces the same fingerprint regardless of whether it
arrived via email or SMS. It intentionally excludes free-text ``description``
(which differs between channels) and uses a rounded time bucket so timestamps
that differ by a few seconds still collide.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from decimal import Decimal

from app.schemas.parsed import ParsedTransaction


def _time_bucket(dt: datetime | None, window_seconds: int) -> str:
    if dt is None:
        return "0"
    epoch = int(dt.timestamp())
    return str(epoch - (epoch % max(window_seconds, 1)))


def _norm_amount(amount: Decimal | None) -> str:
    if amount is None:
        return "0"
    return f"{Decimal(amount):.2f}"


def compute_fingerprint(
    tx: ParsedTransaction,
    time_window_seconds: int = 180,
    *,
    user_id: int | None = None,
    extra: str | None = None,
) -> str:
    """Deterministic SHA-256 fingerprint of the financial identity of a txn.

    Uses provider + type + amount + currency + account_last4 + reference +
    a time bucket. Reference and account are included when present because they
    strongly disambiguate; the time bucket lets email/SMS of the same event
    collide even if their timestamps differ slightly.

    ``user_id`` scopes the fingerprint so two people can hold identical
    transactions without colliding. ``extra`` is an optional per-row
    discriminator (used by statement import, where several legitimate rows may
    share provider+type+amount+date) that keeps distinct rows distinct while
    staying deterministic across re-uploads.
    """
    return fingerprint_from_fields(
        provider=tx.provider.value,
        transaction_type=tx.transaction_type.value,
        amount=tx.amount,
        currency=tx.currency,
        account_identifier=tx.account_identifier,
        reference=tx.reference,
        transaction_datetime=tx.transaction_datetime,
        time_window_seconds=time_window_seconds,
        user_id=user_id,
        extra=extra,
    )


def fingerprint_from_fields(
    *,
    provider: str,
    transaction_type: str,
    amount: Decimal | None,
    currency: str | None,
    account_identifier: str | None,
    reference: str | None,
    transaction_datetime: datetime | None,
    time_window_seconds: int = 180,
    user_id: int | None = None,
    extra: str | None = None,
) -> str:
    """Primitive-field fingerprint — the single source of truth shared by the
    ingestion pipeline and the de-duplication maintenance script, so a stored
    record and a freshly parsed re-import always agree."""
    parts = [
        "" if user_id is None else str(user_id),
        provider,
        transaction_type,
        _norm_amount(amount),
        (currency or "PKR").upper(),
        (account_identifier or "").lower(),
        (reference or "").lower(),
        _time_bucket(transaction_datetime, time_window_seconds),
        (extra or "").lower(),
    ]
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def statement_fingerprint_extra(
    balance_after: Decimal | None, description: str | None
) -> str:
    """Stable per-row discriminator for statement dedup.

    The printed running balance is unique to a row's position in the ledger, so
    the same transaction re-imported from an overlapping statement collides
    regardless of the PDF's file name or the row's index. Falls back to the
    description when a statement omits balances.
    """
    if balance_after is not None:
        return f"bal:{Decimal(balance_after):.2f}"
    return f"desc:{(description or '').strip().lower()}"



def raw_message_hash(*parts: str | None) -> str:
    """SHA-256 over normalized raw message parts, used for source idempotency."""
    joined = "|".join((p or "").strip() for p in parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()
