"""Unit tests for password hashing and JWT tokens (no database required)."""

from __future__ import annotations

import jwt
import pytest

from app.config import get_settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("s3cret-password")
    assert hashed != "s3cret-password"
    assert verify_password("s3cret-password", hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_password_hash_is_salted() -> None:
    assert hash_password("same") != hash_password("same")


def test_long_password_is_accepted() -> None:
    long_pw = "a" * 200  # exceeds bcrypt's 72-byte limit; must not raise
    hashed = hash_password(long_pw)
    assert verify_password(long_pw, hashed) is True


def test_access_token_roundtrip() -> None:
    token = create_access_token(subject="42")
    payload = decode_access_token(token)
    assert payload["sub"] == "42"
    assert "exp" in payload


def test_expired_token_is_rejected() -> None:
    token = create_access_token(subject="42", expires_minutes=-1)
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


def test_token_signed_with_other_key_is_rejected() -> None:
    settings = get_settings()
    forged = jwt.encode({"sub": "42"}, "not-the-real-secret", algorithm=settings.jwt_algorithm)
    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(forged)
