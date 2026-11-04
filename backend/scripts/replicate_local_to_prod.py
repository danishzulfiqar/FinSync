"""Replicate local transaction/calculation data to the hosted (prod) DB.

Full-replace of the single user's accounts + transactions + transaction_sources
from the LOCAL database (backend/.env DATABASE_URL, i.e. localhost) into the
PROD database (PROD_DATABASE_URL from env or backend/.env.prod).

Safety:
  * Dry-run by default; pass --apply to write.
  * Always writes a JSON backup of the prod user's accounts/transactions/sources
    BEFORE deleting anything.
  * The whole write runs in ONE prod transaction (atomic; rolls back on error).
  * Accounts are matched local<->prod by (provider, mask); prod account IDs are
    preserved (only balances/flags/name/type/color are synced to local).
  * Transactions get NEW prod IDs; sources are re-linked via the unique
    `fingerprint` natural key, not by raw ID.

Usage:
  python scripts/replicate_local_to_prod.py            # dry-run (no writes)
  python scripts/replicate_local_to_prod.py --apply    # perform the replace
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import sys
from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine, delete, insert, select, text, update

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.database import engine as local_engine  # noqa: E402  (local = backend/.env)
from app.models.account import Account  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from app.models.transaction_source import TransactionSource  # noqa: E402

USER_EMAIL = "test.user@example.com"  # the single owner of the data
TX_T = Transaction.__table__
SRC_T = TransactionSource.__table__
ACC_T = Account.__table__


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
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://") :]
    return url


def resolve_user_id(conn, label: str) -> int:
    row = conn.execute(text("select id from users where email=:e"), {"e": USER_EMAIL}).first()
    if row:
        return row.id
    ids = conn.execute(text("select id from users order by id")).scalars().all()
    if len(ids) == 1:
        return ids[0]
    sys.exit(f"ERROR: cannot resolve a single user on {label} (users={ids})")


def account_map(local_conn, prod_conn, local_user: int, prod_user: int) -> dict[int, int]:
    """local account id -> prod account id, matched by (provider, mask)."""
    loc = local_conn.execute(
        select(ACC_T.c.id, ACC_T.c.provider, ACC_T.c.mask).where(ACC_T.c.user_id == local_user)
    ).all()
    prod = prod_conn.execute(
        select(ACC_T.c.id, ACC_T.c.provider, ACC_T.c.mask).where(ACC_T.c.user_id == prod_user)
    ).all()
    prod_by_key = {(r.provider, r.mask): r.id for r in prod}
    mapping: dict[int, int] = {}
    missing = []
    for r in loc:
        key = (r.provider, r.mask)
        if key in prod_by_key:
            mapping[r.id] = prod_by_key[key]
        else:
            missing.append(key)
    if missing:
        sys.exit(f"ERROR: prod is missing accounts for {missing}; create them first (provider+mask must match).")
    return mapping


def signed(t) -> float:
    return float(t["amount"]) if t["transaction_type"] == "credit" else -float(t["amount"])


def compute_balances(conn, user_id: int) -> list[tuple]:
    accts = conn.execute(
        select(ACC_T.c.id, ACC_T.c.provider, ACC_T.c.mask, ACC_T.c.opening_balance, ACC_T.c.is_active)
        .where(ACC_T.c.user_id == user_id).order_by(ACC_T.c.id)
    ).all()
    out = []
    for a in accts:
        rows = conn.execute(
            select(
                TX_T.c.transaction_type, TX_T.c.amount, TX_T.c.balance_after,
                TX_T.c.transaction_datetime, TX_T.c.source_type, TX_T.c.id,
            ).where(TX_T.c.account_id == a.id)
        ).mappings().all()
        mine = sorted(rows, key=lambda t: (t["transaction_datetime"] or _dt.datetime.min, t["id"]), reverse=True)
        anchor = next((t for t in mine if t["source_type"] == "statement" and t["balance_after"] is not None), None) \
            or next((t for t in mine if t["balance_after"] is not None), None)
        if anchor is None:
            bal = float(a.opening_balance) + sum(signed(t) for t in mine)
        else:
            ad = anchor["transaction_datetime"]
            bal = float(anchor["balance_after"]) + sum(
                signed(t) for t in mine if t["transaction_datetime"] and ad and t["transaction_datetime"] > ad
            )
        out.append((a.id, a.provider, a.mask, a.is_active, len(mine), bal))
    return out


def _jsonable(v):
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, (_dt.datetime, _dt.date)):
        return v.isoformat()
    return v


def backup_prod(prod_conn, prod_user: int) -> Path:
    data = {"accounts": [], "transactions": [], "transaction_sources": []}
    accs = prod_conn.execute(select(ACC_T).where(ACC_T.c.user_id == prod_user)).mappings().all()
    data["accounts"] = [{k: _jsonable(v) for k, v in r.items()} for r in accs]
    txs = prod_conn.execute(select(TX_T).where(TX_T.c.user_id == prod_user)).mappings().all()
    data["transactions"] = [{k: _jsonable(v) for k, v in r.items()} for r in txs]
    tx_ids = [r["id"] for r in txs]
    if tx_ids:
        srcs = prod_conn.execute(select(SRC_T).where(SRC_T.c.transaction_id.in_(tx_ids))).mappings().all()
        data["transaction_sources"] = [{k: _jsonable(v) for k, v in r.items()} for r in srcs]
    bdir = BACKEND / "scripts" / "backups"
    bdir.mkdir(parents=True, exist_ok=True)
    ts = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = bdir / f"prod_backup_user{prod_user}_{ts}.json"
    path.write_text(json.dumps(data, indent=2))
    return path


def main() -> None:
    apply = "--apply" in sys.argv
    prod_url = load_prod_url()
    prod_engine = create_engine(prod_url, future=True)

    with local_engine.connect() as lconn, prod_engine.connect() as pconn:
        local_user = resolve_user_id(lconn, "local")
        prod_user = resolve_user_id(pconn, "prod")
        acc_map = account_map(lconn, pconn, local_user, prod_user)

        print(f"local_user={local_user}  prod_user={prod_user}")
        print(f"account map (local->prod): {acc_map}")

        local_tx_count = lconn.execute(
            select(text("count(*)")).select_from(TX_T).where(TX_T.c.user_id == local_user)
        ).scalar()
        prod_tx_count = pconn.execute(
            select(text("count(*)")).select_from(TX_T).where(TX_T.c.user_id == prod_user)
        ).scalar()
        print(f"\nlocal transactions: {local_tx_count}   prod transactions (to be replaced): {prod_tx_count}")

        print("\n--- PROD balances BEFORE ---")
        for b in compute_balances(pconn, prod_user):
            print(f"  acct {b[0]} {b[1]} {b[2]} active={b[3]} n={b[4]} balance={b[5]:,.2f}")
        print("\n--- LOCAL balances (target) ---")
        for b in compute_balances(lconn, local_user):
            print(f"  acct {b[0]} {b[1]} {b[2]} active={b[3]} n={b[4]} balance={b[5]:,.2f}")

        if not apply:
            print("\nDRY-RUN: no changes written. Re-run with --apply to perform the replace.")
            return

        # ---- APPLY ----
        bpath = backup_prod(pconn, prod_user)
        print(f"\nBackup written: {bpath}")

        # Read all local rows to copy. Order by id so prod reassigns ids in the
        # same relative order (the balance anchor uses id-desc as a tiebreaker
        # among statement rows that share a timestamp).
        local_accts = lconn.execute(select(ACC_T).where(ACC_T.c.user_id == local_user)).mappings().all()
        local_txs = lconn.execute(
            select(TX_T).where(TX_T.c.user_id == local_user).order_by(TX_T.c.id)
        ).mappings().all()
        local_tx_ids = [t["id"] for t in local_txs]
        local_srcs = lconn.execute(
            select(SRC_T).where(SRC_T.c.transaction_id.in_(local_tx_ids)).order_by(SRC_T.c.id)
        ).mappings().all() if local_tx_ids else []

        tx_cols = [c.name for c in TX_T.columns if c.name != "id"]
        src_cols = [c.name for c in SRC_T.columns if c.name != "id"]
        local_txid_to_fp = {t["id"]: t["fingerprint"] for t in local_txs}

        pconn.rollback()  # end the read-only autobegun txn before the write txn
        with pconn.begin():
            # 1) sync account attributes (keep prod ids)
            for la in local_accts:
                pid = acc_map[la["id"]]
                pconn.execute(
                    update(ACC_T).where(ACC_T.c.id == pid).values(
                        name=la["name"], type=la["type"], opening_balance=la["opening_balance"],
                        currency=la["currency"], color=la["color"], is_active=la["is_active"],
                    )
                )
            # 2) delete prod user's transactions (sources cascade via FK)
            pconn.execute(delete(TX_T).where(TX_T.c.user_id == prod_user))

            # 3) insert local transactions remapped (new prod ids)
            tx_rows = []
            for t in local_txs:
                row = {c: t[c] for c in tx_cols}
                row["user_id"] = prod_user
                row["account_id"] = acc_map.get(t["account_id"]) if t["account_id"] is not None else None
                tx_rows.append(row)
            if tx_rows:
                pconn.execute(insert(TX_T), tx_rows)

            # 4) rebuild fingerprint -> prod id, then insert sources remapped
            fp_to_pid = dict(
                pconn.execute(
                    select(TX_T.c.fingerprint, TX_T.c.id).where(TX_T.c.user_id == prod_user)
                ).all()
            )
            src_rows = []
            for s in local_srcs:
                fp = local_txid_to_fp.get(s["transaction_id"])
                new_tid = fp_to_pid.get(fp)
                if new_tid is None:
                    raise RuntimeError(f"source {s['id']} could not be re-linked (fp={fp})")
                row = {c: s[c] for c in src_cols}
                row["transaction_id"] = new_tid
                src_rows.append(row)
            if src_rows:
                pconn.execute(insert(SRC_T), src_rows)

            # 5) verify counts within the same transaction before commit
            new_tx = pconn.execute(
                select(text("count(*)")).select_from(TX_T).where(TX_T.c.user_id == prod_user)
            ).scalar()
            new_src = pconn.execute(
                select(text("count(*)")).select_from(SRC_T)
                .where(SRC_T.c.transaction_id.in_(select(TX_T.c.id).where(TX_T.c.user_id == prod_user)))
            ).scalar()
            print(f"\ninserted: transactions={new_tx} (expected {len(tx_rows)}), sources={new_src} (expected {len(src_rows)})")
            if new_tx != len(tx_rows) or new_src != len(src_rows):
                raise RuntimeError("count mismatch after insert; rolling back")

        print("\nCOMMITTED. --- PROD balances AFTER ---")
        for b in compute_balances(pconn, prod_user):
            print(f"  acct {b[0]} {b[1]} {b[2]} active={b[3]} n={b[4]} balance={b[5]:,.2f}")


if __name__ == "__main__":
    main()
