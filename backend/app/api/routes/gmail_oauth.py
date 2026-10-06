"""Gmail web OAuth endpoints (frontend-initiated authorization).

Flow:
  1. The frontend calls ``GET /sync/gmail/authorize`` (authenticated) and gets a
     Google consent URL, then redirects the browser there.
  2. After consent, Google redirects the browser to ``GET /sync/gmail/callback``
     (public — Google cannot send a bearer token). The signed ``state`` proves
     which user started the flow. The code is exchanged and the refresh token is
     stored in the database, then the browser is sent back to the frontend.
"""

from __future__ import annotations

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.services.gmail.oauth import (
    build_authorization_url,
    decode_oauth_state,
    encode_oauth_state,
    exchange_code,
    save_user_credentials,
)

logger = logging.getLogger(__name__)

# Public router: the callback must be reachable without a bearer token. The
# authorize endpoint still requires auth via its own dependency.
router = APIRouter(tags=["gmail-oauth"])


@router.get("/sync/gmail/authorize")
def gmail_authorize(current_user: User = Depends(get_current_user)) -> dict:
    """Return the Google consent URL for the current user to grant read-only access."""
    state = encode_oauth_state(current_user.id)
    try:
        url = build_authorization_url(state)
    except FileNotFoundError as exc:
        # Gmail OAuth isn't configured on this server (no client id/secret/file).
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail=f"Gmail is not configured on the server: {exc}",
        ) from exc
    return {"url": url}


@router.get("/sync/gmail/callback")
def gmail_callback(
    db: Session = Depends(get_db),
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    """Google's redirect target: exchange the code, store the token, return to the app."""
    frontend = get_settings().frontend_base_url

    def _fail(reason: str) -> RedirectResponse:
        query = urlencode({"gmail": "error", "reason": reason})
        return RedirectResponse(url=f"{frontend}/settings?{query}")

    if error:
        logger.warning("Gmail OAuth consent returned an error: %s", error)
        return _fail(error)
    if not code or not state:
        logger.warning("Gmail OAuth callback missing code/state")
        return _fail("missing_code")

    try:
        user_id = decode_oauth_state(state)
        creds = exchange_code(code)
        save_user_credentials(db, user_id, creds)
    except Exception:
        # Surface the real cause in the server logs; keep the redirect generic.
        logger.exception("Gmail OAuth callback failed")
        return _fail("exchange_failed")

    return RedirectResponse(url=f"{frontend}/settings?gmail=connected")
