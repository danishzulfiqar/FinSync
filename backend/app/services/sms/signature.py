"""HMAC-SHA256 verification for android-sms-gateway webhooks.

Per docs.sms-gate.app the device signs each request:
    signature = HEX( HMAC_SHA256(signing_key, raw_body + timestamp) )
sent as headers ``X-Signature`` (hex) and ``X-Timestamp`` (unix seconds).

We verify with a constant-time comparison and reject stale timestamps to
prevent replay attacks.
"""

from __future__ import annotations

import hashlib
import hmac
import time


def compute_signature(signing_key: str, raw_body: bytes, timestamp: str) -> str:
    message = raw_body + timestamp.encode("utf-8")
    mac = hmac.new(signing_key.encode("utf-8"), message, hashlib.sha256)
    return mac.hexdigest()


def verify_signature(
    signing_key: str,
    raw_body: bytes,
    timestamp: str,
    signature: str,
    max_skew_seconds: int = 300,
) -> bool:
    """Return True if the signature is valid and the timestamp is fresh."""
    if not signing_key or not signature or not timestamp:
        return False

    # Reject stale/future timestamps (replay protection).
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(int(time.time()) - ts) > max_skew_seconds:
        return False

    expected = compute_signature(signing_key, raw_body, timestamp)
    return hmac.compare_digest(expected, signature)
