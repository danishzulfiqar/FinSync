"""HBL transaction SMS parser (sender 14250).

Templates verified against real HBL SMS (2025-11 .. 2026-11):

  Card purchase  "Your HBL Debit Card has been charged for a Transaction of PKR 1,151.00 on 16/12/2025 ."
  ATM            "Your HBL A/C 0874*****05003 has been debited with PKR 5,000.00 on 28/11/2025 for ATM Cash Withdrawal."
  Salary/refund  "Your HBL A/C 0874*****05003 has been credited with PKR 140,823.00 on 28/11/2025 via Salary Credit."
                 "... credited with PKR 1908.3 on 09/11/2025 via Debit Card Trans. Reversal."
  RTGS           "Your HBL account 0874*****05003 has been credited with Rs. 776522.36 via RTGS Transfer on 30/12/2025."
  Raast/IBFT in  "ACCOUNT HOLDER, PKR 28,000.00 received from ACCOUNT HOLDER A/C via Raast on 14/12/2025 14:15:22, TXN ID SM14...."
                 "PKR 1,500.00 received from ACCOUNT HOLDER IBAN in your HBL A/C via your Raast ID on 26/04/2026 15:04:22 TXN ID SM26..."
                 "PKR 177,823.00 received from HUAWEI TEC AKBL in your HBL A/C *4710 on 28/04/2026 09:14:41 via Raast TXN ID 3525..."
                 "PKR 48796.18 received from in your HBL A/C on 29/05/2026 09:52:23 via RTGS TXN ID 0769..."

Anything else (OTPs, promos, loan notices) returns None. Card SMS carry no
merchant; it is filled in when the statement row for the same purchase is
reconciled. Never extracts OTPs, PINs, CVVs or full card/account numbers.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from app.models.enums import Provider, SourceType, TransactionType
from app.parsers.base import BaseParser, SmsMessage
from app.schemas.parsed import ParsedTransaction
from app.utils.amounts import parse_amount

PKT = timezone(timedelta(hours=5))

_REJECT = re.compile(r"(?i)\b(otp|one time password|pin|cvv)\b")

_AMOUNT = r"(?:PKR|Rs\.?)\s*(?P<amount>\d[\d,]*(?:\.\d+)?)"
_WHEN = r"on\s+(?P<date>\d{2}/\d{2}/\d{4})(?:\s+(?P<time>\d{2}:\d{2}:\d{2}))?"

_CARD = re.compile(rf"(?i)HBL Debit Card has been charged for a Transaction of {_AMOUNT}\s+{_WHEN}")
_ACCOUNT_DEBIT = re.compile(
    rf"(?i)HBL A/C (?P<acct>[\d*]+) has been debited with {_AMOUNT}\s+{_WHEN}(?:\s+for (?P<what>[^.]+))?"
)
_ACCOUNT_CREDIT = re.compile(
    rf"(?i)HBL A/C (?P<acct>[\d*]+) has been credited with {_AMOUNT}\s+{_WHEN}\s+via (?P<what>[^.]+(?:\.\s*Reversal)?)"
)
_RTGS_CREDIT = re.compile(
    rf"(?i)HBL account (?P<acct>[\d*]+) has been credited with {_AMOUNT}\s+via (?P<what>.+?)\s+{_WHEN}"
)
_RECEIVED = re.compile(
    rf"(?i){_AMOUNT} received from (?P<party>.*?)\s*(?:\b(?:A/C|IBAN)\b.*?)?\s*"
    rf"(?:in your HBL A/C\b.*?)?\s*(?:via (?P<via1>[A-Za-z]+)\b.*?)?{_WHEN}"
    rf"(?:,?\s*via (?P<via2>[A-Za-z]+))?(?:.*?TXN ID\s*(?P<ref>[A-Za-z0-9]+))?"
)


def _when(date: str, time: str | None, received_at: datetime | None) -> datetime:
    day = datetime.strptime(date, "%d/%m/%Y").replace(tzinfo=PKT)
    if time:
        h, m, s = (int(x) for x in time.split(":"))
        return day.replace(hour=h, minute=m, second=s)
    # Date-only SMS: use the arrival time when it is the same day, else noon.
    if received_at is not None:
        local = received_at.astimezone(PKT)
        if local.date() == day.date():
            return local
    return day.replace(hour=12)


def _last4(acct: str | None) -> str | None:
    digits = re.sub(r"\D", "", acct or "")
    return f"****{digits[-4:]}" if len(digits) >= 4 else None


def _clean_party(raw: str | None) -> str | None:
    party = re.sub(r"\s+", " ", raw or "").strip(" ,")
    return party or None


class HblSmsParser(BaseParser):
    name = "hbl_sms"

    def parse(self, message: object) -> ParsedTransaction | None:
        if not isinstance(message, SmsMessage):
            return None
        body = re.sub(r"\s+", " ", message.body or "").strip()
        if not body or _REJECT.search(body):
            return None

        if m := _CARD.search(body):
            return self._build(
                message, TransactionType.DEBIT, m, description="Card purchase", confidence=0.85
            )

        if m := _ACCOUNT_DEBIT.search(body):
            what = (m["what"] or "").strip()
            desc = "ATM cash withdrawal" if "atm" in what.lower() else (what or "Account debit")
            return self._build(message, TransactionType.DEBIT, m, description=desc, acct=m["acct"])

        if m := _ACCOUNT_CREDIT.search(body):
            what = m["what"].strip()
            low = what.lower()
            if "salary" in low:
                desc = "Salary credit"
            elif "reversal" in low:
                desc = "Card refund"
            else:
                desc = what
            return self._build(message, TransactionType.CREDIT, m, description=desc, acct=m["acct"])

        if m := _RTGS_CREDIT.search(body):
            return self._build(
                message, TransactionType.CREDIT, m, description="RTGS transfer received", acct=m["acct"]
            )

        if m := _RECEIVED.search(body):
            party = _clean_party(m["party"])
            via = (m["via1"] or m["via2"] or "").upper()
            if via == "YOUR":
                via = "RAAST"
            desc = f"Transfer from {party}" if party else "Transfer received"
            if via in {"RAAST", "IBFT", "RTGS"}:
                desc += f" via {'Raast' if via == 'RAAST' else via}"
            return self._build(
                message,
                TransactionType.CREDIT,
                m,
                description=desc,
                merchant=party,
                reference=m["ref"],
            )

        return None

    def _build(
        self,
        message: SmsMessage,
        tx_type: TransactionType,
        m: re.Match[str],
        *,
        description: str,
        acct: str | None = None,
        merchant: str | None = None,
        reference: str | None = None,
        confidence: float = 0.9,
    ) -> ParsedTransaction | None:
        amount = parse_amount(f"PKR {m['amount']}")
        if amount is None:
            return None
        return ParsedTransaction(
            provider=Provider.HBL,
            transaction_type=tx_type,
            amount=amount,
            currency="PKR",
            account_identifier=_last4(acct),
            transaction_datetime=_when(m["date"], m["time"], message.received_at),
            merchant=merchant,
            description=description,
            reference=reference,
            source_type=SourceType.SMS,
            source_message_id=message.message_id,
            raw_data={"sim_number": message.sim_number},
            confidence=confidence,
        )
