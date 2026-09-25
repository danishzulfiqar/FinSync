"""Deterministic, config-driven transaction categorization (no LLM).

Rules live in providers.yaml under ``categorization``. Matching is a
case-insensitive substring test against ``merchant`` + ``description``; the
first matching rule wins, else the configured default category is used.
"""

from __future__ import annotations

from app.config import ProvidersFile
from app.schemas.parsed import ParsedTransaction


def categorize(tx: ParsedTransaction, providers: ProvidersFile) -> str:
    haystack = f"{tx.merchant or ''} {tx.description or ''}".lower()
    for rule in providers.category_rules:
        if rule.match in haystack:
            return rule.category
    return providers.default_category
