"""Parser interfaces and message containers.

Every parser implements ``parse(message) -> ParsedTransaction | None`` and must
return ``None`` for anything that is not a financial transaction. Parsers are
regex/config driven so patterns can change without touching application code.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime

from app.schemas.parsed import ParsedTransaction


@dataclass
class EmailMessage:
    """Normalized email input for email parsers."""

    message_id: str
    thread_id: str | None
    sender: str
    subject: str
    body: str
    received_at: datetime | None = None
    headers: dict[str, str] = field(default_factory=dict)


@dataclass
class SmsMessage:
    """Normalized SMS input for SMS parsers."""

    message_id: str | None
    sender: str
    body: str
    received_at: datetime | None = None
    sim_number: int | None = None


class BaseParser(ABC):
    """Common interface for all provider parsers."""

    #: Human/programmatic key, e.g. "hbl_email".
    name: str = "base"

    @abstractmethod
    def parse(self, message: object) -> ParsedTransaction | None:
        """Return a ParsedTransaction, or None if not a financial transaction."""
        raise NotImplementedError
