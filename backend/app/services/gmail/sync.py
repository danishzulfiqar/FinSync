"""Gmail -> parsed transaction sync for a signed-in user.

Fetches provider notification emails that arrived AFTER the latest transaction
already on record for that provider (typically a bank statement's closing date),
parses them with the provider email parser, and feeds each through the shared
ingestion pipeline. Because ingestion is idempotent and deduplicated, running a
sync repeatedly never double-counts — balances simply move forward as new
notification emails arrive.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import get_providers_config
from app.models.account import Account
from app.models.enums import Provider, SourceType
from app.models.gmail_sync_state import GmailSyncState
from app.models.transaction import Transaction
from app.parsers import get_email_parser
from app.services.gmail.client import build_query, fetch_email, list_message_ids
from app.services.ingestion.pipeline import ingest_parsed_transaction
from app.utils.fingerprint import raw_message_hash


@dataclass
class ProviderSyncResult:
    provider: str
    query: str
    after: str | None = None
    matched: int = 0
    parsed: int = 0
    created: int = 0
    duplicates: int = 0
    linked: int = 0
    needs_review: int = 0
    skipped: int = 0
    account_id: int | None = None
    # Previously unattached rows linked to an account this run.
    adopted: int = 0
    preview: list[dict] = field(default_factory=list)


def sync_user_gmail(
    db: Session,
    service,
    *,
    user_id: int,
    providers: list[str] | None = None,
    start_date: str | None = None,
    before: str | None = None,
    max_results: int = 100,
    dry_run: bool = False,
) -> list[ProviderSyncResult]:
    """Sync one user's Gmail notifications into normalized transactions."""
    config = get_providers_config()
    if providers:
        keys = [p.lower() for p in providers]
    else:
        keys = [
            key
            for key, cfg in config.providers.items()
            if cfg.email_senders and get_email_parser(key) is not None
        ]

    results: list[ProviderSyncResult] = []
    for key in keys:
        cfg = config.provider(key)
        parser = get_email_parser(key)
        if cfg is None or parser is None or not cfg.email_senders:
            continue

        provider_enum = Provider[key.upper()]
        after = start_date or _latest_date(db, user_id, provider_enum.value)
        query = build_query(cfg.email_senders, after=after, before=before)
        ids = list_message_ids(service, query, max_results=max_results)

        result = ProviderSyncResult(provider=key, query=query, after=after, matched=len(ids))
        for mid in ids:
            email = fetch_email(service, mid)
            parsed = parser.parse(email)
            if parsed is None:
                result.skipped += 1
                continue
            result.parsed += 1

            account_id = _resolve_account(
                db, user_id, key, parsed.account_identifier, create=not dry_run
            )
            if result.account_id is None:
                result.account_id = account_id

            if len(result.preview) < 10:
                result.preview.append(
                    {
                        "date": parsed.transaction_datetime.isoformat()
                        if parsed.transaction_datetime
                        else None,
                        "type": parsed.transaction_type.value,
                        "amount": float(parsed.amount),
                        "currency": parsed.currency,
                        "merchant": parsed.merchant,
                        "reference": parsed.reference,
                        "subject": email.subject,
                    }
                )

            if dry_run:
                continue

            raw_hash = raw_message_hash(
                key,
                email.message_id,
                parsed.transaction_type.value,
                f"{parsed.amount}",
                parsed.reference,
            )
            outcome = ingest_parsed_transaction(
                db,
                parsed,
                source_type=SourceType.EMAIL,
                source_id=email.message_id,
                raw_hash=raw_hash,
                source_thread_id=email.thread_id,
                user_id=user_id,
                account_id=account_id,
            )
            _tally(result, outcome.status)

        if not dry_run:
            result.adopted = _adopt_orphans(db, user_id, key, provider_enum.value)
            _touch_sync_state(db, key)
        results.append(result)

    return results


