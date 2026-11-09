"""Seed (or refresh) the public demo account.

Creates a stable, read-only-feeling demo user with a handful of accounts and
roughly six months of realistic synthetic transactions so that a visitor who
clicks "View live demo" on the landing page lands on a dashboard that is
already alive — KPIs, cash-flow, spending breakdown, account mix and the
forecast all have something meaningful to show.

The script is idempotent: it fully removes any previous demo data (scoped to
the demo user only) and regenerates it deterministically, so repeated runs
produce the same dataset. No real user's data is ever touched.

Usage:
  python scripts/seed_demo.py            # seed the LOCAL db (backend/.env)
  python scripts/seed_demo.py --prod     # seed the PROD db (PROD_DATABASE_URL / backend/.env.prod)
"""

from __future__ import annotations

import argparse
import os
import random
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session, sessionmaker

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.core.security import hash_password  # noqa: E402
from app.database import engine as local_engine  # noqa: E402
from app.models.account import Account  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from app.models.user import User  # noqa: E402
from app.utils.fingerprint import fingerprint_from_fields  # noqa: E402

DEMO_EMAIL = "demo@finsync.app"
DEMO_PASSWORD = "finsyncdemo"
DEMO_NAME = "Demo User"

# A fixed seed keeps the dataset stable across runs (and across environments).
RNG = random.Random(20260207)


# --- account blueprint -----------------------------------------------------

ACCOUNTS = [
    {
        "name": "HBL Current",
        "provider": "hbl",
        "type": "current",
        "mask": "•••• 4821",
        "ident": "4821",
        "opening_balance": Decimal("184500.00"),
        "color": "#2563eb",
    },
    {
        "name": "ABL Savings",
        "provider": "abl",
        "type": "savings",
        "mask": "•••• 7310",
        "ident": "7310",
        "opening_balance": Decimal("326000.00"),
        "color": "#16a34a",
    },
    {
        "name": "NayaPay Wallet",
        "provider": "nayapay",
        "type": "wallet",
        "mask": "•••• 1193",
        "ident": "1193",
        "opening_balance": Decimal("9800.00"),
        "color": "#7c3aed",
    },
]


def _dt(day: datetime, hour: int, minute: int) -> datetime:
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _rupees(lo: int, hi: int, step: int = 50) -> Decimal:
    v = RNG.randrange(lo, hi + 1, step)
    return Decimal(v).quantize(Decimal("0.01"))


