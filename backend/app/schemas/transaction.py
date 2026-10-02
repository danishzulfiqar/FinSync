"""API response schemas for transactions."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class TransactionSourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_type: str
    source_id: str
    source_thread_id: str | None = None
    received_at: datetime | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int | None = None
    provider: str
    account_identifier: str | None = None
    transaction_type: str
    amount: Decimal
    currency: str
    transaction_datetime: datetime | None = None
    merchant: str | None = None
    description: str | None = None
    reference: str | None = None
    balance_after: Decimal | None = None
    category: str | None = None
    source_type: str
    confidence: float
    verified: bool
    created_at: datetime
    updated_at: datetime
    sources: list[TransactionSourceOut] = []


class TransactionUpdate(BaseModel):
    """Editable fields on a transaction (ledger inline edits)."""

    category: str | None = None
    verified: bool | None = None


class TransactionListResponse(BaseModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int
