"""Per-source ingestion evidence for a transaction.

Keeps one row per (source_type, source_id) so a single transaction can be
corroborated by an email, an SMS, and later a statement line without ever
duplicating the financial record itself. Also powers idempotency: re-ingesting
the same message is a no-op because ``raw_hash`` / ``source_id`` are unique.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.transaction import Transaction


class TransactionSource(Base):
    __tablename__ = "transaction_sources"
    __table_args__ = (
        UniqueConstraint("source_type", "source_id", name="uq_source_type_source_id"),
        UniqueConstraint("raw_hash", name="uq_source_raw_hash"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), index=True
    )

    source_type: Mapped[str] = mapped_column(String(16), index=True)  # email | sms | statement | ...
    # Provider-native identifier: Gmail messageId, SMS messageId, statement row id, etc.
    source_id: Mapped[str] = mapped_column(String(255), index=True)
    # Gmail thread id (nullable, email only).
    source_thread_id: Mapped[str | None] = mapped_column(String(255))

    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # SHA-256 of the normalized raw message; used for idempotent ingestion.
    raw_hash: Mapped[str] = mapped_column(String(64), index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    transaction: Mapped["Transaction"] = relationship(back_populates="sources")
