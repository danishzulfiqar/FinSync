"""One-off maintenance: re-clean already-stored HBL statement descriptions.

``clean_hbl_description`` only runs when a statement is imported, so rows that
were ingested before a cleaner improvement keep their old packed text (e.g.
``LocalTransfer13580408476477HUAWEI TECH...``). This rewrites those rows in
place using the current cleaner. Only ``description``/``merchant`` change, so
fingerprints and source keys are untouched.

Run a preview first, then apply:
    ./.venv/bin/python scripts/reclean_hbl_descriptions.py --dry-run
    ./.venv/bin/python scripts/reclean_hbl_descriptions.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.enums import Provider  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from app.parsers.statement_pdf import (  # noqa: E402
    _hbl_tidy_merchant,
    clean_hbl_description,
)

# Card summaries whose merchant tail may still carry glued city/brand text from
# an older cleaner run (the raw packed text is gone, so re-tidy in place).
_CARD_PREFIXES = ("Card purchase – ", "Card refund – ")


def _reclean(description: str, merchant: str | None) -> tuple[str, str | None]:
    summary, counterparty = clean_hbl_description(description)
    for prefix in _CARD_PREFIXES:
        if summary.startswith(prefix):
            tail = _hbl_tidy_merchant(summary[len(prefix):])
            summary = prefix + tail
            counterparty = tail
            break
    return summary, (merchant or counterparty)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report changes without modifying the database.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    changed = 0
    scanned = 0
    try:
        rows = db.execute(
            select(Transaction).where(
                Transaction.provider == Provider.HBL.value,
                Transaction.source_type == "statement",
            )
        ).scalars().all()
        for row in rows:
            scanned += 1
            if not row.description:
                continue
            summary, new_merchant = _reclean(row.description, row.merchant)
            if summary == row.description and new_merchant == row.merchant:
                continue
            changed += 1
            if changed <= 30:
                print(f"- {row.description[:70]!r}\n    -> {summary!r}  [{new_merchant}]")
            if not args.dry_run:
                row.description = summary
                row.merchant = new_merchant
        if not args.dry_run:
            db.commit()
    finally:
        db.close()

    verb = "Would update" if args.dry_run else "Updated"
    print(f"\nScanned {scanned} HBL statement rows. {verb} {changed}.")


if __name__ == "__main__":
    main()
