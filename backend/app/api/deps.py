"""Shared FastAPI dependencies (authentication)."""

from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.security import decode_access_token
from app.database import get_db
from app.models.user import User

_prefix = get_settings().api_v1_prefix.lstrip("/")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{_prefix}/auth/login")

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(token)
        subject = payload.get("sub")
        if subject is None:
            raise _credentials_error
        user_id = int(subject)
    except (jwt.PyJWTError, ValueError, TypeError):
        raise _credentials_error

    user = db.get(User, user_id)
    if user is None:
        raise _credentials_error
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user"
        )
    return user
