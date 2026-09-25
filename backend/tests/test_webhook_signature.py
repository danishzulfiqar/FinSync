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
