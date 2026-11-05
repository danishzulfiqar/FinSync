"""On-demand SMS sync through the android-sms-gateway Cloud API (api.sms-gate.app).

Only a ``sms:batch:received`` webhook is registered, so new SMS never trigger
anything on their own. A sync asks the cloud to have the phone replay its inbox
for a date range (``POST /inbox/refresh`` with Batch delivery); the phone then
POSTs those messages to our webhook, where HBL SMS are parsed and ingested.

The webhook URL carries a per-user HMAC token, which both authenticates the
delivery and attributes the rows to the right user.
Reference: https://docs.sms-gate.app/features/reading-messages/
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone

import httpx

from app.config import Settings

BATCH_EVENT = "sms:batch:received"
_WEBHOOK_PATH = "/webhooks/sms"


class CloudGatewayError(RuntimeError):
    """The cloud API was unreachable, rejected credentials, or returned an error."""


def webhook_token(settings: Settings, user_id: int) -> str:
    digest = hmac.new(
        settings.jwt_secret_key.encode(), f"sms-webhook:{user_id}".encode(), hashlib.sha256
    ).hexdigest()[:40]
    return f"{user_id}.{digest}"


def user_id_from_token(settings: Settings, token: str | None) -> int | None:
    """Return the user id for a valid webhook token, else None."""
    if not token or "." not in token:
        return None
    raw_id, _ = token.split(".", 1)
    try:
        user_id = int(raw_id)
    except ValueError:
        return None
    return user_id if hmac.compare_digest(webhook_token(settings, user_id), token) else None


def webhook_url(settings: Settings, user_id: int) -> str:
    base = settings.sms_webhook_public_url.strip().rstrip("/")
    prefix = settings.api_v1_prefix.rstrip("/")
    return f"{base}{prefix}{_WEBHOOK_PATH}?token={webhook_token(settings, user_id)}"


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class CloudGateway:
    def __init__(self, settings: Settings) -> None:
        if not settings.sms_cloud_configured:
            raise CloudGatewayError(
                "SMS cloud gateway not configured. Set SMS_CLOUD_USERNAME, "
                "SMS_CLOUD_PASSWORD and SMS_WEBHOOK_PUBLIC_URL in backend/.env."
            )
        self.settings = settings
        self._client = httpx.Client(
            base_url=settings.sms_cloud_api_url.rstrip("/"),
            auth=(settings.sms_cloud_username, settings.sms_cloud_password),
            timeout=settings.sms_cloud_timeout_seconds,
        )

    def __enter__(self) -> "CloudGateway":
        return self

    def __exit__(self, *exc: object) -> None:
        self._client.close()

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        try:
            resp = self._client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise CloudGatewayError(f"Could not reach the SMS cloud API: {exc}") from exc
        if resp.status_code == 401:
            raise CloudGatewayError(
                "SMS cloud API rejected the credentials (401). Check SMS_CLOUD_USERNAME / "
                "SMS_CLOUD_PASSWORD against the app's Cloud Server card."
            )
        if resp.status_code >= 400:
            raise CloudGatewayError(
                f"SMS cloud API {method} {path} failed ({resp.status_code}): {resp.text[:300]}"
            )
        return resp

    def device_id(self) -> str:
        if self.settings.sms_cloud_device_id.strip():
            return self.settings.sms_cloud_device_id.strip()
        devices = self._request("GET", "/devices").json() or []
        if not devices:
            raise CloudGatewayError(
                "No device registered on the cloud account. Start the app in Cloud mode first."
            )
        return str(devices[0]["id"])

    def ensure_batch_webhook(self, url: str, device_id: str) -> str:
        """Register our batch webhook once; drop stale/real-time ones pointing at us."""
        hooks = self._request("GET", "/webhooks").json() or []
        path = self.settings.api_v1_prefix.rstrip("/") + _WEBHOOK_PATH
        keep_id: str | None = None
        for hook in hooks:
            if path not in str(hook.get("url", "")):
                continue  # not ours; leave it alone
            if hook.get("event") == BATCH_EVENT and hook.get("url") == url and keep_id is None:
                keep_id = str(hook.get("id"))
                continue
            # Stale tunnel URL, duplicate, or a real-time sms:received hook (fires on every SMS).
            self._request("DELETE", f"/webhooks/{hook.get('id')}")
        if keep_id:
            return keep_id
        created = self._request(
            "POST", "/webhooks", json={"url": url, "event": BATCH_EVENT, "device_id": device_id}
        ).json()
        return str(created.get("id", ""))

    def request_inbox_refresh(self, device_id: str, since: datetime, until: datetime) -> None:
        self._request(
            "POST",
            "/inbox/refresh",
            json={
                "deviceId": device_id,
                "since": _iso(since),
                "until": _iso(until),
                "webhookDelivery": "Batch",
            },
        )