def build_events(months: int = 6) -> list[dict]:
    """Return a chronologically-ordered list of transaction event dicts.

    Each event carries the business facts; running balances and fingerprints
    are filled in later once accounts have ids.
    """
    events: list[dict] = []
    now = datetime.now(timezone.utc)
    # Start at the first day of the month, ``months`` months back.
    first = (now.replace(day=1) - timedelta(days=1)).replace(day=1)
    for _ in range(months - 1):
        first = (first - timedelta(days=1)).replace(day=1)

    groceries = ["Imtiaz Super Market", "Carrefour", "Al-Fatah", "Metro Cash & Carry"]
    dining = ["Foodpanda", "KFC", "Kolachi", "Howdy", "OPTP", "Kaybees"]
    fuel = ["Shell", "PSO", "Total Parco", "Attock Petroleum"]
    rides = ["Careem", "inDrive", "Bykea"]

    month = first
    while month <= now:
        y, m = month.year, month.month
        base = datetime(y, m, 1, tzinfo=timezone.utc)

        def day(d: int) -> datetime:
            # Clamp to the month length so Feb etc. never overflows.
            dd = min(d, 28)
            return base.replace(day=dd)

        # Salary — the anchor credit.
        events.append({
            "acc": "hbl", "type": "credit", "amount": _rupees(445000, 465000, 500),
            "when": _dt(day(1), 9, 5), "category": "Salary",
            "merchant": "ACME CORP Payroll", "desc": "Monthly salary credit",
            "ref": f"SAL{y}{m:02d}",
        })
        # Savings profit.
        events.append({
            "acc": "abl", "type": "credit", "amount": _rupees(2400, 3200, 10),
            "when": _dt(day(1), 0, 15), "category": "Profit & Returns",
            "merchant": "Allied Bank", "desc": "Monthly profit on savings",
            "ref": f"PRF{y}{m:02d}",
        })
        # Rent / housing.
        events.append({
            "acc": "hbl", "type": "debit", "amount": Decimal("85000.00"),
            "when": _dt(day(3), 11, 0), "category": "Bills & Utilities",
            "merchant": "City Housing", "desc": "Monthly rent", "ref": f"RENT{m:02d}",
        })
        # Utilities.
        events.append({
            "acc": "hbl", "type": "debit", "amount": _rupees(8000, 16000),
            "when": _dt(day(10), 13, 20), "category": "Bills & Utilities",
            "merchant": "K-Electric", "desc": "Electricity bill", "ref": f"KE{m:02d}",
        })
        events.append({
            "acc": "hbl", "type": "debit", "amount": Decimal("5500.00"),
            "when": _dt(day(8), 10, 0), "category": "Telecom & Mobile",
            "merchant": "StormFiber", "desc": "Home internet", "ref": f"NET{m:02d}",
        })
        # Subscriptions.
        for name, amt, d in (("Netflix", 1400, 14), ("Spotify", 500, 6), ("iCloud+", 350, 18)):
            events.append({
                "acc": "hbl", "type": "debit", "amount": Decimal(amt),
                "when": _dt(day(d), 7, 30), "category": "Subscriptions",
                "merchant": name, "desc": f"{name} subscription", "ref": f"SUB{name[:3].upper()}{m:02d}",
            })
        # Transfer HBL -> NayaPay wallet (two legs, so it reads as a transfer).
        xfer = _rupees(12000, 18000, 500)
        events.append({
            "acc": "hbl", "type": "debit", "amount": xfer,
            "when": _dt(day(5), 18, 0), "category": "Transfers Out",
            "merchant": "NayaPay Wallet", "desc": "Top-up wallet", "ref": f"TRF{m:02d}",
        })
        events.append({
            "acc": "nayapay", "type": "credit", "amount": xfer,
            "when": _dt(day(5), 18, 1), "category": "Transfers In",
            "merchant": "HBL Current", "desc": "Wallet top-up", "ref": f"TRF{m:02d}",
        })
        # Groceries (weekly-ish).
        for wk in (6, 13, 20, 26):
            events.append({
                "acc": "hbl", "type": "debit", "amount": _rupees(4000, 9500),
                "when": _dt(day(wk), 19, RNG.randint(0, 59)), "category": "Groceries & Shopping",
                "merchant": RNG.choice(groceries), "desc": "Groceries", "ref": f"GRO{m:02d}{wk}",
            })
        # Dining out.
        for _ in range(RNG.randint(6, 9)):
            d = RNG.randint(2, 27)
            events.append({
                "acc": RNG.choice(["hbl", "nayapay"]), "type": "debit",
                "amount": _rupees(600, 3800), "when": _dt(day(d), RNG.randint(12, 22), RNG.randint(0, 59)),
                "category": "Food & Dining", "merchant": RNG.choice(dining),
                "desc": "Dining", "ref": f"DIN{m:02d}{d}",
            })
        # Fuel.
        for d in (7, 17, 27):
            events.append({
                "acc": "hbl", "type": "debit", "amount": _rupees(5500, 9000),
                "when": _dt(day(d), 8, RNG.randint(0, 59)), "category": "Fuel & Transport",
                "merchant": RNG.choice(fuel), "desc": "Fuel", "ref": f"FUEL{m:02d}{d}",
            })
        # Ride-hailing from the wallet.
        for _ in range(RNG.randint(3, 6)):
            d = RNG.randint(2, 27)
            events.append({
                "acc": "nayapay", "type": "debit", "amount": _rupees(300, 1500, 10),
                "when": _dt(day(d), RNG.randint(8, 23), RNG.randint(0, 59)),
                "category": "Fuel & Transport", "merchant": RNG.choice(rides),
                "desc": "Ride", "ref": f"RIDE{m:02d}{d}",
            })
        # ATM cash.
        for d in (12, 24):
            events.append({
                "acc": "hbl", "type": "debit", "amount": Decimal(RNG.choice([15000, 20000, 25000])),
                "when": _dt(day(d), 16, 0), "category": "Cash & ATM",
                "merchant": "HBL ATM", "desc": "Cash withdrawal", "ref": f"ATM{m:02d}{d}",
            })
        # Mobile top-up.
        events.append({
            "acc": "hbl", "type": "debit", "amount": Decimal("1000.00"),
            "when": _dt(day(9), 12, 0), "category": "Telecom & Mobile",
            "merchant": "Jazz", "desc": "Mobile load", "ref": f"LOAD{m:02d}",
        })
        # Occasional refund.
        if RNG.random() < 0.5:
            events.append({
                "acc": "hbl", "type": "credit", "amount": _rupees(1500, 4500),
                "when": _dt(day(21), 15, 0), "category": "Refunds",
                "merchant": "Daraz", "desc": "Order refund", "ref": f"RFD{m:02d}",
            })

        # Advance to the next month.
        month = (base.replace(day=28) + timedelta(days=7)).replace(day=1)

    # Keep events in time order so running balances make sense.
    events = [e for e in events if e["when"] <= now]
    events.sort(key=lambda e: e["when"])
    return events


