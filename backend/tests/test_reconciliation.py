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
from app.services.maintenance import dedupe_statement_balance_duplicates
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


def _balance_row(db, *, reference: str | None, dt: datetime, source_id: str) -> Transaction:
    row = Transaction(
        provider=Provider.HBL.value,
        account_id=7,
        account_identifier="HBL-5003",
        transaction_type=TransactionType.CREDIT.value,
        amount=Decimal("48796.18"),
        currency="PKR",
        transaction_datetime=dt,
        balance_after=Decimal("90857.31"),
        description="Funds transfer",
        reference=reference,
        source_type=SourceType.STATEMENT.value,
        fingerprint=f"fp-{source_id}",
        confidence=0.9,
        user_id=1,
    )
    db.add(row)
    db.flush()
    db.add(
        TransactionSource(
            transaction_id=row.id,
            source_type=SourceType.STATEMENT.value,
            source_id=source_id,
            raw_hash=f"hash-{source_id}",
        )
    )
    db.commit()
    db.refresh(row)
    return row


def test_balance_dedup_collapses_reimport_with_differing_reference(db) -> None:
    """Same ledger line re-imported with a different reference/time -> one row."""
    keeper = _balance_row(
        db,
        reference="07699408460989",
        dt=datetime(2026, 5, 29, 0, 0, tzinfo=timezone.utc),
        source_id="stmt-a-row5",
    )
    # Re-upload of an overlapping PDF: reference parsed as None, noon timestamp.
    loser = _balance_row(
        db,
        reference=None,
        dt=datetime(2026, 5, 29, 7, 0, tzinfo=timezone.utc),
        source_id="stmt-b-row2",
    )
    assert keeper.fingerprint != loser.fingerprint  # fingerprint dedup missed them

    result = dedupe_statement_balance_duplicates(db, user_id=1)

    assert result["duplicate_groups"] == 1
    assert result["removed"] == 1
    remaining = db.query(Transaction).all()
    assert len(remaining) == 1
    # The richer row (carrying a reference) survives...
    assert remaining[0].id == keeper.id
    assert remaining[0].reference == "07699408460989"
    # ...and the loser's source was repointed onto it (nothing lost).
    source_ids = {s.source_id for s in remaining[0].sources}
    assert source_ids == {"stmt-a-row5", "stmt-b-row2"}


def test_balance_dedup_keeps_distinct_lines(db) -> None:
    """Different running balances are different ledger lines -> never merged."""
    _balance_row(
        db,
        reference="A",
        dt=datetime(2026, 5, 29, 0, 0, tzinfo=timezone.utc),
        source_id="row-1",
    )
    other = Transaction(
        provider=Provider.HBL.value,
        account_id=7,
        account_identifier="HBL-5003",
        transaction_type=TransactionType.CREDIT.value,
        amount=Decimal("48796.18"),
        currency="PKR",
        transaction_datetime=datetime(2026, 5, 29, 0, 0, tzinfo=timezone.utc),
        balance_after=Decimal("139653.49"),  # different running balance
        description="Funds transfer",
        reference="B",
        source_type=SourceType.STATEMENT.value,
        fingerprint="fp-other",
        confidence=0.9,
        user_id=1,
    )
    db.add(other)
    db.commit()

    result = dedupe_statement_balance_duplicates(db, user_id=1)

    assert result["duplicate_groups"] == 0
    assert result["removed"] == 0
    assert db.query(Transaction).count() == 2
