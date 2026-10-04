"""Unit tests for statement normalization, categorization, and reconciliation.

These exercise the pure logic (no PDF needed) by constructing a synthetic
``Statement`` exactly as the PDF parser would produce one.
"""

from __future__ import annotations

from decimal import Decimal

from app.models.enums import Provider, TransactionType
from app.parsers.statement_pdf import Statement, _np_describe, _parse_nayapay
from app.services.categorization.keyword_rules import categorize_by_keywords
from app.services.statements.importer import (
    _mask_for,
    _nayapay_datetime,
    reconcile,
    statement_to_parsed,
)
from app.utils.fingerprint import compute_fingerprint, statement_fingerprint_extra


def _sample_statement() -> Statement:
    # HBL layout is stored newest-first (order="desc"); importer reverses it.
    return Statement(
        metadata={
            "layout": "hbl",
            "order": "desc",
            "date_fmt": "%d-%m-%Y",
            "currency": "PKR",
            "account_number": "1234567890",
            "account_title": "ACCOUNT HOLDER",
            "opening_balance": "10,000.00",
            "closing_balance": "12,500.00",
            "source_file": "hbl.pdf",
        },
        transactions=[
            # newest first
            {"date": "03-01-2025", "description": "Careem ride", "debit": "500.00",
             "credit": None, "balance": "12,500.00"},
            {"date": "02-01-2025", "description": "Salary credit", "debit": None,
             "credit": "5,000.00", "balance": "13,000.00"},
            {"date": "01-01-2025", "description": "Foodpanda order", "debit": "2,000.00",
             "credit": None, "balance": "8,000.00"},
        ],
    )


def test_statement_to_parsed_chronological_and_typed() -> None:
    parsed = statement_to_parsed(_sample_statement())
    assert [p.transaction_datetime.day for p, _ in parsed] == [1, 2, 3]  # reversed

    food, salary, careem = (p for p, _ in parsed)
    assert food.provider == Provider.HBL
    assert food.transaction_type == TransactionType.DEBIT
    assert food.amount == Decimal("2000.00")
    assert salary.transaction_type == TransactionType.CREDIT
    assert salary.amount == Decimal("5000.00")
    assert careem.balance_after == Decimal("12500.00")


def test_row_keys_are_unique_and_deterministic() -> None:
    keys1 = [k for _, k in statement_to_parsed(_sample_statement())]
    keys2 = [k for _, k in statement_to_parsed(_sample_statement())]
    assert keys1 == keys2          # deterministic across re-parses (idempotent import)
    assert len(set(keys1)) == len(keys1)  # every row distinct


def _ledger(rows: list[dict], source_file: str) -> Statement:
    return Statement(
        metadata={
            "layout": "hbl",
            "order": "asc",
            "date_fmt": "%d-%m-%Y",
            "currency": "PKR",
            "account_number": "1234567890",
            "account_title": "ACCOUNT HOLDER",
            "opening_balance": "0.00",
            "closing_balance": "0.00",
            "source_file": source_file,
        },
        transactions=rows,
    )


def _import_fingerprint(parsed) -> str:
    # Mirrors how the importer fingerprints a statement row.
    return compute_fingerprint(
        parsed,
        180,
        user_id=1,
        extra=statement_fingerprint_extra(parsed.balance_after, parsed.description),
    )


def test_overlapping_statements_dedupe_on_balance_not_file() -> None:
    """The same row in two different PDFs (different file + index) must collide."""
    shared = {
        "date": "26-01-2025",
        "description": "RAAST P2P ALISHBA AAMIR",
        "debit": "20,000.00",
        "credit": None,
        "balance": "1,065,399.96",
    }
    stmt_a = _ledger(
        [
            {"date": "20-01-2025", "description": "Grocery", "debit": "500.00",
             "credit": None, "balance": "1,085,399.96"},
            shared,
        ],
        "january.pdf",
    )
    stmt_b = _ledger(
        [
            {"date": "05-01-2025", "description": "Salary", "debit": None,
             "credit": "9,000.00", "balance": "1,105,399.96"},
            {"date": "18-01-2025", "description": "Fuel", "debit": "4,000.00",
             "credit": None, "balance": "1,101,399.96"},
            shared,  # same transaction, now at a different index in a different file
        ],
        "january-reupload.pdf",
    )

    a = {p.description: (p, k) for p, k in statement_to_parsed(stmt_a)}
    b = {p.description: (p, k) for p, k in statement_to_parsed(stmt_b)}
    pa, key_a = a["RAAST P2P ALISHBA AAMIR"]
    pb, key_b = b["RAAST P2P ALISHBA AAMIR"]

    # Source keys differ (different file + row index) — why the old scheme duplicated.
    assert key_a != key_b
    # ...but the dedup fingerprint is identical, so re-import is caught.
    assert _import_fingerprint(pa) == _import_fingerprint(pb)
    # A genuinely different row (different running balance) stays distinct.
    assert _import_fingerprint(pa) != _import_fingerprint(a["Grocery"][0])


