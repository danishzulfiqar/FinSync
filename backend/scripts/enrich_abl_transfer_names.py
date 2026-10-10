"""Backfill ABL fund-transfer sender names onto existing transactions.

ABL statement imports land incoming transfers as generic rows such as
"1LINK Inter-Bank FT 512375" with no merchant, so on the dashboard you cannot
tell who sent the money (e.g. a monthly payment from "ACME CORP").
The matching "myABL Fund Transfer Alert" email *does* carry the sender name.

This script searches the connected ABL Gmail for fund-transfer alerts, parses
each, finds the already-imported transaction via the shared bank reference
(reference + provider + type + amount within a week), and fills in the sender
name + category on rows that are still blank. It never creates new rows and
never overwrites a value you already have, so it is safe to re-run.

Usage:
    python -m scripts.enrich_abl_transfer_names --user-id 1 [--dry-run]
"""

from __future__ import annotations

import argparse

from app.config import get_providers_config, get_settings
from app.database import SessionLocal
from app.models.enums import DedupStatus
from app.parsers.abl_email import AblEmailParser
from app.services.gmail.client import build_service, fetch_email, list_message_ids
from app.services.ingestion.pipeline import _enrich_existing
from app.services.reconciliation.dedup import find_duplicate
from app.utils.fingerprint import compute_fingerprint

_QUERY = 'from:myabl@abl.com "Fund Transfer"'


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--user-id", type=int, required=True)
    ap.add_argument("--max-results", type=int, default=200)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    service = build_service()
    if service is None:
        raise SystemExit("Gmail not authorized (no stored token).")

    settings = get_settings()
    providers = get_providers_config()
    parser = AblEmailParser()
    db = SessionLocal()
    scanned = updated = matched = 0
    try:
        ids = list_message_ids(service, _QUERY, max_results=args.max_results)
        for mid in ids:
            email = fetch_email(service, mid)
            parsed = parser.parse(email)
            if parsed is None or not (parsed.merchant or "").strip():
                continue
            scanned += 1

            fingerprint = compute_fingerprint(
                parsed, settings.dedup_time_window_seconds, user_id=args.user_id
            )
            dedup = find_duplicate(
                db,
                parsed,
                fingerprint,
                time_window_seconds=settings.dedup_time_window_seconds,
                probable_enabled=True,
                user_id=args.user_id,
            )
            existing = dedup.existing
            if existing is None or dedup.status not in (
                DedupStatus.EXACT_DUPLICATE,
                DedupStatus.PROBABLE_DUPLICATE,
            ):
                continue
            matched += 1

            before = (existing.merchant, existing.category)
            _enrich_existing(existing, parsed, providers)
            after = (existing.merchant, existing.category)
            if before != after:
                updated += 1
                print(
                    f"id={existing.id} ref={parsed.reference} "
                    f"amount={existing.amount} | merchant {before[0]!r} -> {after[0]!r} "
                    f"| category {before[1]!r} -> {after[1]!r}"
                )

        if args.dry_run:
            db.rollback()
            print(f"\n[dry-run] scanned={scanned} matched={matched} would_update={updated}")
        else:
            db.commit()
            print(f"\nscanned={scanned} matched={matched} updated={updated}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
