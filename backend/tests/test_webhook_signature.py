"""HMAC webhook signature verification tests."""

from __future__ import annotations

import time

from app.services.sms.signature import compute_signature, verify_signature

KEY = "test-signing-key"


def test_valid_signature() -> None:
    body = b'{"event":"sms:received"}'
    ts = str(int(time.time()))
    sig = compute_signature(KEY, body, ts)
    assert verify_signature(KEY, body, ts, sig) is True


def test_wrong_key_rejected() -> None:
    body = b'{"event":"sms:received"}'
    ts = str(int(time.time()))
    sig = compute_signature("other-key", body, ts)
    assert verify_signature(KEY, body, ts, sig) is False


def test_tampered_body_rejected() -> None:
    ts = str(int(time.time()))
    sig = compute_signature(KEY, b"original", ts)
    assert verify_signature(KEY, b"tampered", ts, sig) is False


def test_stale_timestamp_rejected() -> None:
    body = b"payload"
    old_ts = str(int(time.time()) - 10_000)
    sig = compute_signature(KEY, body, old_ts)
    assert verify_signature(KEY, body, old_ts, sig, max_skew_seconds=300) is False


def test_missing_signature_rejected() -> None:
    assert verify_signature(KEY, b"x", str(int(time.time())), "") is False


def test_webhook_token_roundtrip() -> None:
    from app.config import Settings
    from app.services.sms.cloud import user_id_from_token, webhook_token, webhook_url

    s = Settings(jwt_secret_key="secret-a", sms_webhook_public_url="https://x.ngrok-free.app/")
    token = webhook_token(s, 7)
    assert user_id_from_token(s, token) == 7
    assert webhook_url(s, 7) == f"https://x.ngrok-free.app/api/v1/webhooks/sms?token={token}"
    assert user_id_from_token(s, token.replace("7.", "8.", 1)) is None
    assert user_id_from_token(Settings(jwt_secret_key="secret-b"), token) is None
    assert user_id_from_token(s, None) is None
    assert user_id_from_token(s, "garbage") is None
