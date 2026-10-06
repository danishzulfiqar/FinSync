"""PDF bank-statement upload & import (FinLens-style)."""

from __future__ import annotations

import io

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.statement import StatementFileResult, StatementImportResponse
from app.services.maintenance import reconcile_email_statement_transactions
from app.services.statements.importer import import_statement

router = APIRouter(prefix="/statements", tags=["statements"])

MAX_FILE_BYTES = 15 * 1024 * 1024  # 15 MB per file


@router.post("/upload", response_model=StatementImportResponse)
def upload_statements(
    files: list[UploadFile] = File(..., description="One or more PDF statements."),
    password: str | None = Form(None, description="Password for encrypted PDFs."),
    dry_run: bool = Form(False, description="Parse & preview without saving."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StatementImportResponse:
    """Parse (and optionally import) one or more PDF bank statements.

    With ``dry_run=true`` the statements are parsed, reconciled, and previewed
    but nothing is written — used for the review step before committing.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No files uploaded."
        )

    results: list[StatementFileResult] = []
    for upload in files:
        name = upload.filename or "statement.pdf"
        if not name.lower().endswith(".pdf"):
            results.append(
                StatementFileResult(
                    source_file=name, status="error", error="Only PDF files are supported."
                )
            )
            continue

        data = upload.file.read()
        if len(data) > MAX_FILE_BYTES:
            results.append(
                StatementFileResult(
                    source_file=name, status="error", error="File exceeds the 15 MB limit."
                )
            )
            continue

        results.append(
            import_statement(
                db,
                source=io.BytesIO(data),
                source_name=name,
                password=password,
                user_id=current_user.id,
                dry_run=dry_run,
            )
        )

    totals = {
        "parsed": sum(r.parsed for r in results),
        "created": sum(r.created for r in results),
        "duplicates": sum(r.duplicates for r in results),
        "needs_review": sum(r.needs_review for r in results),
        "errors": sum(1 for r in results if r.status == "error"),
    }
    # A freshly imported statement line may be the same event as an email alert
    # already on record; merge those cross-source pairs so nothing double-counts.
    if not dry_run:
        reconcile_email_statement_transactions(db, user_id=current_user.id)
    return StatementImportResponse(dry_run=dry_run, files=results, totals=totals)
