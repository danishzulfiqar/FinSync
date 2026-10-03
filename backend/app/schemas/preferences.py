"""User-level calculation & display preferences.

Stored as a JSON document on the user row so new toggles never need a schema
migration. Unknown keys are dropped on write; missing keys fall back to
defaults on read, so old rows keep working as the set of preferences grows.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TimeRange = Literal["1m", "3m", "6m", "1y", "all"]


class Preferences(BaseModel):
    """Full, defaulted preference set returned to the client."""

    model_config = ConfigDict(extra="ignore")

    # Money moving between the user's own accounts is a transfer, not income
    # or expense. When on, matched debit/credit pairs are excluded from flow
    # totals (balances are unaffected — they reflect real money).
    exclude_internal_transfers: bool = False
    # Pairing tolerance: a debit on account A and an equal credit on account B
    # within this many days are treated as one transfer.
    transfer_window_days: int = Field(default=3, ge=0, le=14)
    # Mask every amount on screen (for screen-sharing / public places).
    privacy_mode: bool = False
    # Period the dashboard opens on.
    default_range: TimeRange = "all"
    # Months projected on the Predictions page.
    forecast_horizon: int = Field(default=6, ge=3, le=24)


class PreferencesUpdate(BaseModel):
    """Partial update — only supplied keys change."""

    model_config = ConfigDict(extra="forbid")

    exclude_internal_transfers: bool | None = None
    transfer_window_days: int | None = Field(default=None, ge=0, le=14)
    privacy_mode: bool | None = None
    default_range: TimeRange | None = None
    forecast_horizon: int | None = Field(default=None, ge=3, le=24)
