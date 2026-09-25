"""HBL bank-transfer email parser.

STATUS: scaffolding. Returns ``None`` until anonymized real HBL transfer emails
are provided. Implement extraction here once the real layout is known; the
ingestion pipeline and schema are already in place.
"""

from __future__ import annotations

from app.parsers.base import BaseParser, EmailMessage
from app.schemas.parsed import ParsedTransaction


class HblEmailParser(BaseParser):
    name = "hbl_email"

    def parse(self, message: object) -> ParsedTransaction | None:
        if not isinstance(message, EmailMessage):
            return None
        # TODO: implement once real HBL transfer email samples are provided.
        return None
