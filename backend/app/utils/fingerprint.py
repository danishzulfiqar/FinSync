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


def compute_fingerprint(tx: ParsedTransaction, time_window_seconds: int = 180) -> str:
    """Deterministic SHA-256 fingerprint of the financial identity of a txn.

    Uses provider + type + amount + currency + account_last4 + reference +
    a time bucket. Reference and account are included when present because they
    strongly disambiguate; the time bucket lets email/SMS of the same event
    collide even if their timestamps differ slightly.
    """
    parts = [
        tx.provider.value,
        tx.transaction_type.value,
        _norm_amount(tx.amount),
        (tx.currency or "PKR").upper(),
        (tx.account_identifier or "").lower(),
        (tx.reference or "").lower(),
        _time_bucket(tx.transaction_datetime, time_window_seconds),
    ]
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def raw_message_hash(*parts: str | None) -> str:
    """SHA-256 over normalized raw message parts, used for source idempotency."""
    joined = "|".join((p or "").strip() for p in parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()
