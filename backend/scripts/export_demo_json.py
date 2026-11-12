"""Export the seeded demo account to a static JSON snapshot for the frontend.

The public demo must load instantly, so instead of authenticating and paging
the API (slow on a cold Render backend) the frontend reads a bundled snapshot.
This script reads the demo user from the LOCAL database (must be seeded first
via scripts/seed_demo.py) and writes it in the exact backend DTO shapes the
frontend already maps (AccountOut / TransactionOut / PreferencesOut) to
frontend/src/data/demo.json.

    python scripts/export_demo_json.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from sqlalchemy import select

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.database import SessionLocal  # noqa: E402
from app.models.account import Account  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from app.models.user import User  # noqa: E402

DEMO_EMAIL = "demo@finsync.app"
OUT = BACKEND.parent / "frontend" / "src" / "data" / "demo.json"

# Mirrors the frontend DEFAULT_SETTINGS so the demo opens on the full range.
PREFERENCES = {
    "exclude_internal_transfers": False,
    "transfer_window_days": 3,
    "privacy_mode": False,
    "default_range": "all",
    "forecast_horizon": 6,
}


def _iso(dt) -> str | None:
    return dt.isoformat() if dt is not None else None


def main() -> None:
    db = SessionLocal()
    try:
        user = db.execute(
            select(User).where(User.email == DEMO_EMAIL)
        ).scalar_one_or_none()
        if user is None:
            sys.exit("ERROR: demo user not found — run scripts/seed_demo.py first.")

        accounts = db.execute(
            select(Account)
            .where(Account.user_id == user.id)
            .order_by(Account.created_at.asc())
        ).scalars().all()

        transactions = db.execute(
            select(Transaction)
            .where(Transaction.user_id == user.id)
            .order_by(Transaction.transaction_datetime.desc())
        ).scalars().all()

        acc_json = [
            {
                "id": a.id,
                "name": a.name,
                "provider": a.provider,
                "type": a.type,
                "mask": a.mask,
                "opening_balance": str(a.opening_balance),
                "currency": a.currency,
                "color": a.color,
                "is_active": a.is_active,
                "created_at": _iso(a.created_at),
            }
            for a in accounts
        ]

        tx_json = [
            {
                "id": t.id,
                "account_id": t.account_id,
                "provider": t.provider,
                "account_identifier": t.account_identifier,
                "transaction_type": t.transaction_type,
                "amount": str(t.amount),
                "currency": t.currency,
                "transaction_datetime": _iso(t.transaction_datetime),
                "merchant": t.merchant,
                "description": t.description,
                "reference": t.reference,
                "balance_after": (
                    str(t.balance_after) if t.balance_after is not None else None
                ),
                "category": t.category,
                "source_type": t.source_type,
                "confidence": t.confidence,
                "verified": t.verified,
                "created_at": _iso(t.created_at),
                "updated_at": _iso(t.updated_at),
                "sources": [],
            }
            for t in transactions
        ]

        payload = {
            "accounts": acc_json,
            "transactions": tx_json,
            "preferences": PREFERENCES,
        }
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        print(
            f"wrote {OUT.relative_to(BACKEND.parent)} "
            f"({len(acc_json)} accounts, {len(tx_json)} transactions)"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
