"""Schemas for the PDF statement-import endpoint."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class ReconciliationOut(BaseModel):
    opening_balance: float
    closing_balance: float
    computed_closing: float
    net: float
    transactions: int
    row_mismatches: int
    closing_ok: bool


class StatementPreviewRow(BaseModel):
    transaction_datetime: datetime | None = None
    description: str | None = None
    transaction_type: str
    amount: Decimal
    balance_after: Decimal | None = None
    category: str


class StatementFileResult(BaseModel):
    source_file: str
    status: str  # parsed | error
    error: str | None = None

    layout: str | None = None
    provider: str | None = None
    account_title: str | None = None
    account_number: str | None = None
    currency: str | None = None

    parsed: int = 0
    created: int = 0
    duplicates: int = 0
    linked: int = 0
    needs_review: int = 0

    account_id: int | None = None
    account_created: bool = False

    reconciliation: ReconciliationOut | None = None
    preview: list[StatementPreviewRow] = []


class StatementImportResponse(BaseModel):
    dry_run: bool
    files: list[StatementFileResult]
    totals: dict[str, int]
    # Post-import audit: {"statement": {...dedupe...}, "cross_source": {...reconcile...}}.
    audit: dict[str, dict] | None = None
