"""Maintenance operations that can run from a script or an API request.

Keeps duplicate-collapsing logic in one place so the one-off CLI
(``scripts/dedupe_transactions.py``) and the on-demand admin endpoint share the
exact same behaviour.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import timedelta

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


def _has_source(tx: Transaction, source_type: str) -> bool:
    return any(s.source_type == source_type for s in tx.sources)


def _digits(text: str | None) -> set[str]:
    """Numeric tokens (length >= 4) found in a text, e.g. an embedded reference."""
    if not text:
        return set()
    return {m for m in re.findall(r"\d{4,}", text)}


def _classify_kind(*texts: str | None) -> str:
    """Coarse transaction kind so an ATM withdrawal never pairs with a transfer."""
    blob = " ".join(t for t in texts if t).lower()
    if "cash withdrawal" in blob or "atm" in blob:
        return "atm"
    if "salary" in blob:
        return "salary"
    # Bank-initiated deductions: statement says "With-HoldingTax…", the SMS just "Account debit".
    if "tax" in blob or "account debit" in blob:
        return "charge"
    if any(w in blob for w in ("top-up", "topup", "bill payment", "ufone", "jazz", "telenor", "zong")):
        return "bill"
    if any(w in blob for w in ("purchase", "visa", "pos", "card", "mastercard")):
        return "pos"
    if any(w in blob for w in ("raast", "funds transfer", "fund transfer", "ibft", "transfer")):
        return "transfer"
    return "other"


def _merge_email_into_statement(db: Session, stmt_tx: Transaction, email_tx: Transaction) -> bool:
    """Fold an email alert into its statement twin; return True if metadata changed."""
    changed = False
    if not stmt_tx.merchant and email_tx.merchant:
        stmt_tx.merchant = email_tx.merchant
        changed = True
    if not stmt_tx.reference and email_tx.reference:
        stmt_tx.reference = email_tx.reference
        changed = True
    if not stmt_tx.description and email_tx.description:
        stmt_tx.description = email_tx.description
        changed = True
    kept = {(s.source_type, s.source_id) for s in stmt_tx.sources}
    for src in list(email_tx.sources):
        if (src.source_type, src.source_id) in kept:
            continue
        # Reassign via the relationship (not the raw FK) so the row is moved to
        # the statement instead of being cascade-deleted with the email row.
        src.transaction = stmt_tx
        kept.add((src.source_type, src.source_id))
    db.delete(email_tx)
    return changed


def reconcile_email_statement_transactions(
    db: Session,
    *,
    user_id: int | None = None,
    dry_run: bool = False,
    max_day_gap: int = 3,
) -> dict[str, int]:
    """Merge an email alert and a statement line that are the same real event.

    One transfer is often captured twice: by the bank's real-time email alert
    (rich merchant/reference, no running balance) and by the monthly statement
    (authoritative running balance, no merchant). Their dates differ (alert time
    vs posting date) and references differ, so fingerprint dedup keeps both.

    Matching is deliberately conservative to avoid collapsing two genuinely
    distinct same-amount transactions:

      1. Reference match (definitive): the email's reference appears in the
         statement row's reference/description (e.g. ``ATM Cash Withdrawal
         458304``). Paired regardless of the small posting-date shift.
      2. Time match (fallback): only for leftovers of the *same kind* (ATM /
         POS / transfer) within ``max_day_gap`` days, nearest-in-time, 1:1.

    The statement row survives (it carries the running balance) enriched with
    the email's merchant/reference/description; the email's sources are
    repointed onto it and the duplicate email row is deleted.
    """
    query = select(Transaction).where(Transaction.account_id.is_not(None))
    if user_id is not None:
        query = query.where(Transaction.user_id == user_id)
    rows = db.execute(query.order_by(Transaction.id)).scalars().all()

    groups: dict[tuple, list[Transaction]] = defaultdict(list)
    for tx in rows:
        if tx.transaction_datetime is None:
            continue
        groups[(tx.account_id, tx.transaction_type, str(tx.amount), tx.currency)].append(tx)

    gap = timedelta(days=max_day_gap)
    ref_cap = timedelta(days=31)  # sanity bound for reference matches
    pairs = 0
    merged = 0
    enriched = 0

    for txs in groups.values():
        # Real-time alerts (email or SMS) fold into their statement twin.
        emails = [
            t for t in txs
            if (_has_source(t, "email") or _has_source(t, "sms")) and not _has_source(t, "statement")
        ]
        statements = [
            t for t in txs
            if _has_source(t, "statement") and not _has_source(t, "email") and not _has_source(t, "sms")
        ]
        if not emails or not statements:
            continue

        used_email: set[int] = set()
        used_stmt: set[int] = set()

        # Phase 1 — reference match (strongest signal).
        for em in emails:
            ref = (em.reference or "").strip()
            if not ref:
                continue
            for st in statements:
                if st.id in used_stmt:
                    continue
                st_refs = _digits(st.reference) | _digits(st.description)
                if ref in st_refs and abs(st.transaction_datetime - em.transaction_datetime) <= ref_cap:
                    pairs += 1
                    if not dry_run and _merge_email_into_statement(db, st, em):
                        enriched += 1
                    merged += 1
                    used_email.add(em.id)
                    used_stmt.add(st.id)
                    break

        # Phase 2 — time match for leftovers of the same kind.
        for st in statements:
            if st.id in used_stmt:
                continue
            st_kind = _classify_kind(st.description, st.merchant)
            best = None
            best_delta = None
            for em in emails:
                if em.id in used_email:
                    continue
                if _classify_kind(em.merchant, em.description) != st_kind or st_kind == "other":
                    continue
                delta = abs(st.transaction_datetime - em.transaction_datetime)
                if delta <= gap and (best_delta is None or delta < best_delta):
                    best, best_delta = em, delta
            if best is None:
                continue
            pairs += 1
            if not dry_run and _merge_email_into_statement(db, st, best):
                enriched += 1
            merged += 1
            used_email.add(best.id)
            used_stmt.add(st.id)
        db.flush()

    if not dry_run:
        db.commit()

    return {
        "scanned": len(rows),
        "pairs": pairs,
        "merged": merged,
        "enriched": enriched,
    }
