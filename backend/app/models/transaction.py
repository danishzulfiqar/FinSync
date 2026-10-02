"""Normalized financial transaction model — the single source of truth."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.transaction_source import TransactionSource


class Transaction(Base):
    """A deduplicated financial transaction.

    One logical transaction may be evidenced by multiple sources (email + SMS +
    statement). The financial record lives here exactly once; the evidence lives
    in ``transaction_sources``.
    """

    __tablename__ = "transactions"
    __table_args__ = (
        # Enforce idempotency at the database level: the same normalized
        # transaction can never be inserted twice.
        UniqueConstraint("fingerprint", name="uq_transactions_fingerprint"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # Ownership (nullable: mailbox-ingested rows may predate a user link).
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), index=True
    )

    # Provider + account
    provider: Mapped[str] = mapped_column(String(32), index=True)
    account_identifier: Mapped[str | None] = mapped_column(String(64), index=True)

    # Direction + money
    transaction_type: Mapped[str] = mapped_column(String(16), index=True)  # credit | debit
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    currency: Mapped[str] = mapped_column(String(3), default="PKR")

    # When it happened (may be null if the source omits it)
    transaction_datetime: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )

    # Descriptive fields (null where the source does not provide them)
    merchant: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(1024))
    reference: Mapped[str | None] = mapped_column(String(128), index=True)
    balance_after: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    category: Mapped[str | None] = mapped_column(String(64), index=True)

    # Provenance of the record that first created this transaction.
    source_type: Mapped[str] = mapped_column(String(16))  # email | sms | statement | api | manual
    source_message_id: Mapped[str | None] = mapped_column(String(255), index=True)
    source_message_hash: Mapped[str | None] = mapped_column(String(64), index=True)

    # Structured non-sensitive parsed data kept for auditing / re-parsing.
    raw_data: Mapped[dict | None] = mapped_column(JSON)

    # Deduplication + confidence
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    confidence: Mapped[float] = mapped_column(default=1.0)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    sources: Mapped[list["TransactionSource"]] = relationship(
        back_populates="transaction",
        cascade="all, delete-orphan",
    )
