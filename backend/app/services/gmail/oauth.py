"""Gmail OAuth 2.0 (read-only).

Two authorization paths are supported:

  * Web flow (production): the frontend sends the user to Google's consent
    screen via ``build_authorization_url``; Google redirects back to the backend
    callback, which calls ``exchange_code`` and stores the resulting refresh
    token in the database (``save_user_credentials``) so it survives restarts.
  * Local interactive flow (``authorize_interactive``): a convenience for
    developers that opens a browser and writes the token to a file.

No Gmail password is ever handled or stored. Only read-only scope is requested.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Google frequently returns a slightly different scope set than requested (e.g.
# it adds ``openid``, or with incremental auth returns previously-granted
# scopes). Without this, oauthlib aborts ``fetch_token`` with a "Scope has
# changed" error and the OAuth callback fails. Must be set before oauthlib runs.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

import jwt
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow, InstalledAppFlow
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.gmail_credential import GmailCredential


def _token_path() -> Path:
    return get_settings().resolve_path(get_settings().gmail_token_file)


def _client_secret_path() -> Path:
    return get_settings().resolve_path(get_settings().gmail_client_secret_file)


def load_credentials() -> Credentials | None:
    """Load file-stored credentials, refreshing if expired. None if not authorized.

    Used by the local dev script/notebook. The web app uses the DB-backed
    ``load_user_credentials`` instead.
    """
    settings = get_settings()
    token_file = _token_path()
    if not token_file.exists():
        return None

    creds = Credentials.from_authorized_user_file(str(token_file), settings.gmail_scope_list)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        _save_credentials(creds)
    return creds


def authorize_interactive() -> Credentials:
    """Run the local OAuth consent flow and persist the refresh token to a file."""
    settings = get_settings()
    secret_file = _client_secret_path()
    if not secret_file.exists():
        raise FileNotFoundError(
            f"Gmail client secret not found at {secret_file}. Download it from "
            "Google Cloud Console (OAuth client, Desktop app) and place it there."
        )

    flow = InstalledAppFlow.from_client_secrets_file(
        str(secret_file), settings.gmail_scope_list
    )
    # Opens a browser and runs a temporary local server for the redirect.
    creds = flow.run_local_server(port=8765)
    _save_credentials(creds)
    return creds


def _save_credentials(creds: Credentials) -> None:
    token_file = _token_path()
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(creds.to_json(), encoding="utf-8")
    # Restrict permissions on the secret token file.
    try:
        token_file.chmod(0o600)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Web OAuth flow (frontend-initiated)
# ---------------------------------------------------------------------------


def _client_config() -> dict | None:
    """Build an OAuth client config from env vars, or None to fall back to the file."""
    settings = get_settings()
    if settings.gmail_client_id and settings.gmail_client_secret:
        return {
            "web": {
                "client_id": settings.gmail_client_id,
                "client_secret": settings.gmail_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.gmail_oauth_redirect_uri],
            }
        }
    return None


def _build_flow() -> Flow:
    settings = get_settings()
    config = _client_config()
    if config is not None:
        return Flow.from_client_config(
            config,
            scopes=settings.gmail_scope_list,
            redirect_uri=settings.gmail_oauth_redirect_uri,
        )
    secret_file = _client_secret_path()
    if not secret_file.exists():
        raise FileNotFoundError(
            "No Gmail web OAuth client configured. Set GMAIL_CLIENT_ID and "
            "GMAIL_CLIENT_SECRET, or provide a client secret file at "
            f"{secret_file}."
        )
    return Flow.from_client_secrets_file(
        str(secret_file),
        scopes=settings.gmail_scope_list,
        redirect_uri=settings.gmail_oauth_redirect_uri,
    )


def build_authorization_url(state: str) -> str:
    """Return Google's consent URL. ``offline`` + ``consent`` guarantee a refresh token."""
    flow = _build_flow()
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    return url


def exchange_code(code: str) -> Credentials:
    """Exchange an authorization code for credentials (incl. the refresh token)."""
    flow = _build_flow()
    flow.fetch_token(code=code)
    return flow.credentials


def encode_oauth_state(user_id: int) -> str:
    """Short-lived signed token tying the callback back to the initiating user (CSRF guard)."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user_id),
            "purpose": "gmail_oauth",
            "iat": now,
            "exp": now + timedelta(minutes=10),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_oauth_state(state: str) -> int:
    """Return the user id from a state token. Raises on invalid/expired/mismatched state."""
    settings = get_settings()
    payload = jwt.decode(
        state, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
    )
    if payload.get("purpose") != "gmail_oauth":
        raise ValueError("Unexpected state token purpose")
    return int(payload["sub"])


# ---------------------------------------------------------------------------
# DB-backed credential storage (production source of truth)
# ---------------------------------------------------------------------------


def save_user_credentials(db: Session, user_id: int, creds: Credentials) -> None:
    row = db.execute(
        select(GmailCredential).where(GmailCredential.user_id == user_id)
    ).scalar_one_or_none()
    token_json = creds.to_json()
    if row is None:
        db.add(GmailCredential(user_id=user_id, token_json=token_json))
    else:
        row.token_json = token_json
    db.commit()


def load_user_credentials(db: Session, user_id: int) -> Credentials | None:
    """Load a user's stored credentials, refreshing (and re-persisting) if expired."""
    row = db.execute(
        select(GmailCredential).where(GmailCredential.user_id == user_id)
    ).scalar_one_or_none()
    if row is None:
        return None

    creds = Credentials.from_authorized_user_info(
        json.loads(row.token_json), get_settings().gmail_scope_list
    )
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        row.token_json = creds.to_json()
        db.commit()
    return creds


if __name__ == "__main__":  # pragma: no cover - manual authorization entrypoint
    creds = authorize_interactive()
    info = json.loads(creds.to_json())
    print("Authorized. Stored token with scopes:", info.get("scopes"))
