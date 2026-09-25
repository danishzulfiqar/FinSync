"""Allied Bank (ABL) email parser.

STATUS: scaffolding. Returns ``None`` until anonymized real ABL emails are
provided.
"""

from __future__ import annotations

from app.parsers.base import BaseParser, EmailMessage
from app.schemas.parsed import ParsedTransaction


class AblEmailParser(BaseParser):
    name = "abl_email"

    def parse(self, message: object) -> ParsedTransaction | None:
        if not isinstance(message, EmailMessage):
            return None
        # TODO: implement once real ABL email samples are provided.
        return None