def _latest_date(db: Session, user_id: int, provider_value: str) -> str | None:
    """Latest transaction date (Gmail ``after:`` format) for user + provider.

    This is the statement's closing date on the first sync, then the newest
    synced email on subsequent runs — giving incremental, idempotent syncs.
    """
    latest = db.execute(
        select(func.max(Transaction.transaction_datetime)).where(
            Transaction.user_id == user_id,
            Transaction.provider == provider_value,
        )
    ).scalar_one()
    if latest is None:
        return None
    return latest.astimezone(timezone.utc).strftime("%Y/%m/%d")


_PROVIDER_META: dict[str, tuple[str, str, str]] = {
    # key -> (display label, accent colour, account type)
    "abl": ("Allied Bank", "#0ea5e9", "current"),
    "hbl": ("HBL", "#16a34a", "current"),
    "nayapay": ("NayaPay", "#7c3aed", "wallet"),
}
_PLACEHOLDER_MASK = "•••• 0000"


def _resolve_account(
    db: Session,
    user_id: int,
    provider_key: str,
    account_identifier: str | None,
    *,
    create: bool = True,
) -> int | None:
    """Attribute an email transaction to the user's account for that provider.

    Matches on the masked last-4 when the email exposes an account number
    (ABL), else attributes to the user's sole account for that provider
    (NayaPay emails don't print the user's own wallet number). When the user
    has no account for the provider yet, one is created — mirroring the
    statement importer — so the rows roll into a balance instead of floating
    unattached. Its opening balance starts at 0 and can be corrected later.
    """
    accounts = db.execute(
        select(Account).where(
            Account.user_id == user_id,
            Account.provider == provider_key,
        )
    ).scalars().all()

    last4 = re.sub(r"\D", "", account_identifier or "")[-4:]
    if accounts:
        if last4:
            for account in accounts:
                if last4 == re.sub(r"\D", "", account.mask)[-4:]:
                    return account.id
        return accounts[0].id if len(accounts) == 1 else None

    if not create:
        return None

    label, color, kind = _PROVIDER_META.get(provider_key, (provider_key.upper(), "#64748b", "current"))
    mask = f"•••• {last4}" if len(last4) == 4 else _PLACEHOLDER_MASK
    account = Account(
        user_id=user_id,
        name=f"{label} {last4}" if len(last4) == 4 else label,
        provider=provider_key,
        type=kind,
        mask=mask,
        opening_balance=0,
        currency="PKR",
        color=color,
    )
    db.add(account)
    db.flush()
    return account.id


def _adopt_orphans(db: Session, user_id: int, provider_key: str, provider_value: str) -> int:
    """Attach account-less rows to the user's sole account for the provider.

    Earlier syncs (or imports) may have stored rows before an account existed;
    those rows don't roll into any balance until linked. Only safe when the
    provider has exactly one account, otherwise leave them for manual review.
    """
    accounts = db.execute(
        select(Account.id).where(
            Account.user_id == user_id, Account.provider == provider_key
        )
    ).scalars().all()
    if len(accounts) != 1:
        return 0
    result = db.execute(
        update(Transaction)
        .where(
            Transaction.user_id == user_id,
            Transaction.provider == provider_value,
            Transaction.account_id.is_(None),
        )
        .values(account_id=accounts[0])
    )
    return result.rowcount or 0


def _tally(result: ProviderSyncResult, status: str) -> None:
    if status == "created":
        result.created += 1
    elif status == "duplicate":
        result.duplicates += 1
    elif status == "linked":
        result.linked += 1
    elif status == "needs_review":
        result.needs_review += 1


def _touch_sync_state(db: Session, provider_key: str) -> None:
    state = db.execute(
        select(GmailSyncState).where(GmailSyncState.provider == provider_key)
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if state is None:
        db.add(GmailSyncState(provider=provider_key, last_sync_at=now))
    else:
        state.last_sync_at = now
    db.commit()
