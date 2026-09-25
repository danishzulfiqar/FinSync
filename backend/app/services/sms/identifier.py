"""Provider identification for incoming SMS.

Only HBL financial SMS should be processed. Everything else (OTPs, promos,
personal texts, deliveries, ads) is ignored. We prefer sender-based filtering
plus a transaction-pattern check and deliberately DO NOT log unrelated SMS
bodies.
"""

from __future__ import annotations

from app.config import ProvidersFile, Settings

UNKNOWN = "UNKNOWN"


def identify_sms_provider(
    message: str,
    sender: str,
    providers: ProvidersFile,
    settings: Settings,
) -> str:
    """Return a provider key ("hbl") or ``UNKNOWN``.

    Matching order:
      1. Explicit HBL_SMS_SENDERS env override (substring match), if set.
      2. providers.yaml ``sms_senders`` for HBL.
      3. providers.yaml ``sms_body_patterns`` as a secondary confirmation.
    """
    sender_l = (sender or "").lower()

    # 1. Env override wins if configured.
    env_senders = [s.lower() for s in settings.hbl_sms_sender_list]
    if env_senders and any(cand in sender_l for cand in env_senders):
        return "hbl"

    # 2 & 3. Config-driven HBL matching.
    hbl = providers.provider("hbl")
    if hbl is None:
        return UNKNOWN

    sender_match = hbl.matches_sms_sender(sender)
    body_match = hbl.matches_sms_body(message)

    # Require a sender match when senders are configured; otherwise fall back to
    # body-pattern confirmation so the system still works before senders are set.
    if hbl.sms_senders:
        if sender_match and body_match:
            return "hbl"
        return UNKNOWN

    return "hbl" if body_match else UNKNOWN
