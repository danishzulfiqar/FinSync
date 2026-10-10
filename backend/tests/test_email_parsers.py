"""Email parser tests driven by redacted real-email layouts.

ABL, NayaPay and HBL parse the live layouts verified from the mailbox.
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
HBL_TRANSFER_BODY = """Dear Customer,
Your funds transfer was successful. Transaction details are as follows:
Amount
PKR 5,000
Receiver Account Title
JOHN DOE
Receiver Bank Name
NayaPay
From Account Title
ACCOUNT HOLDER
From Acc.No/IBAN
*5003
From Bank Name
HBL / Konnect
Date and Time
08-Oct-2026 09:02
Channel
via Raast
Transaction ID
1227054068
"""

HBL_BUNDLE_BODY = """Dear Customer,
Your Bill Payment was successful. Transaction details are as follows:
Amount PKR. 450
Biller/ Company Name UFONE
Consumer ID 03001234567
Account Title ACCOUNT HOLDER
From Account No. /IBAN *5003
Date-Time 06-Oct-2026 18:22
Transaction ID. 1205873233
Comments
"""

HBL_RAAST_BODY = """Dear Customer,
You have successfully sent money to Other Bank A/C via Raast through HBL Digital Banking.
The transaction details are as follows:-
Date-Time
25-07-2026 05:06:03
Transaction
Send Money to Other Bank A/C via Raast
Amount
5000.00
From Account Title
ACCOUNT HOLDER
Transaciton ID
19324194836
Beneficiary Account Title
JANE SMITH
Beneficiary Account No /IBAN
*2023
"""


def test_hbl_transfer_to_other_bank() -> None:
    tx = HblEmailParser().parse(_email("HBL Mobile | Transfer to Other Bank", HBL_TRANSFER_BODY))
    assert tx is not None
    assert tx.provider == Provider.HBL
    assert tx.transaction_type == TransactionType.DEBIT
    assert tx.amount == Decimal("5000")
    assert tx.currency == "PKR"
    assert tx.account_identifier == "****5003"
    assert tx.merchant == "JOHN DOE"
    assert tx.description == "Transfer to JOHN DOE (NayaPay)"
    assert tx.reference == "1227054068"
    assert tx.transaction_datetime is not None
    assert (tx.transaction_datetime.year, tx.transaction_datetime.month, tx.transaction_datetime.day) == (
        2026,
        10,
        8,
    )


def test_hbl_mobile_bundle_bill_payment() -> None:
    tx = HblEmailParser().parse(_email("HBL Mobile | Mobile Bundle", HBL_BUNDLE_BODY))
    assert tx is not None
    assert tx.transaction_type == TransactionType.DEBIT
    assert tx.amount == Decimal("450")
    assert tx.account_identifier == "****5003"
    assert tx.merchant == "UFONE"
    assert tx.description == "Bill payment – UFONE"
    assert tx.reference == "1205873233"


def test_hbl_send_money_via_raast() -> None:
    tx = HblEmailParser().parse(
        _email("HBL Digital | Send Money to Other Bank via Raast", HBL_RAAST_BODY)
    )
    assert tx is not None
    assert tx.transaction_type == TransactionType.DEBIT
    assert tx.amount == Decimal("5000.00")
    assert tx.merchant == "JANE SMITH"
    assert tx.description == "Raast transfer to JANE SMITH"
    assert tx.reference == "19324194836"


def test_hbl_non_transaction_returns_none() -> None:
    # Login / OTP / statement notifications are not transactions.
    assert HblEmailParser().parse(_email("HBL Mobile | Login", "You logged in.")) is None
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
    assert tx.merchant == "Some Sender"


# Real ABL layout variant: "PKR." with a trailing dot, same-line labels, and a
# DD/MM/YYYY 24-hour timestamp. The sender name identifies the payer.
ABL_TRANSFER_V2_BODY = """Allied Bank Limited
Dear ACCOUNT HOLDER,

PKR. 204,510.43 has been received in your Account No ***0017 on 01/09/2026 at 01:28:49.

Transaction details are as folows:

Transaction Description: Inter Bank Fund Transfer
Sender Name: ACME CORP
Sender Account: ***8773
Transaction Reference: 512375
"""

# Same variant but with an empty "Sender Name:" line (name unavailable). The
# parser must NOT grab the following "Sender Account:" line as the name.
ABL_TRANSFER_NO_NAME_BODY = """Allied Bank Limited
Dear ACCOUNT HOLDER,

PKR. 56,000.00 has been received in your Account No ***0017 on 02/09/2026 at 09:10:00.

Transaction Description: Inter Bank Fund Transfer
Sender Name:
Sender Account: ***0600
Transaction Reference: 663424
"""


def test_abl_fund_transfer_v2_extracts_sender_and_datetime() -> None:
    tx = AblEmailParser().parse(_email("myABL Fund Transfer Alert", ABL_TRANSFER_V2_BODY))
    assert tx is not None
    assert tx.transaction_type is TransactionType.CREDIT
    assert tx.amount == Decimal("204510.43")
    assert tx.currency == "PKR"
    assert tx.account_identifier == "****0017"
    assert tx.reference == "512375"
    assert tx.merchant == "ACME CORP"
    assert tx.transaction_datetime is not None
    # Parsed from the slash/24-hour layout, not the email received time.
    assert tx.transaction_datetime.year == 2026
    assert tx.transaction_datetime.month == 9
    assert tx.transaction_datetime.day == 1
    assert tx.transaction_datetime.hour == 1


def test_abl_fund_transfer_empty_sender_name_is_none() -> None:
    tx = AblEmailParser().parse(_email("myABL Fund Transfer Alert", ABL_TRANSFER_NO_NAME_BODY))
    assert tx is not None
    assert tx.transaction_type is TransactionType.CREDIT
    assert tx.amount == Decimal("56000.00")
    assert tx.reference == "663424"
    # Must not mistake the "Sender Account:" line for the sender name.
    assert tx.merchant is None


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