def test_statement_fingerprint_extra_prefers_balance() -> None:
    assert statement_fingerprint_extra(Decimal("1065399.96"), "x") == "bal:1065399.96"
    assert statement_fingerprint_extra(None, "RAAST P2P ALI") == "desc:raast p2p ali"
    # Same balance, different description -> same discriminator (same ledger row).
    assert statement_fingerprint_extra(Decimal("10.00"), "A") == statement_fingerprint_extra(
        Decimal("10.00"), "B"
    )



def test_reconcile_balances() -> None:
    stmt = _sample_statement()
    parsed = statement_to_parsed(stmt)
    recon = reconcile(stmt, parsed)
    # net = -2000 + 5000 - 500 = 2500 ; 10000 + 2500 = 12500 == closing
    assert recon.net == 2500.0
    assert recon.computed_closing == 12500.0
    assert recon.closing_ok is True
    # every printed running balance matches our replay
    assert recon.row_mismatches == 0


def test_keyword_categorization_income_vs_expense() -> None:
    assert categorize_by_keywords("Monthly salary", is_credit=True) == "Salary"
    assert categorize_by_keywords("Careem ride", is_credit=False) == "Fuel & Transport"
    assert categorize_by_keywords("Foodpanda order", is_credit=False) == "Food & Dining"
    assert categorize_by_keywords("random", is_credit=False) == "Other Expense"
    assert categorize_by_keywords("random", is_credit=True) == "Other Income"


def test_signed_amount_follows_finlens_credit_minus_debit() -> None:
    stmt = _sample_statement()
    stmt.metadata["order"] = "asc"
    stmt.transactions = [
        # Both columns populated: net = 300 - 1000 = -700 -> debit of 700.
        {"date": "01-01-2025", "description": "Fee + reversal", "debit": "1,000.00",
         "credit": "300.00", "balance": "9,300.00"},
        # Zero-value row is dropped entirely.
        {"date": "02-01-2025", "description": "Memo", "debit": "0.00",
         "credit": None, "balance": "9,300.00"},
    ]
    parsed = statement_to_parsed(stmt)
    assert len(parsed) == 1
    tx = parsed[0][0]
    assert tx.transaction_type == TransactionType.DEBIT
    assert tx.amount == Decimal("700.00")


def test_mask_uses_last_four_digits() -> None:
    assert _mask_for("PK12 ABCD 0001 2345 6789") == "•••• 6789"
    assert _mask_for("1234567890") == "•••• 7890"
    assert _mask_for(None) == "•••• 0000"
    assert _mask_for("12") == "•••• 0000"


# ----------------------------------------------------------------------- NayaPay
def test_nayapay_describe_extracts_counterparty_and_bank() -> None:
    out = _np_describe(
        "Outgoing fund transfer to Alex Johnson Lee easypaisa Bank-3049 "
        "Transaction ID 6abd69b53718b4393756aed0 Service Charges Rs. 0",
        "-",
    )
    assert out["merchant"] == "Alex Johnson Lee"
    assert out["description"] == "Sent to Alex Johnson Lee · easypaisa Bank-3049"
    assert out["reference"] == "6abd69b53718b4393756aed0"


def test_nayapay_describe_incoming_and_card() -> None:
    incoming = _np_describe(
        "Incoming fund transfer from Danish Zulfiqar HBL-5003 Transaction ID MBMB01", "+"
    )
    assert incoming["description"] == "Received from Danish Zulfiqar · HBL-5003"

    card = _np_describe("Paid to Google G1SK002M London GB Visa xxxx1234", "-")
    assert card["merchant"] == "Google G1SK002M London GB"
    assert card["description"] == "Paid to Google G1SK002M London GB"
    assert card["card_last4"] == "****1234"

    reversal = _np_describe("Reversed: Paid to RENDER.COM +14158304762 US Visa xxxx1234", "+")
    assert reversal["description"] == "Refund from RENDER.COM +14158304762 US"


