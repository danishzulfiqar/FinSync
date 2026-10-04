"""One-off maintenance: collapse duplicate statement transactions.

Older imports fingerprinted statement rows by file name + row index, so the
same transaction appearing in two overlapping PDFs was stored twice. This
script recomputes every statement row's fingerprint with the current
balance-based rule (see ``statement_fingerprint_extra``), merges rows that now
collide — keeping the oldest, repointing the others' sources — and rewrites the
survivor's stored fingerprint so future re-imports dedupe against it.

Run a preview first, then apply:
    ./.venv/bin/python scripts/dedupe_transactions.py --dry-run
    ./.venv/bin/python scripts/dedupe_transactions.py
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from app.models.transaction_source import TransactionSource  # noqa: E402
from app.utils.fingerprint import (  # noqa: E402
    fingerprint_from_fields,
    statement_fingerprint_extra,
)


def _new_fingerprint(tx: Transaction, window: int) -> str:
    return fingerprint_from_fields(
        provider=tx.provider,
        transaction_type=tx.transaction_type,
        amount=tx.amount,
        currency=tx.currency,
        account_identifier=tx.account_identifier,
        reference=tx.reference,
        transaction_datetime=tx.transaction_datetime,
        time_window_seconds=window,
        user_id=tx.user_id,
        extra=statement_fingerprint_extra(tx.balance_after, tx.description),
    )


def dedupe(dry_run: bool) -> None:
    settings = get_settings()
    window = settings.dedup_time_window_seconds
    db = SessionLocal()
    try:
        rows = db.execute(
            select(Transaction)
            .where(Transaction.source_type == "statement")
            .order_by(Transaction.id)
        ).scalars().all()

        groups: dict[str, list[Transaction]] = defaultdict(list)
        for tx in rows:
            groups[_new_fingerprint(tx, window)].append(tx)

        dup_groups = {fp: txs for fp, txs in groups.items() if len(txs) > 1}
        removed = 0
        print(f"Scanned {len(rows)} statement transactions in {len(groups)} unique groups.")
        print(f"Found {len(dup_groups)} duplicated groups.\n")

        for fp, txs in dup_groups.items():
            keeper = txs[0]  # oldest id wins
            losers = txs[1:]
            label = keeper.description or keeper.merchant or "(no description)"
            print(
                f"  keep #{keeper.id} · {label[:48]!r} · {keeper.amount} "
                f"{keeper.transaction_type} · bal {keeper.balance_after} "
                f"→ drop {[t.id for t in losers]}"
            )
            if dry_run:
                removed += len(losers)
                continue

            kept_sources = {
                (s.source_type, s.source_id) for s in keeper.sources
            }
            for loser in losers:
                for src in list(loser.sources):
                    if (src.source_type, src.source_id) in kept_sources:
                        continue  # keeper already has this evidence
                    src.transaction_id = keeper.id
                    kept_sources.add((src.source_type, src.source_id))
                db.delete(loser)
                removed += 1
            db.flush()

        # Rewrite survivors to the new fingerprint so future imports collide.
        if not dry_run:
            updated = 0
            for fp, txs in groups.items():
                survivor = txs[0]
                if survivor.fingerprint != fp:
                    survivor.fingerprint = fp
                    updated += 1
            db.flush()
            db.commit()
            print(f"\nRemoved {removed} duplicate rows; re-keyed {updated} survivors.")
        else:
            print(f"\n[dry-run] Would remove {removed} duplicate rows. No changes made.")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report duplicates without modifying the database.",
    )
    args = parser.parse_args()
    dedupe(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
