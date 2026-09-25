"""CSV export endpoint."""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.transaction import Transaction

router = APIRouter(tags=["export"])

_COLUMNS = [
    "Date",
    "Provider",
    "Account",
    "Type",
    "Amount",
    "Currency",
    "Merchant",
    "Description",
    "Reference",
    "Source",
    "Verified",
    "Category",
]


@router.get("/export/csv")
def export_csv(
    provider: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    conditions = []
    if provider:
        conditions.append(Transaction.provider == provider)
    if type:
        conditions.append(Transaction.transaction_type == type)

    stmt = select(Transaction).options(selectinload(Transaction.sources))
    if conditions:
        stmt = stmt.where(*conditions)
    stmt = stmt.order_by(Transaction.transaction_datetime.desc().nullslast(), Transaction.id.desc())

    rows = db.execute(stmt).scalars().all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_COLUMNS)
    for t in rows:
        sources = ",".join(sorted({s.source_type for s in t.sources})) or t.source_type
        writer.writerow(
            [
                t.transaction_datetime.isoformat() if t.transaction_datetime else "",
                t.provider,
                t.account_identifier or "",
                t.transaction_type,
                f"{t.amount:.2f}",
                t.currency,
                t.merchant or "",
                t.description or "",
                t.reference or "",
                sources,
                "yes" if t.verified else "no",
                t.category or "",
            ]
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=finsync_transactions.csv"},
    )
