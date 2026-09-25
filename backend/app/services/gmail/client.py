"""Gmail API client wrapper (read-only) — Phase 2 scaffolding.

Provides just enough to:
  - build an authenticated Gmail service from stored credentials,
  - list message ids matching a Gmail search query,
  - fetch and normalize a message into a parser-friendly EmailMessage.

Incremental sync via historyId is stubbed with a clear TODO; the GmailSyncState
model and checkpoints are already in place to support it. Parsing itself is
delegated to the provider email parsers (currently stubs) so this module never
needs to change when message layouts change.
"""

from __future__ import annotations

import base64
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from googleapiclient.discovery import build

from app.parsers.base import EmailMessage
from app.services.gmail.oauth import load_credentials


def build_service():
    """Return an authenticated Gmail API service, or None if not authorized."""
    creds = load_credentials()
    if creds is None:
        return None
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def build_query(senders: list[str], after: str | None = None, before: str | None = None) -> str:
    """Compose a Gmail search query from senders and an optional date range.

    Dates use Gmail's ``after:``/``before:`` with YYYY/MM/DD format.
    """
    parts: list[str] = []
    if senders:
        or_senders = " OR ".join(f"from:{s}" for s in senders)
        parts.append(f"({or_senders})")
    if after:
        parts.append(f"after:{after}")
    if before:
        parts.append(f"before:{before}")
    return " ".join(parts)


def list_message_ids(service, query: str, max_results: int = 100) -> list[str]:
    """List message ids matching a query, following pagination."""
    ids: list[str] = []
    page_token: str | None = None
    while True:
        resp = (
            service.users()
            .messages()
            .list(userId="me", q=query, maxResults=min(max_results, 500), pageToken=page_token)
            .execute()
        )
        ids.extend(m["id"] for m in resp.get("messages", []))
        page_token = resp.get("nextPageToken")
        if not page_token or len(ids) >= max_results:
            break
    return ids[:max_results]


def fetch_email(service, message_id: str) -> EmailMessage:
    """Fetch a single message and normalize it into an EmailMessage."""
    msg = (
        service.users()
        .messages()
        .get(userId="me", id=message_id, format="full")
        .execute()
    )
    headers = {
        h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])
    }
    body = _extract_body(msg.get("payload", {}))
    received = _parse_date(headers.get("date"))
    return EmailMessage(
        message_id=msg["id"],
        thread_id=msg.get("threadId"),
        sender=headers.get("from", ""),
        subject=headers.get("subject", ""),
        body=body,
        received_at=received,
        headers=headers,
    )


def _extract_body(payload: dict) -> str:
    """Recursively extract the text/plain (fallback text/html) body."""
    mime = payload.get("mimeType", "")
    data = payload.get("body", {}).get("data")
    if mime == "text/plain" and data:
        return _decode(data)

    html_fallback = ""
    for part in payload.get("parts", []) or []:
        text = _extract_body(part)
        if part.get("mimeType") == "text/plain" and text:
            return text
        if part.get("mimeType") == "text/html" and text:
            html_fallback = text
    if data and mime == "text/html":
        return _decode(data)
    return html_fallback


def _decode(data: str) -> str:
    return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="replace")


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        return None