def seed(engine, label: str) -> None:
    Factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    db: Session = Factory()
    try:
        # Remove any prior demo footprint (transactions first — FK is SET NULL,
        # so they would otherwise be orphaned when the user is deleted).
        existing = db.execute(select(User).where(User.email == DEMO_EMAIL)).scalar_one_or_none()
        if existing is not None:
            db.execute(delete(Transaction).where(Transaction.user_id == existing.id))
            db.execute(delete(Account).where(Account.user_id == existing.id))
            db.delete(existing)
            db.flush()

        user = User(
            email=DEMO_EMAIL,
            full_name=DEMO_NAME,
            hashed_password=hash_password(DEMO_PASSWORD),
            is_active=True,
            preferences={"is_demo": True},
        )
        db.add(user)
        db.flush()

        accounts: dict[str, Account] = {}
        meta: dict[str, dict] = {}
        for spec in ACCOUNTS:
            acc = Account(
                user_id=user.id,
                name=spec["name"],
                provider=spec["provider"],
                type=spec["type"],
                mask=spec["mask"],
                opening_balance=spec["opening_balance"],
                currency="PKR",
                color=spec["color"],
                is_active=True,
            )
            db.add(acc)
            accounts[spec["provider"]] = acc
            meta[spec["provider"]] = spec
        db.flush()

        # Running balance per account starts at its opening balance.
        balance = {p: Decimal(meta[p]["opening_balance"]) for p in accounts}

        events = build_events(months=6)
        for idx, ev in enumerate(events):
            prov = ev["acc"]
            acc = accounts[prov]
            spec = meta[prov]
            amt = Decimal(ev["amount"]).quantize(Decimal("0.01"))
            if ev["type"] == "credit":
                balance[prov] += amt
            else:
                balance[prov] -= amt

            fp = fingerprint_from_fields(
                provider=spec["provider"],
                transaction_type=ev["type"],
                amount=amt,
                currency="PKR",
                account_identifier=spec["ident"],
                reference=ev["ref"],
                transaction_datetime=ev["when"],
                user_id=user.id,
                extra=f"demo-{idx}",
            )
            db.add(Transaction(
                user_id=user.id,
                account_id=acc.id,
                provider=spec["provider"],
                account_identifier=spec["ident"],
                transaction_type=ev["type"],
                amount=amt,
                currency="PKR",
                transaction_datetime=ev["when"],
                merchant=ev["merchant"],
                description=ev["desc"],
                reference=ev["ref"],
                balance_after=balance[prov].quantize(Decimal("0.01")),
                category=ev["category"],
                source_type="sms",
                fingerprint=fp,
                confidence=1.0,
                verified=True,
            ))

        db.commit()
        print(f"[{label}] seeded demo account '{DEMO_EMAIL}' "
              f"({len(accounts)} accounts, {len(events)} transactions)")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def load_prod_url() -> str:
    url = os.environ.get("PROD_DATABASE_URL")
    if not url:
        envp = BACKEND / ".env.prod"
        if envp.exists():
            for line in envp.read_text().splitlines():
                s = line.strip()
                if s.startswith("PROD_DATABASE_URL="):
                    url = s.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not url:
        sys.exit("ERROR: set PROD_DATABASE_URL in env or backend/.env.prod")
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    return url


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed the FinSync public demo account.")
    ap.add_argument("--prod", action="store_true", help="seed the hosted (prod) database")
    args = ap.parse_args()

    if args.prod:
        engine = create_engine(load_prod_url(), pool_pre_ping=True, future=True)
        seed(engine, "prod")
    else:
        seed(local_engine, "local")


if __name__ == "__main__":
    main()
