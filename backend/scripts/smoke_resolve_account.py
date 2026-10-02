"""Smoke test for statement->account auto-linking against the live dev DB.

Run: ./.venv/bin/python scripts/smoke_resolve_account.py
Creates a throwaway user, exercises resolve_account(), then rolls back.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.account import Account  # noqa: E402
from app.models.enums import Provider, SourceType, TransactionType  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from app.models.user import User  # noqa: E402
from app.parsers.statement_pdf import Statement  # noqa: E402
from app.schemas.parsed import ParsedTransaction  # noqa: E402
from app.services.statements.importer import resolve_account  # noqa: E402

UTC = timezone.utc


def _stmt(opening: str, acct: str = "PK00HABB0001234567890") -> Statement:
    return Statement(
        metadata={
            "layout": "hbl",
            "account_number": acct,
            "account_title": "SMOKE TESTER",
            "opening_balance": opening,
            "closing_balance": opening,
            "currency": "PKR",
        },
        transactions=[],
    )


def _parsed(dt: datetime) -> list[tuple[ParsedTransaction, str]]:
    tx = ParsedTransaction(
        provider=Provider.HBL,
        transaction_type=TransactionType.DEBIT,
        amount=Decimal("1"),
        currency="PKR",
        transaction_datetime=dt,
        source_type=SourceType.STATEMENT,
        source_message_id="x",
    )
    return [(tx, "k")]


def main() -> None:
    db = SessionLocal()
    email = "smoke+resolve@finsync.local"
    try:
        db.execute(select(User).where(User.email == email))
        user = User(email=email, full_name="Smoke", hashed_password=hash_password("x" * 12))
        db.add(user)
        db.commit()
        db.refresh(user)

        # 1. No account -> created with statement opening balance + last4 mask.
        aid, created = resolve_account(
            db, user_id=user.id, provider=Provider.HBL, stmt=_stmt("10,000.00"),
            parsed=_parsed(datetime(2025, 3, 1, tzinfo=UTC)),
        )
        acc = db.get(Account, aid)
        assert created and acc.mask == "•••• 7890" and acc.opening_balance == Decimal("10000.00")
        assert acc.name == "Smoke Tester" and acc.provider == "hbl"
        print("create: ok", acc.name, acc.mask, acc.opening_balance)

        # Link one transaction dated March so "earliest existing" is known.
        db.add(Transaction(
            user_id=user.id, account_id=aid, provider="HBL", transaction_type="debit",
            amount=Decimal("1"), currency="PKR", transaction_datetime=datetime(2025, 3, 5, tzinfo=UTC),
            source_type="statement", source_message_hash="h1", fingerprint="f1",
            confidence=1.0, verified=False,
        ))
        db.commit()

        # 2. Same account, LATER statement -> matched, opening untouched.
        aid2, created2 = resolve_account(
            db, user_id=user.id, provider=Provider.HBL, stmt=_stmt("99,999.00"),
            parsed=_parsed(datetime(2025, 4, 1, tzinfo=UTC)),
        )
        db.refresh(acc)
        assert aid2 == aid and not created2 and acc.opening_balance == Decimal("10000.00")
        print("match-later: ok (opening kept)", acc.opening_balance)

        # 3. Same account, EARLIER statement -> opening replaced by earlier printed opening.
        aid3, _ = resolve_account(
            db, user_id=user.id, provider=Provider.HBL, stmt=_stmt("5,000.00"),
            parsed=_parsed(datetime(2025, 1, 1, tzinfo=UTC)),
        )
        db.refresh(acc)
        assert aid3 == aid and acc.opening_balance == Decimal("5000.00")
        print("match-earlier: ok (opening updated)", acc.opening_balance)

        # 4. Placeholder-mask manual account gets claimed by a statement for that provider.
        manual = Account(user_id=user.id, name="My ABL", provider="abl", mask="•••• 0000")
        db.add(manual)
        db.commit()
        aid4, created4 = resolve_account(
            db, user_id=user.id, provider=Provider.ABL, stmt=_stmt("1.00", "0010020030041111"),
            parsed=_parsed(datetime(2025, 1, 1, tzinfo=UTC)),
        )
        db.refresh(manual)
        assert aid4 == manual.id and not created4 and manual.mask == "•••• 1111"
        print("claim-placeholder: ok", manual.mask)

        # 5. Different number for same provider -> new account, not merged.
        aid5, created5 = resolve_account(
            db, user_id=user.id, provider=Provider.ABL, stmt=_stmt("1.00", "0010020030042222"),
            parsed=_parsed(datetime(2025, 1, 1, tzinfo=UTC)),
        )
        assert created5 and aid5 not in (aid, manual.id)
        print("distinct-number: ok")
        print("ALL_OK")
    finally:
        db.rollback()
        u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if u:
            db.delete(u)  # cascades accounts; transactions rows for user removed below
            db.execute(Transaction.__table__.delete().where(Transaction.user_id == u.id))
            db.commit()
        db.close()


if __name__ == "__main__":
    main()
