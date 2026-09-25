"""Email parser stub tests: they must return None until implemented."""

from __future__ import annotations

from datetime import datetime, timezone

from app.parsers.abl_email import AblEmailParser
from app.parsers.base import EmailMessage
from app.parsers.hbl_email import HblEmailParser
from app.parsers.nayapay_email import NayapayEmailParser


def _email() -> EmailMessage:
    return EmailMessage(
        message_id="e1",
        thread_id="t1",
        sender="alerts@example.com",
        subject="Notification",
        body="Some content",
        received_at=datetime(2026, 9, 25, tzinfo=timezone.utc),
    )


def test_hbl_email_stub_returns_none() -> None:
    assert HblEmailParser().parse(_email()) is None


def test_abl_email_stub_returns_none() -> None:
    assert AblEmailParser().parse(_email()) is None


def test_nayapay_email_stub_returns_none() -> None:
    assert NayapayEmailParser().parse(_email()) is None
