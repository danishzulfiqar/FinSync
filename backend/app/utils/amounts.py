"""Amount and currency parsing helpers for Pakistani bank notifications.

Handles the formats commonly seen in PK bank/wallet messages:
  - comma grouping:      "2,500.00"  -> Decimal("2500.00")
  - currency prefixes:   "PKR 2,500" / "Rs. 2,500" / "RS2500"
  - trailing decimals:   "2500.5"    -> Decimal("2500.50")
Returns ``None`` when no sensible amount can be extracted (parsers then skip).
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

# Matches an amount possibly grouped with commas and an optional decimal part.
_AMOUNT = r"(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
_AMOUNT_RE = re.compile(_AMOUNT)

# Amount immediately preceded by a currency token, e.g. "PKR 2,500.00" / "Rs. 1,000".
# Prefer this so we never mistake a card last-4 ("ending 1234") for the amount.
_CURRENCY_AMOUNT_RE = re.compile(
    r"(?:PKR|RS\.?|RUPEES|USD|\$)\s*" + _AMOUNT, re.IGNORECASE
)

_CURRENCY_ALIASES = {
    "PKR": "PKR",
    "RS": "PKR",
    "RS.": "PKR",
    "RUPEES": "PKR",
    "USD": "USD",
    "$": "USD",
}


def _to_decimal(raw: str) -> Decimal | None:
    try:
        return Decimal(raw.replace(",", ""))
    except InvalidOperation:
        return None


def parse_amount(text: str) -> Decimal | None:
    """Extract a monetary amount from ``text`` as a Decimal.

    A currency-tagged amount (``PKR 2,500.00``) is preferred over a bare number
    so digits like a card's last-4 are never misread as the amount. Falls back
    to the first grouped/decimal number when no currency token is present.
    """
    if not text:
        return None
    normalized = text.replace("\u00a0", " ")
    tagged = _CURRENCY_AMOUNT_RE.search(normalized)
    if tagged:
        return _to_decimal(tagged.group(1))
    match = _AMOUNT_RE.search(normalized)
    return _to_decimal(match.group(1)) if match else None


def detect_currency(text: str, default: str = "PKR") -> str:
    """Detect a currency code from free text, defaulting to ``default``."""
    if not text:
        return default
    upper = text.upper()
    for alias, code in _CURRENCY_ALIASES.items():
        if alias in upper:
            return code
    return default
