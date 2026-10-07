"""Account request/response schemas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: str = Field(max_length=32)  # hbl | abl | nayapay
    type: str = Field(default="current", max_length=16)  # current | savings | wallet
    mask: str = Field(default="•••• 0000", max_length=32)
    opening_balance: Decimal = Decimal("0")
    color: str = Field(default="#7c3aed", max_length=16)


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    provider: str
    type: str
    mask: str
    opening_balance: Decimal
    currency: str
    color: str
    is_active: bool
    created_at: datetime


class AccountUpdate(BaseModel):
    """Editable account fields (currently just the on/off toggle and name)."""

    is_active: bool | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
