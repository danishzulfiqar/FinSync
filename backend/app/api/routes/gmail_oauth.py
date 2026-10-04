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

from fastapi import APIRouter, Depends, Query
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

# Public router: the callback must be reachable without a bearer token. The
# authorize endpoint still requires auth via its own dependency.
router = APIRouter(tags=["gmail-oauth"])


@router.get("/sync/gmail/authorize")
def gmail_authorize(current_user: User = Depends(get_current_user)) -> dict:
    """Return the Google consent URL for the current user to grant read-only access."""
    state = encode_oauth_state(current_user.id)
    return {"url": build_authorization_url(state)}


@router.get("/sync/gmail/callback")
def gmail_callback(
    db: Session = Depends(get_db),
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    """Google's redirect target: exchange the code, store the token, return to the app."""
    frontend = get_settings().frontend_base_url
    if error or not code or not state:
        return RedirectResponse(url=f"{frontend}/settings?gmail=error")

    try:
        user_id = decode_oauth_state(state)
        creds = exchange_code(code)
        save_user_credentials(db, user_id, creds)
    except Exception:
        return RedirectResponse(url=f"{frontend}/settings?gmail=error")

    return RedirectResponse(url=f"{frontend}/settings?gmail=connected")
