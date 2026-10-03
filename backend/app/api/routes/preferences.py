"""User preferences: read and partially update the signed-in user's settings."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.preferences import Preferences, PreferencesUpdate

router = APIRouter(prefix="/preferences", tags=["preferences"])


@router.get("", response_model=Preferences)
def get_preferences(current_user: User = Depends(get_current_user)) -> Preferences:
    return Preferences.model_validate(current_user.preferences or {})


@router.patch("", response_model=Preferences)
def update_preferences(
    payload: PreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Preferences:
    current = Preferences.model_validate(current_user.preferences or {})
    merged = current.model_copy(update=payload.model_dump(exclude_unset=True))
    current_user.preferences = merged.model_dump()
    # JSON columns don't detect in-place mutation; the reassignment above is a
    # new object, but flag explicitly so this stays correct if that changes.
    flag_modified(current_user, "preferences")
    db.commit()
    db.refresh(current_user)
    return Preferences.model_validate(current_user.preferences)
