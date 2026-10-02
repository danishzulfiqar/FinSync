"""Smoke test for the profile/settings endpoints against the live app.

Run: ./.venv/bin/python scripts/smoke_profile.py

Registers a throwaway user via the HTTP API, exercises:
  - PATCH /auth/me (update name + email)
  - PATCH /auth/me email-conflict -> 409
  - POST  /auth/change-password (wrong current -> 400, correct -> 204)
  - login with the new password
then deletes the throwaway user(s). Prints ALL_OK on success.
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402

SUFFIX = uuid.uuid4().hex[:8]
EMAIL = f"smoke+profile-{SUFFIX}@finsync.example.com"
EMAIL2 = f"smoke+profile2-{SUFFIX}@finsync.example.com"
OTHER = f"smoke+profile-other-{SUFFIX}@finsync.example.com"
PW = "original-pass-1"
NEW_PW = "brand-new-pass-2"

client = TestClient(app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def main() -> None:
    # Register primary + a second user (for the email-conflict case).
    r = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Smoke Tester", "email": EMAIL, "password": PW},
    )
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]

    r = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Other Person", "email": OTHER, "password": PW},
    )
    assert r.status_code == 201, r.text

    # PATCH /auth/me -> update name + email.
    r = client.patch(
        "/api/v1/auth/me",
        headers=_auth(token),
        json={"full_name": "Renamed Tester", "email": EMAIL2},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["full_name"] == "Renamed Tester", body
    assert body["email"] == EMAIL2, body
    print("PATCH /auth/me ok")

    # Email conflict -> 409.
    r = client.patch(
        "/api/v1/auth/me",
        headers=_auth(token),
        json={"email": OTHER},
    )
    assert r.status_code == 409, r.text
    print("email conflict -> 409 ok")

    # Wrong current password -> 400.
    r = client.post(
        "/api/v1/auth/change-password",
        headers=_auth(token),
        json={"current_password": "not-the-password", "new_password": NEW_PW},
    )
    assert r.status_code == 400, r.text
    print("wrong current password -> 400 ok")

    # Correct current password -> 204.
    r = client.post(
        "/api/v1/auth/change-password",
        headers=_auth(token),
        json={"current_password": PW, "new_password": NEW_PW},
    )
    assert r.status_code == 204, r.text
    print("change-password -> 204 ok")

    # Old password no longer works; new password logs in.
    r = client.post(
        "/api/v1/auth/login",
        data={"username": EMAIL2, "password": PW},
    )
    assert r.status_code == 401, r.text
    r = client.post(
        "/api/v1/auth/login",
        data={"username": EMAIL2, "password": NEW_PW},
    )
    assert r.status_code == 200, r.text
    print("login with new password ok")

    print("ALL_OK")


def cleanup() -> None:
    with SessionLocal() as db:
        db.execute(delete(User).where(User.email.in_([EMAIL, EMAIL2, OTHER])))
        db.commit()


if __name__ == "__main__":
    try:
        main()
    finally:
        cleanup()
