"""NayaPay email parser.

STATUS: scaffolding. Returns ``None`` until anonymized real NayaPay emails are
provided.
"""

from __future__ import annotations

from app.parsers.base import BaseParser, EmailMessage
from app.schemas.parsed import ParsedTransaction


class NayapayEmailParser(BaseParser):
    name = "nayapay_email"

    def parse(self, message: object) -> ParsedTransaction | None:
        if not isinstance(message, EmailMessage):
            return None
        # TODO: implement once real NayaPay email samples are provided.
        return None
