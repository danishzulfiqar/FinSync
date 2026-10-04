"""On-demand maintenance endpoints for the signed-in user.

Lets you trigger the duplicate-collapsing cleanup from the app (or a curl) so a
paid scheduler isn't required. Scoped to the current user's own statement rows.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.maintenance import dedupe_statement_transactions

router = APIRouter(tags=["maintenance"])


@router.post("/maintenance/dedupe")
def run_dedupe(
    dry_run: bool = Query(False, description="Preview without modifying data."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Collapse the current user's duplicate statement transactions."""
    return dedupe_statement_transactions(
        db, user_id=current_user.id, dry_run=dry_run
    )
