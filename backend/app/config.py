"""Application configuration loaded from environment variables and providers.yaml."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Environment-driven settings. See backend/.env.example for documentation."""

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_env: str = "development"
    log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"

    # Database
    database_url: str = "postgresql+psycopg://finsync:finsync@localhost:5432/finsync"

    # CORS: comma-separated list of allowed frontend origins (e.g. the Vercel URL).
    cors_origins: str = ""

    # Auth / JWT
    jwt_secret_key: str = "change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # SMS webhook
    sms_webhook_signing_key: str = "change-me"
    sms_webhook_max_skew_seconds: int = 300
    hbl_sms_senders: str = ""
    # Dev only: append SMS mentioning HBL to this file (keep under gitignored secrets/).
    sms_debug_capture_file: str = ""

    # SMS gateway (android-sms-gateway Cloud mode, api.sms-gate.app)
    # Sync is on demand: the backend asks the cloud API to replay the phone's
    # inbox for a date range as batch webhooks to SMS_WEBHOOK_PUBLIC_URL.
    sms_cloud_api_url: str = "https://api.sms-gate.app/3rdparty/v1"
    sms_cloud_username: str = ""
    sms_cloud_password: str = ""
    # Optional; the first registered device is used when blank.
    sms_cloud_device_id: str = ""
    # Public HTTPS base URL of this backend (ngrok URL locally, Render in prod).
    sms_webhook_public_url: str = ""
    sms_cloud_timeout_seconds: float = 20.0
    # Look-back window (days) when there is no prior HBL transaction.
    sms_sync_default_lookback_days: int = 30

    # Gmail
    gmail_client_secret_file: str = "secrets/gmail_client_secret.json"
    gmail_token_file: str = "secrets/gmail_token.json"
    gmail_scopes: str = "https://www.googleapis.com/auth/gmail.readonly"
    # Web OAuth client credentials (preferred on hosts with no secret file / disk).
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    # Backend callback Google redirects to after consent (must match the Cloud client).
    gmail_oauth_redirect_uri: str = "http://localhost:8000/api/v1/sync/gmail/callback"
    # Where the backend sends the browser back to once authorization completes.
    frontend_url: str = ""

    # Providers config
    providers_config_file: str = "providers.yaml"

    # Deduplication
    dedup_time_window_seconds: int = 180
    dedup_probable_enabled: bool = True

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        """Coerce managed-Postgres URLs (postgres://, postgresql://) to the psycopg driver."""
        if value.startswith("postgres://"):
            return "postgresql+psycopg://" + value[len("postgres://"):]
        if value.startswith("postgresql://"):
            return "postgresql+psycopg://" + value[len("postgresql://"):]
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        """Allowed CORS origins: configured production origins plus local dev."""
        origins = [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]
        for dev in ("http://localhost:5173", "http://127.0.0.1:5173"):
            if dev not in origins:
                origins.append(dev)
        return origins

    @property
    def gmail_scope_list(self) -> list[str]:
        return [s.strip() for s in self.gmail_scopes.split(",") if s.strip()]

    @property
    def frontend_base_url(self) -> str:
        """Where to return the browser after Gmail OAuth: explicit, else first CORS origin, else local dev."""
        if self.frontend_url.strip():
            return self.frontend_url.strip().rstrip("/")
        for origin in self.cors_origin_list:
            if origin.startswith("http"):
                return origin.rstrip("/")
        return "http://localhost:5173"

    @property
    def hbl_sms_sender_list(self) -> list[str]:
        return [s.strip() for s in self.hbl_sms_senders.split(",") if s.strip()]

    @property
    def sms_cloud_configured(self) -> bool:
        return bool(
            self.sms_cloud_username.strip()
            and self.sms_cloud_password
            and self.sms_webhook_public_url.strip()
        )

    def resolve_path(self, value: str) -> Path:
        """Resolve a config path relative to the backend directory if not absolute."""
        p = Path(value)
        return p if p.is_absolute() else BACKEND_DIR / p


@lru_cache
def get_settings() -> Settings:
    return Settings()


# ---------------------------------------------------------------------------
# providers.yaml loading
# ---------------------------------------------------------------------------


class ProviderConfig:
    """Compiled matching rules for a single provider."""

    def __init__(self, key: str, raw: dict[str, Any]) -> None:
        self.key = key
        self.display_name: str = raw.get("display_name", key.upper())
        self.default_currency: str = raw.get("default_currency", "PKR")
        self.email_senders: list[str] = [s.lower() for s in raw.get("email_senders", [])]
        self.sms_senders: list[str] = [s.lower() for s in raw.get("sms_senders", [])]
        self._email_subject = _compile(raw.get("email_subject_patterns", []))
        self._email_body = _compile(raw.get("email_body_patterns", []))
        self._sms_body = _compile(raw.get("sms_body_patterns", []))

    def matches_email_sender(self, sender: str) -> bool:
        s = (sender or "").lower()
        return any(cand in s for cand in self.email_senders)

    def matches_sms_sender(self, sender: str) -> bool:
        s = (sender or "").lower()
        return any(cand in s for cand in self.sms_senders)

    def matches_email_content(self, subject: str, body: str) -> bool:
        if not self._email_subject and not self._email_body:
            return True
        subj_ok = any(p.search(subject or "") for p in self._email_subject)
        body_ok = any(p.search(body or "") for p in self._email_body)
        return subj_ok or body_ok

    def matches_sms_body(self, body: str) -> bool:
        if not self._sms_body:
            return True
        return any(p.search(body or "") for p in self._sms_body)


class CategoryRule:
    def __init__(self, match: str, category: str) -> None:
        self.match = match.lower()
        self.category = category


class ProvidersFile:
    """Parsed representation of providers.yaml."""

    def __init__(self, raw: dict[str, Any]) -> None:
        self.providers: dict[str, ProviderConfig] = {
            key: ProviderConfig(key, cfg) for key, cfg in (raw.get("providers") or {}).items()
        }
        cat = raw.get("categorization") or {}
        self.default_category: str = cat.get("default_category", "Other")
        self.category_rules: list[CategoryRule] = [
            CategoryRule(r["match"], r["category"]) for r in (cat.get("rules") or [])
        ]

    def provider(self, key: str) -> ProviderConfig | None:
        return self.providers.get(key.lower())


def _compile(patterns: list[str]) -> list[re.Pattern[str]]:
    compiled: list[re.Pattern[str]] = []
    for pat in patterns:
        try:
            compiled.append(re.compile(pat, re.IGNORECASE))
        except re.error:
            # Skip invalid placeholder patterns rather than crashing at startup.
            continue
    return compiled


@lru_cache
def get_providers_config() -> ProvidersFile:
    settings = get_settings()
    path = settings.resolve_path(settings.providers_config_file)
    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    return ProvidersFile(raw)
