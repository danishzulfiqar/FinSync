"""Unit tests for statement normalization, categorization, and reconciliation.

These exercise the pure logic (no PDF needed) by constructing a synthetic
``Statement`` exactly as the PDF parser would produce one.
"""

from __future__ import annotations

from decimal import Decimal

from app.models.enums import Provider, TransactionType
from app.parsers.statement_pdf import Statement
from app.services.categorization.keyword_rules import categorize_by_keywords
from app.services.statements.importer import (
    _mask_for,
    reconcile,
    statement_to_parsed,
)


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
