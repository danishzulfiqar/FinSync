"""HBL SMS parser tests using ANONYMIZED synthetic messages only.

These messages are invented for testing and contain no real account data. The
parser is scaffolding: it recognizes generic transaction wording and rejects
OTP/sensitive messages. Update these fixtures with anonymized versions of your
real HBL SMS once available.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from app.models.enums import Provider, TransactionType
from app.parsers.base import SmsMessage
from app.parsers.hbl_sms import HblSmsParser

parser = HblSmsParser()


def _sms(body: str) -> SmsMessage:
    return SmsMessage(
        message_id="m1",
        sender="HBL",
        body=body,
        received_at=datetime(2026, 9, 25, 19, 32, tzinfo=timezone.utc),
        sim_number=1,
    )


def test_hbl_card_purchase() -> None:
    tx = parser.parse(
        _sms("Your card ending 1234 was used for purchase of PKR 2,500.00 at ABC STORE. Ref TXN9988")
    )
    assert tx is not None
    assert tx.provider == Provider.HBL
    assert tx.transaction_type == TransactionType.DEBIT
    assert tx.amount == Decimal("2500.00")
    assert tx.currency == "PKR"
    assert tx.account_identifier == "****1234"
    assert tx.reference == "TXN9988"


def test_hbl_refund_is_credit() -> None:
    tx = parser.parse(_sms("Refund of Rs. 1,000 credited to your card ending 1234."))
    assert tx is not None
    assert tx.transaction_type == TransactionType.CREDIT
    assert tx.amount == Decimal("1000")


def test_comma_separated_amount() -> None:
    tx = parser.parse(_sms("Purchase of PKR 1,234,567.89 debited at MEGA MART"))
    assert tx is not None
    assert tx.amount == Decimal("1234567.89")


def test_otp_is_ignored() -> None:
    assert parser.parse(_sms("Your OTP is 123456. Do not share it with anyone.")) is None


def test_promotional_is_ignored() -> None:
    assert parser.parse(_sms("Enjoy 20% cashback this weekend! Terms apply.")) is None


def test_non_sms_input_returns_none() -> None:
    assert parser.parse("not an SmsMessage") is None
