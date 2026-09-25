"""Parser registry.

Central place to look up the right parser(s) for a provider + channel. Keeping
this explicit (rather than import-time magic) makes it obvious which parsers are
wired in and lets the ingestion pipeline stay provider-agnostic.
"""

from __future__ import annotations

from app.parsers.abl_email import AblEmailParser
from app.parsers.base import BaseParser
from app.parsers.hbl_email import HblEmailParser
from app.parsers.hbl_sms import HblSmsParser
from app.parsers.nayapay_email import NayapayEmailParser

# provider key -> channel -> parser instance
EMAIL_PARSERS: dict[str, BaseParser] = {
    "hbl": HblEmailParser(),
    "abl": AblEmailParser(),
    "nayapay": NayapayEmailParser(),
}

SMS_PARSERS: dict[str, BaseParser] = {
    "hbl": HblSmsParser(),
}


def get_email_parser(provider_key: str) -> BaseParser | None:
    return EMAIL_PARSERS.get(provider_key.lower())


def get_sms_parser(provider_key: str) -> BaseParser | None:
    return SMS_PARSERS.get(provider_key.lower())
