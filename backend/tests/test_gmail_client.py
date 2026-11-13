"""Gmail batch fetching + quota limiter, against an in-memory fake service."""

from __future__ import annotations

import base64

import httplib2
import pytest
from googleapiclient.errors import HttpError

from app.services.gmail import client
from app.services.gmail.client import (
    UNITS_MESSAGES_GET_FULL,
    QuotaLimiter,
    fetch_emails,
)


def _http_error(status: int, content: bytes = b"") -> HttpError:
    return HttpError(httplib2.Response({"status": str(status)}), content)


def _message(mid: str) -> dict:
    body = base64.urlsafe_b64encode(f"body of {mid}".encode()).decode()
    return {
        "id": mid,
        "threadId": f"t-{mid}",
        "payload": {
            "mimeType": "text/plain",
            "headers": [{"name": "Subject", "value": f"subject {mid}"}],
            "body": {"data": body},
        },
    }


class _Get:
    def __init__(self, mid: str) -> None:
        self.mid = mid


class _Batch:
    def __init__(self, service: "FakeGmail", callback) -> None:
        self._service = service
        self._callback = callback
        self._requests: list[tuple[str, _Get]] = []

    def add(self, request: _Get, request_id: str) -> None:
        assert request_id not in {rid for rid, _ in self._requests}, "duplicate request_id"
        self._requests.append((request_id, request))

    def execute(self) -> None:
        self._service.batches.append([rid for rid, _ in self._requests])
        if self._service.outer_failures:
            raise self._service.outer_failures.pop(0)
        for rid, request in self._requests:
            outcomes = self._service.script.get(request.mid, [])
            outcome = outcomes.pop(0) if outcomes else _message(request.mid)
            if isinstance(outcome, HttpError):
                self._callback(rid, None, outcome)
            else:
                self._callback(rid, outcome, None)


class FakeGmail:
    """Scripted Gmail service: ``script[mid]`` lists per-attempt outcomes."""

    def __init__(self, script: dict | None = None, outer_failures: list | None = None) -> None:
        self.script = script or {}
        self.outer_failures = outer_failures or []
        self.batches: list[list[str]] = []

    def users(self):
        return self

    def messages(self):
        return self

    def get(self, *, userId: str, id: str, format: str) -> _Get:
        assert (userId, format) == ("me", "full")
        return _Get(id)

    def new_batch_http_request(self, callback):
        return _Batch(self, callback)


@pytest.fixture(autouse=True)
def _no_backoff(monkeypatch):
    monkeypatch.setattr(client, "_backoff_seconds", lambda attempt: 0.0)


def _fetch(service, ids, **kwargs):
    kwargs.setdefault("limiter", QuotaLimiter(10**9))
    return list(fetch_emails(service, ids, **kwargs))


def test_batches_by_size_and_preserves_order():
    service = FakeGmail()
    emails = _fetch(service, ["a", "b", "c", "d", "e"], batch_size=2)

    assert [e.message_id for e in emails] == ["a", "b", "c", "d", "e"]
    assert service.batches == [["a", "b"], ["c", "d"], ["e"]]
    assert emails[0].subject == "subject a"
    assert emails[0].body == "body of a"
    assert emails[0].thread_id == "t-a"


def test_duplicate_ids_are_fetched_once():
    service = FakeGmail()
    emails = _fetch(service, ["a", "b", "a"], batch_size=10)

    assert [e.message_id for e in emails] == ["a", "b"]
    assert service.batches == [["a", "b"]]


def test_rate_limited_messages_are_retried_alone():
    service = FakeGmail(
        script={
            "b": [_http_error(429)],
            "c": [_http_error(403, b'{"reason": "userRateLimitExceeded"}')],
        }
    )
    emails = _fetch(service, ["a", "b", "c"], batch_size=10)

    assert [e.message_id for e in emails] == ["a", "b", "c"]
    assert service.batches == [["a", "b", "c"], ["b", "c"]]


def test_deleted_messages_are_skipped():
    service = FakeGmail(script={"b": [_http_error(404)]})
    emails = _fetch(service, ["a", "b", "c"], batch_size=10)

    assert [e.message_id for e in emails] == ["a", "c"]
    assert service.batches == [["a", "b", "c"]]


def test_failed_outer_batch_request_is_retried():
    service = FakeGmail(outer_failures=[_http_error(503)])
    emails = _fetch(service, ["a", "b"], batch_size=10)

    assert [e.message_id for e in emails] == ["a", "b"]
    assert service.batches == [["a", "b"], ["a", "b"]]


def test_non_retryable_error_is_raised():
    service = FakeGmail(script={"b": [_http_error(400)]})
    with pytest.raises(HttpError) as exc:
        _fetch(service, ["a", "b"], batch_size=10)
    assert exc.value.resp.status == 400


def test_plain_403_is_not_treated_as_rate_limit():
    service = FakeGmail(script={"a": [_http_error(403, b'{"reason": "forbidden"}')]})
    with pytest.raises(HttpError):
        _fetch(service, ["a"], batch_size=10)


def test_gives_up_after_max_retries():
    service = FakeGmail(script={"a": [_http_error(429)] * 3})
    with pytest.raises(HttpError) as exc:
        _fetch(service, ["a"], batch_size=10, max_retries=2)
    assert exc.value.resp.status == 429
    assert len(service.batches) == 3


def test_batch_size_is_clamped_to_quota_budget():
    service = FakeGmail()
    limiter = QuotaLimiter(UNITS_MESSAGES_GET_FULL * 2)  # room for 2 messages/minute
    clock = {"t": 0.0}
    limiter._clock = lambda: clock["t"]
    limiter._sleep = lambda s: clock.__setitem__("t", clock["t"] + s)

    emails = _fetch(service, ["a", "b", "c"], batch_size=50, limiter=limiter)

    assert [e.message_id for e in emails] == ["a", "b", "c"]
    assert service.batches == [["a", "b"], ["c"]]
    assert clock["t"] == pytest.approx(60.0)  # second batch waited for the window


class _FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def test_limiter_allows_bursts_within_budget():
    clock = _FakeClock()
    limiter = QuotaLimiter(100, clock=clock, sleep=clock.sleep)
    limiter.acquire(60)
    limiter.acquire(40)
    assert clock.sleeps == []


def test_limiter_waits_for_oldest_spend_to_expire():
    clock = _FakeClock()
    limiter = QuotaLimiter(100, clock=clock, sleep=clock.sleep)
    limiter.acquire(60)
    clock.now = 20.0
    limiter.acquire(30)
    limiter.acquire(30)  # 120 > 100: must wait until t=60 when the first 60 expires
    assert clock.sleeps == [pytest.approx(40.0)]
    assert clock.now == pytest.approx(60.0)


def test_limiter_rejects_requests_larger_than_budget():
    limiter = QuotaLimiter(50)
    with pytest.raises(ValueError, match="GMAIL_QUOTA_UNITS_PER_MINUTE"):
        limiter.acquire(60)


def test_limiter_requires_positive_budget():
    with pytest.raises(ValueError):
        QuotaLimiter(0)
