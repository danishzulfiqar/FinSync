"""Reconciliation tests: reference-based cross-channel dedup + enrichment.

An ABL statement import lands a generic incoming transfer (e.g.
"1LINK Inter-Bank FT 512375" with no merchant). The later "myABL Fund Transfer
Alert" email carries the sender name but timestamps the event minutes/days away
from the statement posting, so the tight time window cannot link them. A shared
bank reference should: (a) treat the email as the same event (no duplicate), and
(b) backfill the sender name onto the existing row.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.account import Account  # noqa: F401  (ensure mappers register)
from app.models.enums import Provider, SourceType, TransactionType
from app.models.transaction import Transaction
from app.models.transaction_source import TransactionSource  # noqa: F401
from app.schemas.parsed import ParsedTransaction
from app.services.ingestion.pipeline import ingest_parsed_transaction
from app.utils.fingerprint import raw_message_hash


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", future=True)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, future=True)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _statement_row(db) -> Transaction:
    row = Transaction(
        provider=Provider.ABL.value,
        account_identifier="****0017",
        transaction_type=TransactionType.CREDIT.value,
        amount=Decimal("204510.43"),
        currency="PKR",
        transaction_datetime=datetime(2026, 9, 1, 0, 0, tzinfo=timezone.utc),
        merchant=None,
        description="1LINK Inter-Bank FT 512375",
        reference=None,
        category="Other Income",
        source_type=SourceType.STATEMENT.value,
        fingerprint="stmt-fp-512375",
        confidence=0.9,
        user_id=1,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _email_tx() -> ParsedTransaction:
    return ParsedTransaction(
        provider=Provider.ABL,
        transaction_type=TransactionType.CREDIT,
        amount=Decimal("204510.43"),
        currency="PKR",
        account_identifier="****0017",
        # Hours apart from the statement posting -> outside the time window.
        transaction_datetime=datetime(2026, 9, 1, 1, 28, tzinfo=timezone.utc),
        merchant="ACME CORP",
        description="Inter Bank Fund Transfer",
        reference="512375",
        source_type=SourceType.EMAIL,
        source_message_id="email-1",
    )


def test_email_links_to_statement_row_by_reference_and_enriches(db) -> None:
    row = _statement_row(db)
    tx = _email_tx()
    raw_hash = raw_message_hash("abl", "email-1", "credit", "204510.43", "512375")

    result = ingest_parsed_transaction(
        db,
        tx,
        source_type=SourceType.EMAIL,
        source_id="email-1",
        raw_hash=raw_hash,
        user_id=1,
    )

    # No new financial row -- linked to the existing statement transaction.
    assert result.status == "linked"
    assert result.transaction_id == row.id
    assert db.query(Transaction).count() == 1

    # The generic statement row now shows who sent the money.
    db.refresh(row)
    assert row.merchant == "ACME CORP"
    assert row.category == "Other Income"


def test_email_does_not_overwrite_existing_merchant(db) -> None:
    row = _statement_row(db)
    row.merchant = "Manually Named"
    db.commit()

    tx = _email_tx()
    raw_hash = raw_message_hash("abl", "email-2", "credit", "204510.43", "512375")
    ingest_parsed_transaction(
        db,
        tx,
        source_type=SourceType.EMAIL,
        source_id="email-2",
        raw_hash=raw_hash,
        user_id=1,
    )

    db.refresh(row)
    assert row.merchant == "Manually Named"
