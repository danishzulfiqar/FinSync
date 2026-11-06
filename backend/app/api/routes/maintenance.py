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
from app.services.maintenance import (
    dedupe_statement_balance_duplicates,
    dedupe_statement_transactions,
    reconcile_email_statement_transactions,
)

router = APIRouter(tags=["maintenance"])


@router.post("/maintenance/dedupe")
def run_dedupe(
    dry_run: bool = Query(False, description="Preview without modifying data."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Collapse duplicate statement rows and reconcile email/statement pairs."""
    statement = dedupe_statement_transactions(
        db, user_id=current_user.id, dry_run=dry_run
    )
    balance = dedupe_statement_balance_duplicates(
        db, user_id=current_user.id, dry_run=dry_run
    )
    cross_source = reconcile_email_statement_transactions(
        db, user_id=current_user.id, dry_run=dry_run
    )
    return {
        "statement": statement,
        "balance": balance,
        "cross_source": cross_source,
    }
