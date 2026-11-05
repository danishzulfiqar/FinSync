"""HBL SMS parser tests built from real HBL (14250) templates with masked values."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models.enums import Provider, TransactionType
from app.parsers.base import SmsMessage
from app.parsers.hbl_sms import HblSmsParser

parser = HblSmsParser()
PKT = timezone(timedelta(hours=5))


def _sms(body: str, received: datetime | None = None) -> SmsMessage:
    return SmsMessage(
        message_id="m1",
        sender="14250",
        body=body,
        received_at=received or datetime(2025, 12, 16, 20, 41, 26, tzinfo=PKT),
        sim_number=1,
    )


def test_card_purchase_uses_arrival_time() -> None:
    tx = parser.parse(
        _sms("Your HBL Debit Card has been charged for a Transaction of PKR 1,151.00 on 16/12/2025 .")
    )
    assert tx is not None
    assert tx.provider == Provider.HBL
    assert tx.transaction_type == TransactionType.DEBIT
    assert tx.amount == Decimal("1151.00")
    assert tx.description == "Card purchase"
    assert tx.transaction_datetime == datetime(2025, 12, 16, 20, 41, 26, tzinfo=PKT)


def test_atm_withdrawal() -> None:
    tx = parser.parse(
        _sms(
            "Your HBL A/C 1234*****56789 has been debited with PKR 5,000.00 on 28/11/2025 "
            "for ATM Cash Withdrawal."
        )
    )
    assert tx is not None
    assert tx.transaction_type == TransactionType.DEBIT
    assert tx.description == "ATM cash withdrawal"
    assert tx.account_identifier == "****6789"


def test_account_debit_without_reason() -> None:
    tx = parser.parse(_sms("Your HBL A/C 1234*****56789 has been debited with PKR 2.76 on 01/11/2026 ."))
    assert tx is not None
    assert tx.transaction_type == TransactionType.DEBIT
    assert tx.amount == Decimal("2.76")
    assert tx.description == "Account debit"


@pytest.mark.parametrize(
    ("via", "desc"),
    [("Salary Credit.", "Salary credit"), ("Debit Card Trans. Reversal.", "Card refund")],
)
def test_account_credits(via: str, desc: str) -> None:
    tx = parser.parse(
        _sms(f"Your HBL A/C 1234*****56789 has been credited with PKR 1908.3 on 18/02/2026 via {via}")
    )
    assert tx is not None
    assert tx.transaction_type == TransactionType.CREDIT
    assert tx.amount == Decimal("1908.3")
    assert tx.description == desc
    # Arrived on a different day than the stated date -> noon of the stated date.
    assert tx.transaction_datetime == datetime(2026, 2, 18, 12, tzinfo=PKT)


def test_rtgs_account_credit() -> None:
    tx = parser.parse(
        _sms("Your HBL account 1234*****56789 has been credited with Rs. 776522.36 via RTGS Transfer on 30/12/2025.")
    )
    assert tx is not None
    assert tx.transaction_type == TransactionType.CREDIT
    assert tx.amount == Decimal("776522.36")
    assert tx.description == "RTGS transfer received"


@pytest.mark.parametrize(
    ("body", "party", "ref", "desc"),
    [
        (
            "JOHN DOE, PKR 28,000.00 received from JOHN DOE A/C via Raast on 14/12/2025 14:15:22, "
            "TXN ID SM14141520A21728. UAN:021111111425.",
            "JOHN DOE",
            "SM14141520A21728",
            "Transfer from JOHN DOE via Raast",
        ),
        (
            "JOHN DOE, PKR 25,000.00 received from JOHN DOE A/C *0000 via IBFT on 02/02/2026 08:58:19, "
            "TXN ID 4313210851400202. UAN:021111111425.",
            "JOHN DOE",
            "4313210851400202",
            "Transfer from JOHN DOE via IBFT",
        ),
        (
            "PKR 1,500.00 received from JOHN DOE IBAN in your HBL A/C via your Raast ID on "
            "26/04/2026 15:04:22 TXN ID SM261504072D0737.",
            "JOHN DOE",
            "SM261504072D0737",
            "Transfer from JOHN DOE via Raast",
        ),
        (
            "PKR 177,823.00 received from ACME CORP AKBL in your HBL A/C *0000 on 28/04/2026 09:14:41 "
            "via Raast TXN ID 3525880913170428.",
            "ACME CORP AKBL",
            "3525880913170428",
            "Transfer from ACME CORP AKBL via Raast",
        ),
        (
            "PKR 48796.18 received from in your HBL A/C on 29/05/2026 09:52:23 via RTGS TXN ID 07699408460989.",
            None,
            "07699408460989",
            "Transfer received via RTGS",
        ),
    ],
)
def test_incoming_transfers(body: str, party: str | None, ref: str, desc: str) -> None:
    tx = parser.parse(_sms(body))
    assert tx is not None
    assert tx.transaction_type == TransactionType.CREDIT
    assert tx.merchant == party
    assert tx.reference == ref
    assert tx.description == desc
    assert tx.transaction_datetime is not None and tx.transaction_datetime.second != 26


@pytest.mark.parametrize(
    "body",
    [
        "983079 is your OTP for online transaction of PKR 7,200.00 at SHOP on HBL Card 0000. Valid for 10 mins.",
        "Your HBL PersonalLoan credit assessment has been completed. Please log in to HBL Mobile.",
        "Make your Ramazan meals even more special! Avail flat 40% off with your HBL Card.",
    ],
)
def test_non_transactions_ignored(body: str) -> None:
    assert parser.parse(_sms(body)) is None


def test_non_sms_input_returns_none() -> None:
    assert parser.parse("not an SmsMessage") is None
