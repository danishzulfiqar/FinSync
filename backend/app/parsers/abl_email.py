"""Allied Bank (ABL) email parser.

Handles the two notification layouts sent from ``myabl@abl.com``:

  - "Allied Bank Transaction Alert" — card/account purchase & withdrawal alerts.
      e.g. "A Debit transaction of USD 58.43 was made in your Account No:
      0000****000017 ... on Tuesday, 29 Sep 2026 at 9:27PM.
      Transaction description : PURCHASE GITHUB, INC. ...
      Instrument / Cheque# : 638702"
  - "myABL Fund Transfer Alert"   — RAAST / funds received & sent.
      e.g. "PKR 17,000.00 has been received in your Account No: ***0017 on
      Tuesday , 29-Sep-2026 at 10:06 PM. ... Transaction Reference : 450776"

Returns ``None`` for anything that does not match a transaction layout.
"""

from __future__ import annotations

import re

from app.models.enums import Provider, SourceType, TransactionType
from app.parsers.base import BaseParser, EmailMessage
from app.schemas.parsed import ParsedTransaction
from app.utils.amounts import parse_amount
from app.utils.dates import parse_local_datetime

# --- Card alert ---------------------------------------------------------------
_CARD_RE = re.compile(
    r"(?i)\bA\s+(?P<dir>Debit|Credit)\s+transaction\s+of\s+"
    r"(?P<cur>[A-Z]{3})\s*(?P<amt>[\d,]+(?:\.\d+)?)\s+was\s+made\s+in\s+your\s+"
    r"Account\s+No:?\s*(?P<acct>[\w*]+)"
)
_CARD_WHEN_RE = re.compile(
    r"(?i)\bon\s+\w+,?\s*(?P<date>\d{1,2}\s+\w{3}\s+\d{4})\s+at\s+"
    r"(?P<time>\d{1,2}:\d{2}\s*[AP]M)"
)
_CARD_DESC_RE = re.compile(r"(?i)Transaction\s+description\s*:\s*(?P<desc>.+)")
_CARD_REF_RE = re.compile(r"(?i)Instrument\s*/\s*Cheque#?\s*:\s*(?P<ref>[\w-]+)")

# --- Fund transfer alert ------------------------------------------------------
# Currency may carry a trailing period ("PKR.") in some ABL layouts.
_XFER_RE = re.compile(
    r"(?i)(?P<cur>[A-Z]{3})\.?\s*(?P<amt>[\d,]+(?:\.\d+)?)\s+has\s+been\s+"
    r"(?P<dir>received|credited|sent|debited|transferred|paid)\s+"
    r"(?:in|from|to)\s+your\s+Account\s+No:?\s*(?P<acct>[\w*]+)"
)
_XFER_WHEN_RE = re.compile(
    r"(?i)\bon\s+\w+\s*,?\s*(?P<date>\d{1,2}-\w{3}-\d{4})\s+at\s+"
    r"(?P<time>\d{1,2}:\d{2}\s*[AP]M)"
)
# Alternate layout: "on 01/09/2026 at 01:28:49" (DD/MM/YYYY, 24-hour clock).
_XFER_WHEN_SLASH_RE = re.compile(
    r"(?i)\bon\s+(?P<date>\d{1,2}/\d{1,2}/\d{4})\s+at\s+"
    r"(?P<time>\d{1,2}:\d{2}(?::\d{2})?)"
)
_XFER_DESC_RE = re.compile(r"(?i)Transaction\s+Description\s*:\s*(?P<desc>.+)")
# The counterparty name may sit on the same line as its label ("Sender Name:
# ACME CORP") or on the next line ("Sender Name :\nSome Sender").
# Allow a single optional newline, then reject captures that are actually the
# next labelled field (e.g. an empty name followed by "Sender Account: ***0600").
_XFER_PARTY_RE = re.compile(
    r"(?i)(?:Sender|Beneficiary|Receiver)\s+Name\s*:[ \t]*\n?[ \t]*(?P<name>[^\n]+)"
)
_PARTY_REJECT_RE = re.compile(
    r"(?i)^(?:sender|beneficiary|receiver|transaction)\b|\baccount\s*:|\breference\s*:"
)
_XFER_REF_RE = re.compile(r"(?i)Transaction\s+Reference\s*:\s*(?P<ref>[\w-]+)")

