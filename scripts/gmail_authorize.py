#!/usr/bin/env python
"""Interactive Gmail OAuth authorization helper.

Run once (from the backend/ directory, with the venv active) to grant FinSync
read-only access to your own Gmail account and store the refresh token:

    cd backend
    python ../scripts/gmail_authorize.py

Prerequisites:
  - backend/secrets/gmail_client_secret.json downloaded from Google Cloud Console
    (OAuth client ID, "Desktop app" type).
  - GMAIL_* variables set in backend/.env (defaults work for local dev).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running from repo root or scripts/.
BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from app.services.gmail.oauth import authorize_interactive  # noqa: E402


def main() -> None:
    creds = authorize_interactive()
    print("✓ Gmail authorized (read-only). Refresh token stored securely.")
    print("  Scopes:", creds.scopes)


if __name__ == "__main__":
    main()
