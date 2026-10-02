"""Statement import orchestration: parse -> normalize -> reconcile -> persist.

Turns a parsed :class:`Statement` into normalized
:class:`~app.schemas.parsed.ParsedTransaction` rows, reconciles the running
balance against the printed opening/closing figures, and feeds each row through
the shared ingestion pipeline (idempotent + deduplicated + user-scoped).
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import IO

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.enums import Provider, SourceType, TransactionType
from app.models.transaction import Transaction
from app.schemas.parsed import ParsedTransaction
from app.schemas.statement import (
    ReconciliationOut,
    StatementFileResult,
    StatementPreviewRow,
)
from app.services.categorization.keyword_rules import categorize_by_keywords
from app.services.ingestion.pipeline import ingest_parsed_transaction
from app.parsers.statement_pdf import Statement, StatementError, parse_statement
from app.utils.fingerprint import raw_message_hash

_LAYOUT_PROVIDER = {"myabl": Provider.ABL, "hbl": Provider.HBL}

# Mirrors the frontend PROVIDERS palette so auto-created accounts look native.
_PROVIDER_META = {
    Provider.ABL: ("Allied Bank", "#0ea5e9"),
    Provider.HBL: ("HBL", "#16a34a"),
    Provider.NAYAPAY: ("NayaPay", "#7c3aed"),
}
_PLACEHOLDER_MASK = "•••• 0000"

PREVIEW_LIMIT = 25


def _to_decimal(value: str | None) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value).replace(",", ""))
    except (InvalidOperation, ValueError):
        return None


def _parse_date(value: str | None, fmt: str | None) -> datetime | None:
    """Statement dates carry no time; pin them to UTC midnight so the
    calendar day survives the timestamptz round-trip in any server timezone."""
    if not value or not fmt:
        return None
    try:
        return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _chronological(stmt: Statement) -> list[dict]:
    rows = stmt.transactions
    if stmt.metadata.get("order") == "desc":
        rows = list(reversed(rows))
    return rows


def statement_to_parsed(stmt: Statement) -> list[tuple[ParsedTransaction, str]]:
    """Return (ParsedTransaction, per-row-key) pairs in chronological order."""
    provider = _LAYOUT_PROVIDER.get(stmt.metadata.get("layout", ""))
    if provider is None:
        return []

    account_number = stmt.metadata.get("account_number")
    currency = (stmt.metadata.get("currency") or "PKR").upper()
    source_file = stmt.metadata.get("source_file", "statement.pdf")
    date_fmt = stmt.metadata.get("date_fmt")

    out: list[tuple[ParsedTransaction, str]] = []
    for index, row in enumerate(_chronological(stmt)):
        debit = _to_decimal(row.get("debit")) or Decimal(0)
        credit = _to_decimal(row.get("credit")) or Decimal(0)
        # FinLens semantics: signed amount = credit - debit; sign decides the type.
        signed = credit - debit
        if signed == 0:
            continue
        tx_type = TransactionType.CREDIT if signed > 0 else TransactionType.DEBIT
        amount = abs(signed)

        description = (row.get("description") or "").strip() or None
        row_key = raw_message_hash(
            account_number,
            source_file,
            row.get("date"),
            description,
            row.get("debit"),
            row.get("credit"),
            row.get("balance"),
            str(index),
        )
        parsed = ParsedTransaction(
            provider=provider,
            transaction_type=tx_type,
            amount=amount,
            currency=currency,
            account_identifier=account_number,
            transaction_datetime=_parse_date(row.get("date"), date_fmt),
            description=description,
            balance_after=_to_decimal(row.get("balance")),
            source_type=SourceType.STATEMENT,
            source_message_id=row_key,
            raw_data={"statement": source_file, "row": index},
        )
        out.append((parsed, row_key))
    return out


def reconcile(
    stmt: Statement, parsed: list[tuple[ParsedTransaction, str]], tol: float = 0.01
) -> ReconciliationOut:
    opening = float(_to_decimal(stmt.metadata.get("opening_balance")) or 0)
    closing = float(_to_decimal(stmt.metadata.get("closing_balance")) or 0)

    running = opening
    net = 0.0
    mismatches = 0
    for tx, _ in parsed:
        signed = float(tx.amount) if tx.transaction_type == TransactionType.CREDIT else -float(tx.amount)
        running += signed
        net += signed
        if tx.balance_after is not None and abs(running - float(tx.balance_after)) > tol:
            mismatches += 1

    computed = opening + net
    return ReconciliationOut(
        opening_balance=round(opening, 2),
        closing_balance=round(closing, 2),
        computed_closing=round(computed, 2),
        net=round(net, 2),
        transactions=len(parsed),
        row_mismatches=mismatches,
        closing_ok=abs(computed - closing) <= tol,
    )


def _mask_for(account_number: str | None) -> str:
    digits = "".join(ch for ch in (account_number or "") if ch.isdigit())
    return f"•••• {digits[-4:]}" if len(digits) >= 4 else _PLACEHOLDER_MASK


def resolve_account(
    db: Session,
    *,
    user_id: int,
    provider: Provider,
    stmt: Statement,
    parsed: list[tuple[ParsedTransaction, str]],
) -> tuple[int, bool]:
    """Find or create the user's account for this statement; returns (id, created).

    Match order: same provider + masked number; else the user's only account for
    that provider when it still has the placeholder mask (claim it); else create.
    The statement's printed opening balance is authoritative whenever the
    statement starts before any transaction already linked to the account.
    """
    provider_key = provider.value.lower()
    mask = _mask_for(stmt.metadata.get("account_number"))
    opening = _to_decimal(stmt.metadata.get("opening_balance")) or Decimal(0)
    currency = (stmt.metadata.get("currency") or "PKR").upper()[:3]

    account = db.execute(
        select(Account).where(
            Account.user_id == user_id,
            Account.provider == provider_key,
            Account.mask == mask,
        )
    ).scalar_one_or_none()

    if account is None and mask != _PLACEHOLDER_MASK:
        candidates = db.execute(
            select(Account).where(
                Account.user_id == user_id,
                Account.provider == provider_key,
                Account.mask == _PLACEHOLDER_MASK,
            )
        ).scalars().all()
        if len(candidates) == 1:
            account = candidates[0]
            account.mask = mask

    created = False
    if account is None:
        label, color = _PROVIDER_META[provider]
        title = (stmt.metadata.get("account_title") or "").strip().title()
        account = Account(
            user_id=user_id,
            name=title or f"{label} {mask[-4:]}",
            provider=provider_key,
            type="current",
            mask=mask,
            opening_balance=opening,
            currency=currency,
            color=color,
        )
        db.add(account)
        db.flush()
        created = True
    else:
        earliest_existing = db.execute(
            select(func.min(Transaction.transaction_datetime)).where(
                Transaction.account_id == account.id
            )
        ).scalar_one()
        first_dt = next(
            (tx.transaction_datetime for tx, _ in parsed if tx.transaction_datetime),
            None,
        )
        if earliest_existing is None or (
            first_dt is not None and _as_utc(first_dt) < _as_utc(earliest_existing)
        ):
            account.opening_balance = opening

    db.commit()
    return account.id, created


def import_statement(
    db: Session,
    *,
    source: str | IO[bytes],
    source_name: str,
    password: str | None,
    user_id: int,
    dry_run: bool = False,
) -> StatementFileResult:
    """Parse one statement file and (optionally) persist its transactions."""
    try:
        stmt = parse_statement(source, password=password, source_name=source_name)
    except StatementError as exc:
        return StatementFileResult(source_file=source_name, status="error", error=str(exc))
    except Exception as exc:  # defensive: never leak a raw traceback to the client
        return StatementFileResult(
            source_file=source_name, status="error", error=f"Failed to parse: {exc}"
        )

    parsed = statement_to_parsed(stmt)
    provider = _LAYOUT_PROVIDER.get(stmt.metadata.get("layout", ""))
    recon = reconcile(stmt, parsed)

    preview = [
        StatementPreviewRow(
            transaction_datetime=tx.transaction_datetime,
            description=tx.description,
            transaction_type=tx.transaction_type.value,
            amount=tx.amount,
            balance_after=tx.balance_after,
            category=categorize_by_keywords(
                tx.description, is_credit=tx.transaction_type == TransactionType.CREDIT
            ),
        )
        for tx, _ in parsed[:PREVIEW_LIMIT]
    ]

    result = StatementFileResult(
        source_file=stmt.metadata.get("source_file", source_name),
        status="parsed",
        layout=stmt.metadata.get("layout"),
        provider=provider.value if provider else None,
        account_title=stmt.metadata.get("account_title"),
        account_number=stmt.metadata.get("account_number"),
        currency=stmt.metadata.get("currency"),
        parsed=len(parsed),
        reconciliation=recon,
        preview=preview,
    )

    if dry_run:
        return result

    account_id: int | None = None
    if provider is not None:
        account_id, result.account_created = resolve_account(
            db, user_id=user_id, provider=provider, stmt=stmt, parsed=parsed
        )
    result.account_id = account_id

    for tx, row_key in parsed:
        outcome = ingest_parsed_transaction(
            db,
            tx,
            source_type=SourceType.STATEMENT,
            source_id=row_key,
            raw_hash=row_key,
            user_id=user_id,
            account_id=account_id,
            probable_enabled=False,  # statement rows are authoritative; keep every row
            fingerprint_extra=row_key,
        )
        if outcome.status == "created":
            result.created += 1
        elif outcome.status == "duplicate":
            result.duplicates += 1
        elif outcome.status == "linked":
            result.linked += 1
        elif outcome.status == "needs_review":
            result.needs_review += 1

    return result