def test_nayapay_datetime_keeps_wall_clock_time() -> None:
    dt = _nayapay_datetime("01 Oct 2026", "12:57 AM")
    assert dt is not None
    assert (dt.year, dt.month, dt.day, dt.hour, dt.minute) == (2026, 10, 1, 0, 57)
    assert _nayapay_datetime("01 Oct 2026", None).hour == 0


def _w(text: str, center: float, top: float) -> dict:
    return {"text": text, "x0": center - 12, "x1": center + 12, "top": top}


class _FakePage:
    def __init__(self, words: list[dict], text: str) -> None:
        self._words = words
        self._text = text

    def extract_words(self, keep_blank_chars: bool = False) -> list[dict]:
        return self._words

    def extract_text(self) -> str:
        return self._text


class _FakePDF:
    def __init__(self, pages: list[_FakePage]) -> None:
        self.pages = pages


_NP_META_TEXT = (
    "Account Statement\n01 Oct 2026 - 03 Oct 2026\nDanish Zulfiqar\n"
    "test.user@example.com\nNayaPay ID\n03001234567\nIBAN\n"
    "PK49NAYA1234503001234567\n"
)


def _nayapay_fake_pdf() -> _FakePDF:
    # Column centres mirror a NayaPay statement: TIME/TYPE/DESCRIPTION/AMOUNT/BALANCE.
    words: list[dict] = [
        _w("TIME", 57, 10), _w("TYPE", 137, 10), _w("DESCRIPTION", 250, 10),
        _w("AMOUNT", 445, 10), _w("BALANCE", 530, 10),
        # T1 — Raast Out (debit transfer), name wraps across two lines.
        _w("01", 45, 30), _w("Oct", 63, 30), _w("2026", 82, 30),
        _w("Raast", 125, 30), _w("Out", 150, 30),
        _w("Outgoing", 205, 30), _w("fund", 235, 30), _w("transfer", 265, 30),
        _w("to", 290, 30), _w("Muhammad", 315, 30), _w("Shahzad", 340, 30),
        _w("-Rs.", 420, 30), _w("1,254", 455, 30),
        _w("Rs.", 505, 30), _w("746.00", 535, 30),
        _w("12:57", 48, 45), _w("AM", 70, 45), _w("Kiani", 210, 45),
        _w("easypaisa", 215, 60), _w("Bank-3049", 265, 60),
        _w("Transaction", 215, 75), _w("ID", 250, 75), _w("6abd69b53718b4393756aed0", 300, 75),
        _w("Service", 215, 90), _w("Charges", 255, 90), _w("Rs.", 285, 90), _w("0", 305, 90),
        # T2 — Raast In (credit transfer, self-transfer from HBL).
        _w("01", 45, 105), _w("Oct", 63, 105), _w("2026", 82, 105),
        _w("Raast", 125, 105), _w("In", 150, 105),
        _w("Incoming", 205, 105), _w("fund", 235, 105), _w("transfer", 265, 105),
        _w("from", 290, 105), _w("Danish", 315, 105), _w("Zulfiqar", 340, 105),
        _w("+Rs.", 420, 105), _w("5,000", 455, 105),
        _w("Rs.", 505, 105), _w("5,746.00", 535, 105),
        _w("10:29", 48, 120), _w("AM", 70, 120), _w("HBL-5003", 215, 120),
        _w("Transaction", 215, 135), _w("ID", 250, 135), _w("MBMB01052909369138835", 300, 135),
        # T3 — Online card purchase (debit) with Visa last4.
        _w("01", 45, 150), _w("Oct", 63, 150), _w("2026", 82, 150),
        _w("Online", 130, 150),
        _w("Paid", 205, 150), _w("to", 225, 150), _w("Google", 250, 150),
        _w("G1SK002M", 285, 150), _w("London", 320, 150), _w("GB", 340, 150),
        _w("-Rs.", 420, 150), _w("663.28", 455, 150),
        _w("Rs.", 505, 150), _w("5,082.72", 535, 150),
        _w("04:49", 48, 165), _w("PM", 70, 165), _w("Visa", 215, 165), _w("xxxx1234", 255, 165),
        _w("Fees", 215, 180), _w("and", 245, 180), _w("Government", 280, 180),
        _w("Taxes", 315, 180), _w("Rs.", 340, 180),
        # T4 — Reversal (credit) of a card charge.
        _w("02", 45, 195), _w("Oct", 63, 195), _w("2026", 82, 195),
        _w("Reversal", 135, 195),
        _w("Reversed:", 205, 195), _w("Paid", 240, 195), _w("to", 262, 195),
        _w("RENDER.COM", 300, 195),
        _w("+Rs.", 420, 195), _w("375.72", 455, 195),
        _w("Rs.", 505, 195), _w("5,458.44", 535, 195),
        _w("10:42", 48, 210), _w("PM", 70, 210), _w("Visa", 215, 210), _w("xxxx1234", 255, 210),
        # T5 — Card Authorization at Rs. 0 (dropped as a zero-value row).
        _w("02", 45, 225), _w("Oct", 63, 225), _w("2026", 82, 225),
        _w("Card", 130, 225),
        _w("LINK", 210, 225), _w("APP", 235, 225),
        _w("-Rs.", 420, 225), _w("0", 455, 225),
        _w("Rs.", 505, 225), _w("5,458.44", 535, 225),
        _w("10:18", 48, 240), _w("PM", 70, 240), _w("Authorization", 140, 240),
    ]
    return _FakePDF([_FakePage(words, _NP_META_TEXT)])


