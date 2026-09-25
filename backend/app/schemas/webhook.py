"""Schemas for the android-sms-gateway webhook payloads.

Verified against docs.sms-gate.app (event ``sms:received`` and
``sms:batch:received``). Field ``sender`` is current; older builds used
``phoneNumber`` — both are accepted via ``populate_by_name`` + alias handling
in the route so historical devices keep working.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SmsMessagePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    message_id: str | None = Field(default=None, alias="messageId")
    message: str
    # Current field is "sender"; accept legacy "phoneNumber" too (handled in route).
    sender: str | None = None
    recipient: str | None = None
    sim_number: int | None = Field(default=None, alias="simNumber")
    received_at: datetime | None = Field(default=None, alias="receivedAt")


class SmsBatchPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    messages: list[SmsMessagePayload]


class SmsWebhookEnvelope(BaseModel):
    """Top-level webhook envelope. ``payload`` shape depends on ``event``."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    device_id: str | None = Field(default=None, alias="deviceId")
    event: str
    id: str | None = None
    webhook_id: str | None = Field(default=None, alias="webhookId")
    payload: dict  # parsed per-event in the route
