"""Gmail OAuth 2.0 scaffolding (read-only).

Uses the official google-auth libraries. The flow:
  1. You download an OAuth client secret (Desktop app) from Google Cloud Console
     and save it to GMAIL_CLIENT_SECRET_FILE.
  2. Run `python -m app.services.gmail.oauth` (or the scripts/gmail_authorize.py
     helper). A browser opens; you consent with your own Google account.
  3. The resulting credentials (including the refresh token) are stored in
     GMAIL_TOKEN_FILE. Only read-only scope is requested.

No Gmail password is ever handled or stored. The token file must never be
committed (it lives under backend/secrets/, which is gitignored).
"""

from __future__ import annotations

import json
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from app.config import get_settings


def _token_path() -> Path:
    return get_settings().resolve_path(get_settings().gmail_token_file)


def _client_secret_path() -> Path:
    return get_settings().resolve_path(get_settings().gmail_client_secret_file)


def load_credentials() -> Credentials | None:
    """Load stored credentials, refreshing them if expired. None if not authorized."""
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
    """Run the local OAuth consent flow and persist the refresh token."""
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


if __name__ == "__main__":  # pragma: no cover - manual authorization entrypoint
    creds = authorize_interactive()
    info = json.loads(creds.to_json())
    print("Authorized. Stored token with scopes:", info.get("scopes"))
