"""Date/time parsing for provider notification emails.

Bank/wallet emails print local (Asia/Karachi) wall-clock times in a handful of
formats. This normalizes them to timezone-aware datetimes so downstream time
bucketing and display are consistent.
"""

from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

PK_TZ = ZoneInfo("Asia/Karachi")

# All comma-stripped; see parse_local_datetime for the normalization.
_FORMATS = (
    "%d %b %Y %I:%M%p",   # 29 Sep 2026 9:27PM        (ABL card)
    "%d %b %Y %I:%M %p",  # 02 Oct 2026 09:56 PM      (NayaPay)
    "%d-%b-%Y %I:%M%p",   # 29-Sep-2026 10:06PM       (ABL transfer)
    "%d-%b-%Y %I:%M %p",  # 29-Sep-2026 10:06 PM
)


def parse_local_datetime(date_part: str, time_part: str | None = None) -> datetime | None:
    """Parse a provider date (+ optional time) into an Asia/Karachi datetime.

    Returns ``None`` when no known format matches, so parsers can fall back to
    the email's received timestamp rather than inventing a value.
    """
    raw = f"{date_part} {time_part}" if time_part else date_part
    raw = raw.replace(",", " ")
    raw = re.sub(r"\s+", " ", raw).strip()
    for fmt in _FORMATS:
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=PK_TZ)
        except ValueError:
            continue
    return None
