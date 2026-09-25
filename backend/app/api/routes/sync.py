"""Gmail sync endpoint — Phase 2 scaffolding.

Triggers an incremental Gmail sync. Since the provider email parsers are still
stubs (awaiting real anonymized samples), this endpoint currently:
  - verifies OAuth authorization,
  - reports what it WOULD process,
without persisting transactions. Once parsers are implemented, flip
``dry_run`` handling to run the full parse -> ingest pipeline.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config import get_providers_config
from app.database import get_db
from app.parsers import get_email_parser
from app.services.gmail.client import build_query, build_service, fetch_email, list_message_ids

router = APIRouter(tags=["sync"])


@router.post("/sync/gmail")
def sync_gmail(
    provider: str | None = Query(default=None, description="hbl | abl | nayapay; all if omitted"),
    start_date: str | None = Query(default=None, description="Gmail after: YYYY/MM/DD"),
    end_date: str | None = Query(default=None, description="Gmail before: YYYY/MM/DD"),
    max_results: int = Query(default=25, ge=1, le=500),
    dry_run: bool = Query(default=True),
    db: Session = Depends(get_db),
) -> dict:
    service = build_service()
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="Gmail not authorized. Run scripts/gmail_authorize.py first.",
        )

    providers = get_providers_config()
    keys = [provider.lower()] if provider else list(providers.providers.keys())

    summary: list[dict] = []
    for key in keys:
        cfg = providers.provider(key)
        if cfg is None or not cfg.email_senders:
            continue
        query = build_query(cfg.email_senders, after=start_date, before=end_date)
        ids = list_message_ids(service, query, max_results=max_results)

        parsed_count = 0
        preview: list[dict] = []
        parser = get_email_parser(key)
        for mid in ids:
            email = fetch_email(service, mid)
            preview.append(
                {
                    "message_id": email.message_id,
                    "sender": email.sender,
                    "subject": email.subject,
                    "date": email.received_at.isoformat() if email.received_at else None,
                    "snippet": (email.body or "")[:140],
                }
            )
            if parser is not None and not dry_run:
                # Parsers are stubs today; will return None until implemented.
                if parser.parse(email) is not None:
                    parsed_count += 1

        summary.append(
            {
                "provider": key,
                "query": query,
                "matched": len(ids),
                "parsed": parsed_count,
                "preview": preview,
            }
        )

    return {"status": "ok", "dry_run": dry_run, "providers": summary}
