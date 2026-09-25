# Android SMS Gateway — Setup for FinSync

FinSync uses the open-source **[SMS Gateway for Android](https://github.com/capcom6/android-sms-gateway)**
(`capcom6/android-sms-gateway`) as the SMS collection/forwarding layer. The
Android app's only job is to forward **incoming** SMS to the FinSync backend
webhook. FinSync does the filtering, parsing, and storage server-side.

> We do **not** build a custom Android app. We do **not** grant send-SMS
> permissions unless you also want outbound features. For FinSync you only need
> **incoming** SMS forwarding.

---

## What the app sends (verified payload)

On an incoming SMS the app POSTs JSON to your webhook. Verified against
`docs.sms-gate.app`:

```json
{
  "deviceId": "ffffffffceb0b1db0000018e937c815b",
  "event": "sms:received",
  "id": "Ey6ECgOkVVFjz3CL48B8C",
  "payload": {
    "messageId": "abc123",
    "message": "Android is always a sweet treat!",
    "sender": "6505551212",
    "recipient": "+1234567890",
    "simNumber": 1,
    "receivedAt": "2024-06-22T15:46:11.000+07:00"
  },
  "webhookId": "LreFUt-Z3sSq0JufY9uWB"
}
```

Batch (used for historical export): event `sms:batch:received` with
`payload.messages: [ {...}, {...} ]` (max 100 per batch).

> Note: older app builds used `phoneNumber` instead of `sender`. FinSync accepts
> both.

### Security: HMAC signing (required)

The app signs each request with **HMAC-SHA256** and sends:

- `X-Signature`: hex HMAC of `rawBody + timestamp`
- `X-Timestamp`: unix seconds

FinSync verifies this using `SMS_WEBHOOK_SIGNING_KEY` and rejects unsigned,
invalid, or stale (>5 min) requests. Set the same signing key in both places.

---

## One-time setup

### 1. Install the app
1. Download the latest APK from the
   [Releases page](https://github.com/capcom6/android-sms-gateway/releases).
2. Install it on the Android phone that receives your **HBL card SMS**.
3. Grant **RECEIVE_SMS** (required for incoming webhooks). READ_PHONE_STATE is
   optional (lets it report which SIM / the device number).

### 2. Start Local Server mode
1. Open the app.
2. Toggle **Local Server** on, tap **Offline** to activate.
3. Note the device's local IP, username, and password shown in the app.

### 3. Configure the signing key
1. In the app: **Settings → Webhooks → Signing Key**. Copy it.
2. Put it in `backend/.env` as `SMS_WEBHOOK_SIGNING_KEY=...`.
3. Restart the backend so it picks up the new key.

### 4. Expose the backend to the phone
Pick one (see `README.md` for details):

- **Same Wi‑Fi + reverse proxy / HTTPS** (the app requires HTTPS except for
  `http://127.0.0.1`).
- **ADB reverse** (simplest for dev over USB):
  ```bash
  adb reverse tcp:8000 tcp:8000
  # then register the webhook to http://127.0.0.1:8000/api/v1/webhooks/sms
  ```
- **Cloudflare Tunnel / ngrok** for a public HTTPS URL.

### 5. Register the webhook
Replace `<user>`, `<pass>`, and `<device_ip>` with values from the app. Register
the `sms:received` event pointing at FinSync:

```bash
curl -X POST -u <user>:<pass> \
  -H "Content-Type: application/json" \
  -d '{
    "id": "finsync-hbl",
    "url": "http://127.0.0.1:8000/api/v1/webhooks/sms",
    "event": "sms:received"
  }' \
  http://<device_ip>:8080/webhooks
```

For historical import later, also register `sms:batch:received` to the same URL.

### 6. Test it
- Send yourself an ordinary SMS → confirm the backend receives it (unrelated
  messages are safely ignored, not stored).
- Or simulate without a phone:
  ```bash
  python scripts/send_test_sms.py --key "$SMS_WEBHOOK_SIGNING_KEY"
  ```

---

## Privacy notes
- FinSync only processes **HBL** financial SMS (sender + pattern match). All
  other SMS (OTP, promos, personal) are ignored and their **bodies are not
  logged**.
- Raw SMS text is **not** persisted — only normalized transaction fields plus a
  one-way hash for deduplication.
- Deregister the webhook any time:
  ```bash
  curl -X DELETE -u <user>:<pass> http://<device_ip>:8080/webhooks/finsync-hbl
  ```

## References
- App repo: https://github.com/capcom6/android-sms-gateway
- Webhooks docs: https://docs.sms-gate.app/features/webhooks/
- FastAPI example: https://github.com/android-sms-gateway/example-webhooks-fastapi