def test_parse_nayapay_end_to_end() -> None:
    stmt = _parse_nayapay(_nayapay_fake_pdf(), "nayapay.pdf")
    assert stmt.metadata["layout"] == "nayapay"
    assert stmt.metadata["account_number"] == "03001234567"
    assert stmt.metadata["account_title"] == "Danish Zulfiqar"
    assert stmt.metadata["iban"] == "PK49NAYA1234503001234567"
    # Opening is reconstructed from the first row's balance and amount.
    assert Decimal(stmt.metadata["opening_balance"]) == Decimal("2000.00")

    parsed = statement_to_parsed(stmt)
    # Five rows parsed, the Rs. 0 card authorization dropped -> four transactions.
    assert len(parsed) == 4
    t1, t2, t3, t4 = (p for p, _ in parsed)

    assert t1.provider is Provider.NAYAPAY
    assert t1.transaction_type is TransactionType.DEBIT
    assert t1.amount == Decimal("1254")
    assert t1.description == "Sent to Alex Johnson Lee · easypaisa Bank-3049"
    assert t1.merchant == "Alex Johnson Lee"
    assert t1.reference == "6abd69b53718b4393756aed0"
    assert t1.transaction_datetime is not None and t1.transaction_datetime.minute == 57

    assert t2.transaction_type is TransactionType.CREDIT
    assert t2.amount == Decimal("5000")
    assert t2.description == "Received from Danish Zulfiqar · HBL-5003"

    assert t3.description == "Paid to Google G1SK002M London GB"
    assert t3.account_identifier == "****1234"

    assert t4.transaction_type is TransactionType.CREDIT
    assert t4.description == "Refund from RENDER.COM"

    recon = reconcile(stmt, parsed)
    assert recon.closing_ok is True
    assert recon.row_mismatches == 0


def test_parse_nayapay_detects_rows_when_date_lands_outside_time_column() -> None:
    # Real NayaPay PDFs do not always place the date under the TIME column, and a
    # long merchant phone number can spill into the AMOUNT column ahead of the
    # "Rs" value. Detection must hinge on the signed amount, not column geometry,
    # and the amount must be read after the "Rs" token.
    words = [
        _w("TIME", 57, 10), _w("TYPE", 137, 10), _w("DESCRIPTION", 250, 10),
        _w("AMOUNT", 445, 10), _w("BALANCE", 530, 10),
        # Date sits under the TYPE column; phone number precedes "+Rs." in AMOUNT.
        _w("02", 120, 30), _w("Oct", 138, 30), _w("2026", 157, 30),
        _w("Reversed:", 205, 30), _w("Paid", 240, 30), _w("to", 262, 30),
        _w("RENDER.COM", 300, 30),
        _w("+14158304762", 400, 30), _w("+Rs.", 425, 30), _w("375.72", 458, 30),
        _w("Rs.", 505, 30), _w("100.00", 535, 30),
        _w("10:42", 48, 45), _w("PM", 70, 45), _w("Visa", 215, 45), _w("xxxx1234", 255, 45),
    ]
    stmt = _parse_nayapay(_FakePDF([_FakePage(words, _NP_META_TEXT)]), "nayapay.pdf")

    parsed = statement_to_parsed(stmt)
    assert len(parsed) == 1
    txn, _ = parsed[0]
    assert txn.transaction_type is TransactionType.CREDIT
    assert txn.amount == Decimal("375.72")  # not the phone number
    assert txn.description == "Refund from RENDER.COM"
    assert txn.account_identifier == "****1234"
    assert txn.transaction_datetime is not None

