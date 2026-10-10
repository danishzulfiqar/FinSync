"""HBL bank-transfer / bill-payment email parser.

Handles the outgoing transaction alerts sent from ``digital.banking@hbl.com``.
Incoming funds and debit-card purchases arrive by SMS and are handled elsewhere.

Supported layouts (keyed off a line in the body, so subject wording can drift):

  - "HBL Mobile | Transfer to Other Bank"  — ``funds transfer was successful``
        Amount / Receiver Account Title / Receiver Bank Name / From Acc.No/IBAN /
        Date and Time / Channel / Transaction ID.
  - "HBL Mobile | Mobile Bundle" (and other ``Bill Payment``/top-up variants) —
        ``Bill Payment was successful``: Amount / Biller Company Name /
        From Account No. /IBAN / Date-Time / Transaction ID.
  - "HBL Digital | Send Money to Other Bank via Raast" — ``sent money to Other
        Bank``: Date-Time / Amount / Beneficiary Account Title / Transaction ID.

All three are money-out, so the transaction type is always DEBIT. Returns
``None`` for login/OTP/statement and anything that does not match a layout.
"""

from __future__ import annotations

import re

from app.models.enums import Provider, SourceType, TransactionType
from app.parsers.base import BaseParser, EmailMessage
from app.schemas.parsed import ParsedTransaction
from app.utils.amounts import parse_amount
from app.utils.dates import parse_local_datetime

# Value may sit on the same line as its label or on the next line, so every
# pattern bridges optional whitespace (including a newline) before the value.
_AMOUNT_RE = re.compile(r"(?i)\bAmount\b\s*[:.]?\s*(?:PKR\.?|Rs\.?)?\s*([\d,]+(?:\.\d+)?)")
_DATETIME_RE = re.compile(
    r"(?i)(?:Date\s+and\s+Time|Date-?Time)\s*[:.]?\s*"
    r"(\d{2}-(?:[A-Za-z]{3}|\d{2})-\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?)"
)
_FROM_ACCT_RE = re.compile(
    r"(?i)From\s+Acc(?:ount)?\.?\s*No\.?\s*/?\s*IBAN\s*[:.]?\s*\*?(\d{3,4})"
)
_RECEIVER_RE = re.compile(
    r"(?i)(?:Receiver|Beneficiary)\s+Account\s+Title\s*[:.]?\s*\n?\s*(.+)"
)
_BANK_RE = re.compile(r"(?i)Receiver\s+Bank\s+Name\s*[:.]?\s*\n?\s*(.+)")
_BILLER_RE = re.compile(r"(?i)Biller\s*/?\s*Company\s+Name\s*[:.]?\s*\n?\s*(.+)")
_REF_RE = re.compile(r"(?i)Trans(?:action|aciton)\s+ID\.?\s*[:.]?\s*\n?\s*(\w+)")


def _mask(last4: str | None) -> str | None:
    return f"****{last4}" if last4 and len(last4) >= 3 else None


def _line(value: str | None) -> str | None:
    if not value:
        return None
    first = value.splitlines()[0].strip(" .-")
    return first or None


class HblEmailParser(BaseParser):
    name = "hbl_email"

    def parse(self, message: object) -> ParsedTransaction | None:
        if not isinstance(message, EmailMessage):
            return None
        body = message.body or ""
        low = body.lower()

        if "funds transfer was successful" in low or "transfer to other bank" in low:
            return self._parse_transfer(message, body)
        if "bill payment was successful" in low:
            return self._parse_bill(message, body)
        if "sent money to other bank" in low:
            return self._parse_raast(message, body)
        # Login / OTP / statement / unknown — not a transaction.
        return None

    def _finish(
        self,
        message: EmailMessage,
        body: str,
        *,
        merchant: str | None,
        description: str,
        last4: str | None,
    ) -> ParsedTransaction | None:
        amt_m = _AMOUNT_RE.search(body)
        amount = parse_amount(f"PKR {amt_m.group(1)}") if amt_m else None
        if amount is None:
            return None

        when_m = _DATETIME_RE.search(body)
        dt = parse_local_datetime(when_m.group(1)) if when_m else message.received_at
        ref_m = _REF_RE.search(body)
        return ParsedTransaction(
            provider=Provider.HBL,
            transaction_type=TransactionType.DEBIT,
            amount=amount,
            currency="PKR",
            account_identifier=_mask(last4),
            transaction_datetime=dt,
            merchant=merchant,
            description=description,
            reference=ref_m.group(1) if ref_m else None,
            source_type=SourceType.EMAIL,
            source_message_id=message.message_id,
        )

    def _parse_transfer(self, message: EmailMessage, body: str) -> ParsedTransaction | None:
        recv_m = _RECEIVER_RE.search(body)
        receiver = _line(recv_m.group(1)) if recv_m else None
        bank_m = _BANK_RE.search(body)
        bank = _line(bank_m.group(1)) if bank_m else None
        from_m = _FROM_ACCT_RE.search(body)
        desc = f"Transfer to {receiver}" if receiver else "HBL funds transfer"
        if bank:
            desc += f" ({bank})"
        return self._finish(
            message,
            body,
            merchant=receiver,
            description=desc,
            last4=from_m.group(1) if from_m else None,
        )

    def _parse_bill(self, message: EmailMessage, body: str) -> ParsedTransaction | None:
        bill_m = _BILLER_RE.search(body)
        biller = _line(bill_m.group(1)) if bill_m else None
        from_m = _FROM_ACCT_RE.search(body)
        desc = f"Bill payment – {biller}" if biller else "HBL bill payment"
        return self._finish(
            message,
            body,
            merchant=biller,
            description=desc,
            last4=from_m.group(1) if from_m else None,
        )

    def _parse_raast(self, message: EmailMessage, body: str) -> ParsedTransaction | None:
        recv_m = _RECEIVER_RE.search(body)
        receiver = _line(recv_m.group(1)) if recv_m else None
        desc = f"Raast transfer to {receiver}" if receiver else "HBL Raast transfer"
        # The Raast email prints only the beneficiary's account, not the source.
        return self._finish(message, body, merchant=receiver, description=desc, last4=None)
