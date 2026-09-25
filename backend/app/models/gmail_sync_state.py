"""Gmail incremental-sync checkpoint per provider.

Stores the last processed Gmail historyId so future syncs only fetch new
messages instead of re-downloading the whole mailbox.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GmailSyncState(Base):
    __tablename__ = "gmail_sync_state"

    id: Mapped[int] = mapped_column(primary_key=True)
    # One checkpoint row per logical provider ("hbl", "abl", "nayapay") or a
    # single "mailbox" row if you prefer whole-mailbox history tracking.
    provider: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    last_history_id: Mapped[str | None] = mapped_column(String(64))
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
