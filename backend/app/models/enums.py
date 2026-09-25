"""Shared enumerations used across models, schemas, parsers, and services."""

from __future__ import annotations

import enum


class Provider(str, enum.Enum):
    HBL = "HBL"
    ABL = "ABL"
    NAYAPAY = "NayaPay"


class TransactionType(str, enum.Enum):
    """Normalized direction. Every provider maps to exactly one of these."""

    CREDIT = "credit"
    DEBIT = "debit"


class SourceType(str, enum.Enum):
    EMAIL = "email"
    SMS = "sms"
    STATEMENT = "statement"
    API = "api"
    MANUAL = "manual"


class DedupStatus(str, enum.Enum):
    UNIQUE = "unique"
    EXACT_DUPLICATE = "exact_duplicate"
    PROBABLE_DUPLICATE = "probable_duplicate"
    NEEDS_REVIEW = "needs_review"
