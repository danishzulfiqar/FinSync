"""NayaPay email parser.

NayaPay emails ship their content as ``text/html`` (the ``text/plain`` part is a
1-byte placeholder), so the Gmail client flattens the HTML to text before this
parser runs. Three layouts are handled, all from ``service@nayapay.com``:

  - Money received — subject "You got Rs. 5,000 from <name> 🎉"; body has
    "Amount Received Rs. 5,000". -> credit
  - Money sent     — subject "You sent Rs. 1,300 to <name> 💸"; body has
    "Amount Sent Rs. 1,300". -> debit
  - Card           — subject "Transaction at <merchant> ... [reversed]"; body has
    "Total Amount Rs. X". -> debit (purchase) or credit (reversal/refund)

Returns ``None`` for OTPs, promos, and anything without a clear amount.
"""

from __future__ import annotations

import re

from app.models.enums import Provider, SourceType, TransactionType
from app.parsers.base import BaseParser, EmailMessage
from app.schemas.parsed import ParsedTransaction
from app.utils.amounts import parse_amount
from app.utils.dates import parse_local_datetime

_AMOUNT = r"Rs\.?\s*([\d,]+(?:\.\d+)?)"
_AMT_RECEIVED_RE = re.compile(r"(?i)Amount\s+Received\s*" + _AMOUNT)
_AMT_SENT_RE = re.compile(r"(?i)Amount\s+Sent\s*" + _AMOUNT)
_TOTAL_RE = re.compile(r"(?i)Total\s+Amount\s*" + _AMOUNT)
_SUBJ_AMT_RE = re.compile(r"(?i)" + _AMOUNT)

_WHEN_RE = re.compile(
    r"(?i)(?P<date>\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s*,?\s*(?P<time>\d{1,2}:\d{2}\s*[AP]M)"
)
_TXN_ID_RE = re.compile(r"(?i)(?:Reversal\s+|Reference\s+)?Transaction\s+ID\s*([A-Za-z0-9]+)")
_SRC_TITLE_RE = re.compile(r"(?i)Source\s+Acc\.?\s+Title\s*\n?\s*([^\n]+)")
_DST_TITLE_RE = re.compile(r"(?i)Destination\s+Acc\.?\s+Title\s*\n?\s*([^\n]+)")
_SUBJ_FROM_RE = re.compile(r"(?i)\bfrom\s+(.+)$")
_SUBJ_TO_RE = re.compile(r"(?i)\bto\s+(.+)$")
_MERCHANT_RE = re.compile(r"(?i)Transaction\s+at\s+(.+?)(?:\s+reversed)?\s*$")
# Card emails whose subject is generic ("Transaction failed, amount reversed!")
# still name the merchant in the body: "...transaction of Rs. 375.72 at RENDER.COM US was...".
_CARD_BODY_MERCHANT_RE = re.compile(
    r"(?i)transaction of\s+Rs\.?\s*[\d,.]+\s+at\s+(.+?)\s+(?:was|is|for|on)\b"
)
_CARD_LAST4_RE = re.compile(r"(?i)Visa[\s●•*xX]*?(\d{4})")

# Signals that a card event is a reversal/refund (money back) rather than a spend.
_REVERSAL_RE = re.compile(r"(?i)\b(revers|refund|declined|unsuccessful|failed)\b")
# Never treat sensitive messages as transactions.
_REJECT_RE = re.compile(r"(?i)\b(otp|one[- ]time|verification code|mpin|pin|password)\b")


def _strip_emoji(text: str) -> str:
    cleaned = re.sub(r"[\U0001F000-\U0001FFFF\u2190-\u2BFF\uFE0F]", "", text)
    return cleaned.strip(" -\t")


def _first_amount(*candidates: re.Match[str] | None):
    for m in candidates:
        if m:
            amount = parse_amount("Rs. " + m.group(1))
            if amount is not None:
                return amount
    return None


class NayapayEmailParser(BaseParser):
    name = "nayapay_email"

    def parse(self, message: object) -> ParsedTransaction | None:
        if not isinstance(message, EmailMessage):
            return None
        subject = message.subject or ""
        body = message.body or ""
        subj = subject.lower()

        if _REJECT_RE.search(subject):
            return None

        if subj.startswith("you got") or _AMT_RECEIVED_RE.search(body):
            return self._build(message, body, TransactionType.CREDIT, "nayapay_received")
        if subj.startswith("you sent") or _AMT_SENT_RE.search(body):
            return self._build(message, body, TransactionType.DEBIT, "nayapay_sent")
        if "transaction at" in subj or _TOTAL_RE.search(body):
            reversal = bool(_REVERSAL_RE.search(subject) or _REVERSAL_RE.search(body))
            tx_type = TransactionType.CREDIT if reversal else TransactionType.DEBIT
            return self._build(message, body, tx_type, "nayapay_card")
        return None

    def _build(
        self,
        message: EmailMessage,
        body: str,
        tx_type: TransactionType,
        layout: str,
    ) -> ParsedTransaction | None:
        subject = message.subject or ""
        amount = _first_amount(
            _AMT_RECEIVED_RE.search(body),
            _AMT_SENT_RE.search(body),
            _TOTAL_RE.search(body),
            _SUBJ_AMT_RE.search(subject),
        )
        if amount is None:
            return None

        when = _WHEN_RE.search(body)
        dt = (
            parse_local_datetime(when.group("date"), when.group("time"))
            if when
            else message.received_at
        )

        counterparty = self._counterparty(subject, body, layout)
        ref_m = _TXN_ID_RE.search(body)
        last4 = _CARD_LAST4_RE.search(body)
        account_identifier = f"****{last4.group(1)}" if last4 else None

        if layout == "nayapay_card":
            merchant_m = _MERCHANT_RE.search(subject) or _CARD_BODY_MERCHANT_RE.search(body)
            if merchant_m:
                counterparty = _strip_emoji(merchant_m.group(1))
            if tx_type == TransactionType.CREDIT:
                description = f"Refund from {counterparty}" if counterparty else "NayaPay card reversal"
            else:
                description = f"Paid to {counterparty}" if counterparty else "NayaPay card transaction"
        elif tx_type == TransactionType.CREDIT:
            description = f"Received from {counterparty}" if counterparty else "NayaPay money received"
        else:
            description = f"Sent to {counterparty}" if counterparty else "NayaPay money sent"

        return ParsedTransaction(
            provider=Provider.NAYAPAY,
            transaction_type=tx_type,
            amount=amount,
            currency="PKR",
            account_identifier=account_identifier,
            transaction_datetime=dt,
            merchant=counterparty,
            description=description,
            reference=ref_m.group(1) if ref_m else None,
            source_type=SourceType.EMAIL,
            source_message_id=message.message_id,
            source_thread_id=message.thread_id,
            raw_data={"layout": layout, "subject": subject, "counterparty": counterparty},
            confidence=0.95 if (when and ref_m) else 0.85,
        )

    def _counterparty(self, subject: str, body: str, layout: str) -> str | None:
        if layout == "nayapay_received":
            m = _SRC_TITLE_RE.search(body) or _SUBJ_FROM_RE.search(subject)
        else:
            m = _DST_TITLE_RE.search(body) or _SUBJ_TO_RE.search(subject)
        if not m:
            return None
        return _strip_emoji(m.group(1)) or None
