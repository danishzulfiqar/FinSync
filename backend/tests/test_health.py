"""Health endpoint tests (no database required)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_ok(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_root(client: TestClient) -> None:
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json()["name"] == "FinSync"
