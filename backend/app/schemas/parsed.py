"""The common normalized output produced by every parser.

Parsers return ``ParsedTransaction | None``. ``None`` means "this message is not
a financial transaction" (OTP, promo, statement summary, etc.). Fields the
source does not provide are left as ``None`` — parsers must never invent data.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import Provider, SourceType, TransactionType


class ParsedTransaction(BaseModel):
    provider: Provider
    transaction_type: TransactionType
    amount: Decimal
    currency: str = "PKR"

    account_identifier: str | None = None  # masked, e.g. "****1234"
    transaction_datetime: datetime | None = None
    merchant: str | None = None
    description: str | None = None
    reference: str | None = None
    balance_after: Decimal | None = None

    # Provenance
    source_type: SourceType
    source_message_id: str | None = None
    source_thread_id: str | None = None

    # Non-sensitive structured parse output for auditing / re-parsing.
    raw_data: dict = Field(default_factory=dict)

    # Parser's self-assessed confidence in [0, 1].
    confidence: float = 1.0
