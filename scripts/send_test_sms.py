#!/usr/bin/env python
"""Send a signed test payload to the local SMS webhook.

Simulates an android-sms-gateway `sms:received` delivery, including a valid
HMAC-SHA256 signature, so you can verify the endpoint end-to-end without a phone.

Usage (from repo root, backend deps installed):
    python scripts/send_test_sms.py --key "$SMS_WEBHOOK_SIGNING_KEY"

By default it posts a synthetic HBL-style purchase SMS to
http://localhost:8000/api/v1/webhooks/sms
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import time

import httpx


def sign(key: str, body: bytes, ts: str) -> str:
    return hmac.new(key.encode(), body + ts.encode(), hashlib.sha256).hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000/api/v1/webhooks/sms")
    ap.add_argument("--key", required=True, help="SMS_WEBHOOK_SIGNING_KEY value")
    ap.add_argument("--sender", default="HBL")
    ap.add_argument(
        "--message",
        default="Your card ending 1234 was used for purchase of PKR 2,500.00 at ABC STORE. Ref TXN9988",
    )
    args = ap.parse_args()

    payload = {
        "deviceId": "test-device",
        "event": "sms:received",
        "id": "evt_test_1",
        "webhookId": "wh_test_1",
        "payload": {
            "messageId": "msg_test_1",
            "message": args.message,
            "sender": args.sender,
            "recipient": "+920000000000",
            "simNumber": 1,
            "receivedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        },
    }
    body = json.dumps(payload).encode()
    ts = str(int(time.time()))
    sig = sign(args.key, body, ts)

    resp = httpx.post(
        args.url,
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Signature": sig,
            "X-Timestamp": ts,
        },
        timeout=10,
    )
    print("Status:", resp.status_code)
    print("Body:", resp.text)


if __name__ == "__main__":
    main()
