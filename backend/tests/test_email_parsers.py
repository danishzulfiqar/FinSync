"""Email parser tests driven by redacted real-email layouts.

HBL email remains a stub (no samples yet) and must return None. ABL and NayaPay
parse the live layouts verified from the mailbox.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from app.models.enums import Provider, TransactionType
from app.parsers.abl_email import AblEmailParser
from app.parsers.base import EmailMessage
from app.parsers.hbl_email import HblEmailParser
from app.parsers.nayapay_email import NayapayEmailParser


def _email(subject: str, body: str) -> EmailMessage:
    return EmailMessage(
        message_id="e1",
        thread_id="t1",
        sender="alerts@example.com",
        subject=subject,
        body=body,
        received_at=datetime(2026, 9, 29, tzinfo=timezone.utc),
    )


# --------------------------------------------------------------------------- HBL
def test_hbl_email_stub_returns_none() -> None:
    assert HblEmailParser().parse(_email("Notification", "Some content")) is None


# --------------------------------------------------------------------------- ABL
ABL_CARD_BODY = """Allied Bank Limited
Transaction Alert
Dear ACCOUNT HOLDER
A Debit transaction of USD 58.43 was made in your Account No: 0000****000017 (ACCOUNT HOLDER) in SOME, CITY branch on Tuesday, 29 Sep 2026 at 9:27PM.
Transaction description : PURCHASE GITHUB, INC. +18774484820 US
Instrument / Cheque# : 638702
"""

ABL_TRANSFER_BODY = """Dear ACCOUNT HOLDER,
PKR 17,000.00 has been received in your Account No: ***0017 on Tuesday , 29-Sep-2026 at 10:06 PM.
Transaction details are as follow:
Transaction Description :
RAAST Transfer
Sender Name :
Some Sender
Sender Account :
***5003
Transaction Reference :
450776
"""


def test_abl_card_alert_is_debit() -> None:
    tx = AblEmailParser().parse(_email("Allied Bank Transaction Alert", ABL_CARD_BODY))
    assert tx is not None
    assert tx.provider is Provider.ABL
    assert tx.transaction_type is TransactionType.DEBIT
    assert tx.amount == Decimal("58.43")
    assert tx.currency == "USD"
    assert tx.account_identifier == "****0017"
    assert tx.reference == "638702"
    assert tx.transaction_datetime is not None
    assert "GITHUB" in (tx.merchant or "")


def test_abl_fund_transfer_received_is_credit() -> None:
    tx = AblEmailParser().parse(_email("myABL Fund Transfer Alert", ABL_TRANSFER_BODY))
    assert tx is not None
    assert tx.transaction_type is TransactionType.CREDIT
    assert tx.amount == Decimal("17000.00")
    assert tx.currency == "PKR"
    assert tx.account_identifier == "****0017"
    assert tx.reference == "450776"


# ----------------------------------------------------------------------- NayaPay
NAYAPAY_CREDIT_BODY = """NayaPay Email
Cha-Ching!
Some Sender
HBL-5003
02 Oct 2026, 09:56 PM
Rs. 5,000
AMOUNT DETAILS
Amount Received
Rs. 5,000
Total Amount
Rs. 5,000
TRANSACTION DETAILS
Transaction ID
MBMB02165655714119876
ADDITIONAL INFORMATION
Source Acc. Title
Some Sender
Channel
Raast
"""

NAYAPAY_DEBIT_BODY = """NayaPay Email
Some Receiver
easypaisa Bank-8535
02 Oct 2026, 08:17 PM
- Rs. 1,300
AMOUNT DETAILS
Amount Sent
Rs. 1,300
Total Amount
Rs. 1,300
TRANSACTION DETAILS
Transaction ID
6abfcafecf5d0a00d8a84301
ADDITIONAL INFORMATION
Destination Acc. Title
Some Receiver
Channel
Raast
"""

NAYAPAY_CARD_BODY = """NayaPay Email
Transaction failed, amount reversed!
Your transaction of Rs. 375.72 at RENDER.COM US was unsuccessful, but we've reversed the amount.
Reversal
02 Oct 2026, 10:42 PM
Rs. 375.72
AMOUNT DETAILS
Total Amount
Rs. 375.72
TRANSACTION DETAILS
Reversal Transaction ID
327676
ADDITIONAL INFORMATION
Card
Visa ●●●●1234
"""


def test_nayapay_received_is_credit() -> None:
    tx = NayapayEmailParser().parse(
        _email("You got Rs. 5,000 from Some Sender 🎉", NAYAPAY_CREDIT_BODY)
    )
    assert tx is not None
    assert tx.provider is Provider.NAYAPAY
    assert tx.transaction_type is TransactionType.CREDIT
    assert tx.amount == Decimal("5000")
    assert tx.reference == "MBMB02165655714119876"
    assert tx.merchant == "Some Sender"
    assert tx.transaction_datetime is not None


def test_nayapay_sent_is_debit() -> None:
    tx = NayapayEmailParser().parse(
        _email("You sent Rs. 1,300 to Some Receiver 💸", NAYAPAY_DEBIT_BODY)
    )
    assert tx is not None
    assert tx.transaction_type is TransactionType.DEBIT
    assert tx.amount == Decimal("1300")
    assert tx.merchant == "Some Receiver"


def test_nayapay_card_reversal_is_credit() -> None:
    tx = NayapayEmailParser().parse(
        _email("Transaction at RENDER.COM US reversed", NAYAPAY_CARD_BODY)
    )
    assert tx is not None
    assert tx.transaction_type is TransactionType.CREDIT
    assert tx.amount == Decimal("375.72")
    assert tx.account_identifier == "****1234"


def test_nayapay_otp_is_ignored() -> None:
    assert (
        NayapayEmailParser().parse(_email("Your OTP is 1234", "Your verification code is 1234"))
        is None
    )
