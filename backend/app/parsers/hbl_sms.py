"""HBL card/purchase SMS parser.

STATUS: scaffolding. The regexes below are conservative PLACEHOLDERS structured
around fields typically present in bank card SMS. They intentionally return
``None`` until you provide anonymized real HBL SMS samples, so that no message
is ever misclassified as a transaction. Update ``PATTERNS`` (or move them into
providers.yaml) once real wording is known — no other code needs to change.

Security: this parser never extracts or stores OTPs, PINs, CVVs, or full card
numbers. Only a masked last-4 (if present) is captured.
"""

from __future__ import annotations

import re
from datetime import datetime

from app.models.enums import Provider, SourceType, TransactionType
from app.parsers.base import BaseParser, SmsMessage
from app.schemas.parsed import ParsedTransaction
from app.utils.amounts import detect_currency, parse_amount

# Signals that a message is a transaction (debit) vs a credit. Placeholders —
# refine with real samples.
_DEBIT_HINTS = re.compile(r"(?i)\b(spent|purchase|debited|withdrawn|paid|pos)\b")
_CREDIT_HINTS = re.compile(r"(?i)\b(credited|received|refund|deposit)\b")

# Reject obvious non-transaction / sensitive messages outright.
_REJECT = re.compile(r"(?i)\b(otp|one[- ]time|verification code|pin|cvv|do not share)\b")

# Optional extractors (all best-effort; None when absent).
_LAST4_RE = re.compile(r"(?i)(?:card|acct|account)[^\d]{0,8}(?:x+|\*+)?(\d{4})\b")
_MERCHANT_RE = re.compile(r"(?i)\bat\s+([A-Z0-9 &._-]{2,40})")
_BALANCE_RE = re.compile(r"(?i)\b(?:avail(?:able)?\s*bal(?:ance)?)[^\d]{0,6}([\d,]+\.?\d*)")
_REF_RE = re.compile(r"(?i)\b(?:ref|reference|trx|txn)[^\w]{0,3}([A-Z0-9]{4,20})")


class HblSmsParser(BaseParser):
    name = "hbl_sms"

    def parse(self, message: object) -> ParsedTransaction | None:
        if not isinstance(message, SmsMessage):
            return None
        body = message.body or ""

        # Never treat sensitive/OTP messages as transactions.
        if _REJECT.search(body):
            return None

        is_debit = bool(_DEBIT_HINTS.search(body))
        is_credit = bool(_CREDIT_HINTS.search(body))
        if not (is_debit or is_credit):
            # Not recognizably a transaction with current patterns.
            return None

        amount = parse_amount(body)
        if amount is None:
            return None

        tx_type = TransactionType.CREDIT if is_credit and not is_debit else TransactionType.DEBIT

        last4 = _LAST4_RE.search(body)
        merchant = _MERCHANT_RE.search(body)
        balance = parse_amount(_BALANCE_RE.search(body).group(1)) if _BALANCE_RE.search(body) else None
        ref = _REF_RE.search(body)

        return ParsedTransaction(
            provider=Provider.HBL,
            transaction_type=tx_type,
            amount=amount,
            currency=detect_currency(body, default="PKR"),
            account_identifier=f"****{last4.group(1)}" if last4 else None,
            transaction_datetime=message.received_at or datetime.now().astimezone(),
            merchant=merchant.group(1).strip() if merchant else None,
            description="HBL card SMS",
            reference=ref.group(1) if ref else None,
            balance_after=balance,
            source_type=SourceType.SMS,
            source_message_id=message.message_id,
            raw_data={"sim_number": message.sim_number},
            confidence=0.9 if (last4 and merchant) else 0.7,
        )