_CREDIT_WORDS = {"received", "credited"}


def _party_name(body: str) -> str | None:
    """Extract the transfer counterparty name, tolerating label-on-next-line
    layouts without mistaking a trailing "Sender Account:" line for a name."""
    m = _XFER_PARTY_RE.search(body)
    if not m:
        return None
    name = _first_line(m.group("name"))
    if not name or _PARTY_REJECT_RE.search(name):
        return None
    return name


def _mask(acct: str | None) -> str | None:
    if not acct:
        return None
    digits = re.sub(r"\D", "", acct)
    return f"****{digits[-4:]}" if len(digits) >= 4 else acct


def _first_line(value: str | None) -> str | None:
    if not value:
        return None
    line = value.splitlines()[0].strip()
    return line or None


class AblEmailParser(BaseParser):
    name = "abl_email"

    def parse(self, message: object) -> ParsedTransaction | None:
        if not isinstance(message, EmailMessage):
            return None
        body = message.body or ""
        subject = (message.subject or "").lower()

        if "fund transfer" in subject:
            return self._parse_transfer(message, body)
        if "transaction alert" in subject:
            return self._parse_card(message, body)
        # Unexpected subject: fall back to whichever body shape matches.
        return self._parse_card(message, body) or self._parse_transfer(message, body)

    def _parse_card(self, message: EmailMessage, body: str) -> ParsedTransaction | None:
        m = _CARD_RE.search(body)
        if not m:
            return None
        amount = parse_amount(f"{m.group('cur')} {m.group('amt')}")
        if amount is None:
            return None

        when = _CARD_WHEN_RE.search(body)
        dt = (
            parse_local_datetime(when.group("date"), when.group("time"))
            if when
            else message.received_at
        )
        desc_m = _CARD_DESC_RE.search(body)
        desc = _first_line(desc_m.group("desc")) if desc_m else None
        ref_m = _CARD_REF_RE.search(body)
        tx_type = (
            TransactionType.CREDIT
            if m.group("dir").lower() == "credit"
            else TransactionType.DEBIT
        )
        return ParsedTransaction(
            provider=Provider.ABL,
            transaction_type=tx_type,
            amount=amount,
            currency=m.group("cur").upper(),
            account_identifier=_mask(m.group("acct")),
            transaction_datetime=dt,
            merchant=desc,
            description=desc or "ABL card transaction",
            reference=ref_m.group("ref") if ref_m else None,
            source_type=SourceType.EMAIL,
            source_message_id=message.message_id,
            source_thread_id=message.thread_id,
            raw_data={"layout": "abl_card_alert", "subject": message.subject},
            confidence=0.95 if (when and ref_m) else 0.85,
        )

    def _parse_transfer(self, message: EmailMessage, body: str) -> ParsedTransaction | None:
        m = _XFER_RE.search(body)
        if not m:
            return None
        amount = parse_amount(f"{m.group('cur')} {m.group('amt')}")
        if amount is None:
            return None

        when = _XFER_WHEN_RE.search(body) or _XFER_WHEN_SLASH_RE.search(body)
        dt = (
            parse_local_datetime(when.group("date"), when.group("time"))
            if when
            else message.received_at
        ) or message.received_at
        desc_m = _XFER_DESC_RE.search(body)
        desc = _first_line(desc_m.group("desc")) if desc_m else None
        counterparty = _party_name(body)
        ref_m = _XFER_REF_RE.search(body)
        tx_type = (
            TransactionType.CREDIT
            if m.group("dir").lower() in _CREDIT_WORDS
            else TransactionType.DEBIT
        )
        return ParsedTransaction(
            provider=Provider.ABL,
            transaction_type=tx_type,
            amount=amount,
            currency=m.group("cur").upper(),
            account_identifier=_mask(m.group("acct")),
            transaction_datetime=dt,
            merchant=counterparty,
            description=desc or "ABL fund transfer",
            reference=ref_m.group("ref") if ref_m else None,
            source_type=SourceType.EMAIL,
            source_message_id=message.message_id,
            source_thread_id=message.thread_id,
            raw_data={
                "layout": "abl_fund_transfer",
                "subject": message.subject,
                "counterparty": counterparty,
            },
            confidence=0.95 if ref_m else 0.85,
        )
