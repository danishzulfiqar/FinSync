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
import logging
import random
import re
import time
from collections import deque
from collections.abc import Callable, Iterable, Iterator
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import get_settings
from app.parsers.base import EmailMessage
from app.services.gmail.oauth import load_credentials, load_user_credentials

logger = logging.getLogger(__name__)

# Statuses worth retrying: Gmail rate limiting (403 rateLimitExceeded / 429)
# and transient server errors.
_TRANSIENT_STATUSES = {429, 500, 502, 503}
_MAX_BACKOFF_SECONDS = 32.0
_MAX_BATCH_SIZE = 100  # hard API limit per batch request

# Per-method quota costs: https://developers.google.com/workspace/gmail/api/reference/quota
UNITS_MESSAGES_LIST = 5
UNITS_MESSAGES_GET_FULL = 60


class QuotaLimiter:
    """Sliding-window limiter for Gmail's per-user, per-minute quota units.

    Share one instance across a whole sync so every call (list + get, all
    providers) draws from the same budget.
    """

    def __init__(
        self,
        units_per_minute: int,
        *,
        window_seconds: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if units_per_minute <= 0:
            raise ValueError("units_per_minute must be positive")
        self.capacity = units_per_minute
        self._window = window_seconds
        self._clock = clock
        self._sleep = sleep
        self._spent: deque[tuple[float, int]] = deque()
        self._used = 0

    def acquire(self, units: int) -> None:
        """Block until ``units`` fit in the rolling window, then reserve them."""
        if units > self.capacity:
            raise ValueError(
                f"request needs {units} quota units but the budget is "
                f"{self.capacity}/min; raise GMAIL_QUOTA_UNITS_PER_MINUTE"
            )
        while True:
            now = self._clock()
            while self._spent and now - self._spent[0][0] >= self._window:
                self._used -= self._spent.popleft()[1]
            if self._used + units <= self.capacity:
                self._spent.append((now, units))
                self._used += units
                return
            wait = self._spent[0][0] + self._window - now
            logger.info("Gmail quota budget reached, pausing %.1fs", wait)
            self._sleep(wait)


def new_quota_limiter() -> QuotaLimiter:
    return QuotaLimiter(get_settings().gmail_quota_units_per_minute)


def _status(exc: HttpError) -> int:
    return int(getattr(exc.resp, "status", 0) or 0)


def _is_retryable(exc: HttpError) -> bool:
    status = _status(exc)
    content = exc.content or b""
    is_rate_limited = status == 403 and (
        b"rateLimitExceeded" in content or b"userRateLimitExceeded" in content
    )
    return is_rate_limited or status in _TRANSIENT_STATUSES


def _backoff_seconds(attempt: int) -> float:
    """Truncated exponential backoff with jitter, as Google recommends."""
    return min(2.0**attempt + random.random(), _MAX_BACKOFF_SECONDS)


def _execute(request, *, max_retries: int = 6):
    """Execute a Gmail API request, retrying on rate-limit/transient errors."""
    for attempt in range(max_retries + 1):
        try:
            return request.execute()
        except HttpError as exc:
            if attempt >= max_retries or not _is_retryable(exc):
                raise
            delay = _backoff_seconds(attempt)
            logger.warning(
                "Gmail API %s, backing off %.1fs (attempt %d/%d)",
                _status(exc), delay, attempt + 1, max_retries,
            )
            time.sleep(delay)


def build_service(db=None, user_id=None):
    """Return an authenticated Gmail API service, or None if not authorized.

    Prefers DB-stored credentials when a session + user id are given (web app);
    otherwise falls back to the file-based credentials (local dev script/notebook).
    """
    if db is not None and user_id is not None:
        creds = load_user_credentials(db, user_id)
    else:
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


def list_message_ids(
    service,
    query: str,
    max_results: int | None = None,
    *,
    limiter: QuotaLimiter | None = None,
) -> list[str]:
    """List message ids matching a query, following pagination.

    ``max_results=None`` walks every page so no matching message is dropped
    (Gmail returns newest-first, so a hard cap would silently lose the oldest
    transactions). A positive cap stops once that many ids are collected.
    """
    ids: list[str] = []
    page_token: str | None = None
    while True:
        page_size = 500 if max_results is None else min(max_results, 500)
        if limiter is not None:
            limiter.acquire(UNITS_MESSAGES_LIST)
        resp = _execute(
            service.users()
            .messages()
            .list(userId="me", q=query, maxResults=page_size, pageToken=page_token)
        )
        ids.extend(m["id"] for m in resp.get("messages", []))
        page_token = resp.get("nextPageToken")
        if not page_token or (max_results is not None and len(ids) >= max_results):
            break
    return ids if max_results is None else ids[:max_results]


def fetch_email(service, message_id: str) -> EmailMessage:
    """Fetch a single message and normalize it into an EmailMessage."""
    msg = _execute(
        service.users()
        .messages()
        .get(userId="me", id=message_id, format="full")
    )
    return _to_email(msg)


def fetch_emails(
    service,
    message_ids: Iterable[str],
    *,
    limiter: QuotaLimiter | None = None,
    batch_size: int | None = None,
    max_retries: int = 6,
) -> Iterator[EmailMessage]:
    """Fetch many messages via batch requests, yielding them in input order.

    Each batch is one HTTP round trip for up to ``batch_size`` messages, paced
    by ``limiter`` so the per-user quota is never exceeded. Inside a batch every
    message succeeds or fails independently: rate-limited/transient ones are
    retried with backoff, messages deleted since listing (404) are skipped, and
    any other error is raised.
    """
    limiter = limiter or new_quota_limiter()
    size = batch_size or get_settings().gmail_batch_size
    size = max(1, min(size, _MAX_BATCH_SIZE, limiter.capacity // UNITS_MESSAGES_GET_FULL))
    ids = list(dict.fromkeys(message_ids))  # batch request ids must be unique
    for start in range(0, len(ids), size):
        chunk = ids[start:start + size]
        fetched = _fetch_batch(service, chunk, limiter, max_retries)
        for mid in chunk:
            if mid in fetched:
                yield _to_email(fetched[mid])


def _fetch_batch(
    service, ids: list[str], limiter: QuotaLimiter, max_retries: int
) -> dict[str, dict]:
    fetched: dict[str, dict] = {}
    pending = ids
    for attempt in range(max_retries + 1):
        retry: list[str] = []
        failures: list[HttpError] = []
        last_error: HttpError | None = None

        def on_response(request_id: str, response: dict, exception: HttpError | None) -> None:
            nonlocal last_error
            if exception is None:
                fetched[request_id] = response
            elif _status(exception) == 404:
                logger.info("Gmail message %s no longer exists, skipping", request_id)
            elif _is_retryable(exception):
                retry.append(request_id)
                last_error = exception
            else:
                failures.append(exception)

        batch = service.new_batch_http_request(callback=on_response)
        for mid in pending:
            batch.add(
                service.users().messages().get(userId="me", id=mid, format="full"),
                request_id=mid,
            )
        limiter.acquire(UNITS_MESSAGES_GET_FULL * len(pending))
        try:
            batch.execute()
        except HttpError as exc:  # the outer batch request itself failed
            if not _is_retryable(exc):
                raise
            retry = [mid for mid in pending if mid not in fetched]
            last_error = exc

        if failures:
            raise failures[0]
        if not retry:
            return fetched
        if attempt >= max_retries:
            assert last_error is not None
            raise last_error
        delay = _backoff_seconds(attempt)
        logger.warning(
            "Gmail batch: %d/%d messages throttled, retrying in %.1fs (attempt %d/%d)",
            len(retry), len(pending), delay, attempt + 1, max_retries,
        )
        time.sleep(delay)
        pending = retry
    return fetched


def _to_email(msg: dict) -> EmailMessage:
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
    """Return the most useful readable body text.

    Prefers a substantive ``text/plain`` part, but some providers (e.g. NayaPay)
    ship a 1-byte placeholder ``text/plain`` and put the real content in
    ``text/html`` — so we fall back to HTML converted to text whenever the plain
    part is empty.
    """
    plain, html = _collect_bodies(payload)
    if plain and len(plain.strip()) > 1:
        return plain
    if html:
        return html_to_text(html)
    return plain or ""


def _collect_bodies(payload: dict) -> tuple[str, str]:
    """Walk the MIME tree, returning the first (text/plain, text/html) decoded."""
    plain = ""
    html = ""
    mime = payload.get("mimeType", "")
    data = payload.get("body", {}).get("data")
    if data:
        if mime == "text/plain":
            plain = _decode(data)
        elif mime == "text/html":
            html = _decode(data)
    for part in payload.get("parts", []) or []:
        p, h = _collect_bodies(part)
        plain = plain or p
        html = html or h
    return plain, html


def html_to_text(html: str) -> str:
    """Flatten an HTML email body into readable, line-preserving plain text."""
    if not html:
        return ""
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</(p|div|tr|table|h[1-6]|li)>", "\n", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = unescape(text).replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


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
