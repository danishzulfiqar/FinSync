"""SMS webhook endpoint for android-sms-gateway.

Security:
  - Every request is authenticated either by the per-user ``token`` query
    parameter on the registered webhook URL (Cloud-mode sync) or by HMAC-SHA256
    (X-Signature + X-Timestamp) using the app's signing key.
  - Only HBL financial SMS are processed; all other messages are ignored and
    their bodies are NOT logged.
  - Raw SMS bodies are never persisted; only normalized transaction data is
    stored (a hash of the message is kept for idempotency).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.config import get_providers_config, get_settings
from app.models.enums import SourceType
from app.database import get_db
from app.parsers import get_sms_parser
from app.parsers.base import SmsMessage
from app.schemas.webhook import SmsWebhookEnvelope
from app.services.gmail.sync import _resolve_account
from app.services.ingestion.pipeline import ingest_parsed_transaction
from app.services.maintenance import reconcile_email_statement_transactions
from app.services.sms.cloud import user_id_from_token
from app.services.sms.identifier import UNKNOWN, identify_sms_provider
from app.services.sms.signature import verify_signature
from app.utils.fingerprint import raw_message_hash

router = APIRouter(tags=["webhooks"])

# Events we accept; individual + batch received.
_RECEIVED_EVENTS = {"sms:received", "sms:batch:received"}


@router.post("/webhooks/sms")
async def sms_webhook(
    request: Request,
    token: str | None = Query(default=None),
    x_signature: str | None = Header(default=None, alias="X-Signature"),
    x_timestamp: str | None = Header(default=None, alias="X-Timestamp"),
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    raw_body = await request.body()

    user_id = user_id_from_token(settings, token)
    if user_id is None and not verify_signature(
        settings.sms_webhook_signing_key,
        raw_body,
        x_timestamp or "",
        x_signature or "",
        settings.sms_webhook_max_skew_seconds,
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid signature")

    try:
        envelope = SmsWebhookEnvelope.model_validate_json(raw_body)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid payload")

    # Acknowledge non-received events (sent/delivered/ping/etc.) without processing.
    if envelope.event not in _RECEIVED_EVENTS:
        return {"status": "ignored", "reason": "unhandled_event", "event": envelope.event}

    messages = _extract_messages(envelope)

    processed = 0
    ignored = 0
    results: list[dict] = []
    for item in messages:
        outcome = _process_one(db, item, user_id)
        if outcome is None:
            ignored += 1
            continue
        processed += 1
        results.append(outcome)

    if processed and user_id is not None:
        reconcile_email_statement_transactions(db, user_id=user_id)

    return {"status": "ok", "processed": processed, "ignored": ignored, "results": results}


def _extract_messages(envelope: SmsWebhookEnvelope) -> list[dict]:
    """Return a list of per-message dicts for both single and batch events."""
    if envelope.event == "sms:batch:received":
        return list(envelope.payload.get("messages", []))
    return [envelope.payload]


def _process_one(db: Session, item: dict, user_id: int | None) -> dict | None:
    settings = get_settings()
    providers = get_providers_config()

    body = item.get("message") or ""
    # Support both current ("sender") and legacy ("phoneNumber") field names.
    sender = item.get("sender") or item.get("phoneNumber") or ""
    message_id = item.get("messageId")
    received_at = _parse_dt(item.get("receivedAt"))
    sim_number = item.get("simNumber")

    hbl_cfg = providers.provider("hbl")
    if settings.sms_debug_capture_file and (
        (hbl_cfg is not None and hbl_cfg.matches_sms_sender(sender)) or "hbl" in f"{sender} {body}".lower()
    ):
        _capture(settings.resolve_path(settings.sms_debug_capture_file), sender, body, item.get("receivedAt"))

    # ---- Provider identification: only HBL financial SMS proceed ----
    provider_key = identify_sms_provider(body, sender, providers, settings)
    if provider_key == UNKNOWN:
        # Do NOT log the body of unrelated messages.
        return None

    parser = get_sms_parser(provider_key)
    if parser is None:
        return None

    parsed = parser.parse(
        SmsMessage(
            message_id=message_id,
            sender=sender,
            body=body,
            received_at=received_at,
            sim_number=sim_number,
        )
    )
    if parsed is None:
        return None

    # Idempotency key: prefer the gateway messageId, fall back to a content hash.
    r_hash = raw_message_hash(provider_key, sender, body, str(received_at))
    source_id = message_id or r_hash

    account_id = (
        _resolve_account(db, user_id, provider_key, parsed.account_identifier)
        if user_id is not None
        else None
    )
    result = ingest_parsed_transaction(
        db,
        parsed,
        source_type=SourceType.SMS,
        source_id=source_id,
        raw_hash=r_hash,
        user_id=user_id,
        account_id=account_id,
    )
    return {"status": result.status, "transaction_id": result.transaction_id}


def _capture(path, sender: str, body: str, received_at: str | None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps({"sender": sender, "receivedAt": received_at, "message": body}) + "\n")


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)
