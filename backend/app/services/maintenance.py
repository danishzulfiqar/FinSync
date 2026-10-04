"""Maintenance operations that can run from a script or an API request.

Keeps duplicate-collapsing logic in one place so the one-off CLI
(``scripts/dedupe_transactions.py``) and the on-demand admin endpoint share the
exact same behaviour.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.transaction import Transaction
from app.utils.fingerprint import (
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


def dedupe_statement_transactions(
    db: Session,
    *,
    user_id: int | None = None,
    dry_run: bool = False,
) -> dict[str, int]:
    """Collapse duplicate statement rows, keeping the oldest of each group.

    Recomputes every statement row's fingerprint with the current balance-based
    rule, merges rows that now collide (repointing the losers' sources onto the
    keeper), and rewrites each survivor's stored fingerprint so future imports
    dedupe against it. Pass ``user_id`` to scope to a single user. Returns a
    summary with ``scanned``, ``groups``, ``duplicate_groups``, ``removed`` and
    ``rekeyed`` counts.
    """
    window = get_settings().dedup_time_window_seconds

    query = select(Transaction).where(Transaction.source_type == "statement")
    if user_id is not None:
        query = query.where(Transaction.user_id == user_id)
    rows = db.execute(query.order_by(Transaction.id)).scalars().all()

    groups: dict[str, list[Transaction]] = defaultdict(list)
    for tx in rows:
        groups[_new_fingerprint(tx, window)].append(tx)

    dup_groups = {fp: txs for fp, txs in groups.items() if len(txs) > 1}
    removed = 0
    rekeyed = 0

    if not dry_run:
        for txs in dup_groups.values():
            keeper = txs[0]  # oldest id wins
            kept_sources = {(s.source_type, s.source_id) for s in keeper.sources}
            for loser in txs[1:]:
                for src in list(loser.sources):
                    if (src.source_type, src.source_id) in kept_sources:
                        continue  # keeper already has this evidence
                    src.transaction_id = keeper.id
                    kept_sources.add((src.source_type, src.source_id))
                db.delete(loser)
                removed += 1
            db.flush()

        for fp, txs in groups.items():
            survivor = txs[0]
            if survivor.fingerprint != fp:
                survivor.fingerprint = fp
                rekeyed += 1
        db.flush()
        db.commit()
    else:
        removed = sum(len(txs) - 1 for txs in dup_groups.values())

    return {
        "scanned": len(rows),
        "groups": len(groups),
        "duplicate_groups": len(dup_groups),
        "removed": removed,
        "rekeyed": rekeyed,
    }
