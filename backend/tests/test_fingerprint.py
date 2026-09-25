"""Fingerprint + deduplication-identity tests.

These use synthetic, anonymized data only. They verify that the same logical
transaction arriving via two channels (email vs SMS) collides on fingerprint,
while genuinely different transactions do not.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from app.models.enums import Provider, SourceType, TransactionType
from app.schemas.parsed import ParsedTransaction
from app.utils.fingerprint import compute_fingerprint


def _tx(source_type: SourceType, seconds: int = 0, **overrides) -> ParsedTransaction:
    base = dict(
        provider=Provider.HBL,
        transaction_type=TransactionType.DEBIT,
        amount=Decimal("2500.00"),
        currency="PKR",
        account_identifier="****1234",
        transaction_datetime=datetime(2026, 9, 25, 19, 32, seconds, tzinfo=timezone.utc),
        reference="ABC123",
        source_type=source_type,
    )
    base.update(overrides)
    return ParsedTransaction(**base)


def test_same_transaction_email_and_sms_collide() -> None:
    email = _tx(SourceType.EMAIL, seconds=0, description="Bank transfer")
    sms = _tx(SourceType.SMS, seconds=20, description="Card purchase")
    # Different descriptions and a small time gap must NOT change the fingerprint.
    assert compute_fingerprint(email) == compute_fingerprint(sms)


def test_different_amount_differs() -> None:
    a = _tx(SourceType.SMS)
    b = _tx(SourceType.SMS, amount=Decimal("2500.01"))
    assert compute_fingerprint(a) != compute_fingerprint(b)


def test_different_reference_differs() -> None:
    a = _tx(SourceType.SMS)
    b = _tx(SourceType.SMS, reference="ZZZ999")
    assert compute_fingerprint(a) != compute_fingerprint(b)


def test_credit_vs_debit_differs() -> None:
    a = _tx(SourceType.SMS, transaction_type=TransactionType.DEBIT)
    b = _tx(SourceType.SMS, transaction_type=TransactionType.CREDIT)
    assert compute_fingerprint(a) != compute_fingerprint(b)
