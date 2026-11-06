"""One-off maintenance: collapse duplicate statement transactions.

Older imports fingerprinted statement rows by file name + row index, so the
same transaction appearing in two overlapping PDFs was stored twice. This
script recomputes every statement row's fingerprint with the current
balance-based rule and merges rows that now collide — see
``app.services.maintenance.dedupe_statement_transactions`` for the logic.

Run a preview first, then apply:
    ./.venv/bin/python scripts/dedupe_transactions.py --dry-run
    ./.venv/bin/python scripts/dedupe_transactions.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal  # noqa: E402
from app.services.maintenance import (  # noqa: E402
    dedupe_statement_balance_duplicates,
    dedupe_statement_transactions,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report duplicates without modifying the database.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = dedupe_statement_transactions(db, dry_run=args.dry_run)
        balance = dedupe_statement_balance_duplicates(db, dry_run=args.dry_run)
    finally:
        db.close()

    print(
        f"Scanned {result['scanned']} statement transactions in "
        f"{result['groups']} unique groups."
    )
    print(f"Found {result['duplicate_groups']} duplicated groups.\n")
    if args.dry_run:
        print(
            f"[dry-run] Would remove {result['removed']} fingerprint duplicates "
            f"and {balance['removed']} balance duplicates. No changes made."
        )
    else:
        print(
            f"Removed {result['removed']} fingerprint duplicates "
            f"(re-keyed {result['rekeyed']} survivors) and "
            f"{balance['removed']} balance duplicates."
        )


if __name__ == "__main__":
    main()
