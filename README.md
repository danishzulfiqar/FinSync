# FinSync — Personal Finance Transaction Ingestion

Unified, private, self-hosted ingestion of your own bank/wallet transactions
from **Allied Bank (email)**, **HBL (transfer email + card SMS)**, and
**NayaPay (email)** into a single normalized PostgreSQL database — with
deduplication, categorization, analytics, and CSV export.

> **Authorized access only.** FinSync uses the official Gmail API (read-only
> OAuth) for your own inbox and the open-source Android SMS Gateway to forward
> your own incoming SMS. It never scrapes banking apps, never reverse-engineers
> private APIs, and never asks for passwords, OTPs, PINs, CVVs, or card numbers.

---

## Architecture

```
   ABL email ─┐
HBL transfer  │
     email ───┤        ┌─ Gmail API (OAuth read-only) ─┐
              ├─────────┤                               ├──► Ingestion Pipeline
HBL card SMS ─┤        └─ Android SMS Gateway webhook ──┘        │
              │                                                  ▼
NayaPay email┘                                    Normalization → Fingerprint
                                                          → Deduplication
                                                                 │
                                                                 ▼
                                                          PostgreSQL
                                                     ┌──────┼──────┐
                                                 Dashboard  CSV  Analytics
```

Data flow per channel:

| Provider | Transfers | Card/Purchases |
|----------|-----------|----------------|
| ABL      | Email → Gmail API | — |
| HBL      | Email → Gmail API | SMS → Android SMS Gateway → webhook |
| NayaPay  | Email → Gmail API | — |

Everything funnels into one **Transaction** table. Multiple sources (email +
SMS + future statement + future official API) attach to the same transaction via
`transaction_sources` without duplicating the financial record.

---

## Project structure

```
FinSync/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + router wiring
│   │   ├── config.py            # env settings + providers.yaml loader
│   │   ├── database.py          # SQLAlchemy engine/session/Base
│   │   ├── models/              # Transaction, TransactionSource, GmailSyncState, enums
│   │   ├── schemas/             # Pydantic: ParsedTransaction, API I/O, webhook envelope
│   │   ├── api/routes/          # health, webhooks, sync, transactions, accounts,
│   │   │                        #   providers, analytics, export
│   │   ├── services/
│   │   │   ├── gmail/           # OAuth (read-only) + Gmail client
│   │   │   ├── sms/             # HMAC signature verify + provider identifier
│   │   │   ├── ingestion/       # parse → fingerprint → dedup → persist pipeline
│   │   │   ├── reconciliation/  # duplicate detection / states
│   │   │   └── categorization/  # deterministic, config-driven rules
│   │   ├── parsers/             # hbl_email, hbl_sms, abl_email, nayapay_email (+ base)
│   │   └── utils/               # fingerprint, amount parsing
│   ├── alembic/                 # migrations (0001_initial)
│   ├── tests/                   # health, signature, fingerprint, HBL SMS, email stubs
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── providers.yaml           # sender/pattern config + category rules (edit this)
│   └── .env.example
├── frontend/                    # React + Vite (Phase 5 placeholder)
├── android/documentation/       # SMS Gateway setup guide
├── scripts/                     # gmail_authorize.py, send_test_sms.py
├── docker-compose.yml           # PostgreSQL + backend
├── .gitignore
└── README.md
```

---

## Quick start (Mac)

### Option A — Docker (recommended)

```bash
# 1. Configure environment
cp backend/.env.example backend/.env
# edit backend/.env: set SMS_WEBHOOK_SIGNING_KEY (and Gmail paths if using email)

# 2. Bring up PostgreSQL + backend (runs migrations automatically)
docker compose up -d --build

# 3. Verify
curl http://localhost:8000/health
#   → {"status":"ok"}
curl http://localhost:8000/health/db
#   → {"status":"ok","database":"reachable"}
```

Interactive API docs: http://localhost:8000/docs

### Option B — Local Python + Dockerized DB

```bash
# Start just the database
docker compose up -d db

cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env    # ensure DATABASE_URL points at localhost:5432

alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Run tests

```bash
cd backend
pytest -q      # health, HMAC signature, fingerprint dedup, HBL SMS parser, email stubs
```

The parser/signature/fingerprint tests need **no database**.

---

## Environment variables

See `backend/.env.example` for the full annotated list. Key ones:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (compose overrides host to `db`) |
| `SMS_WEBHOOK_SIGNING_KEY` | HMAC key from the Android app (Settings → Webhooks → Signing Key) |
| `SMS_WEBHOOK_MAX_SKEW_SECONDS` | Reject webhook timestamps older/newer than this (default 300) |
| `HBL_SMS_SENDERS` | Optional comma-separated sender allowlist override for HBL SMS |
| `GMAIL_CLIENT_SECRET_FILE` | OAuth client secret (Desktop app) path |
| `GMAIL_TOKEN_FILE` | Where the OAuth refresh token is stored |
| `GMAIL_SCOPES` | `gmail.readonly` (minimum scope) |
| `PROVIDERS_CONFIG_FILE` | Path to `providers.yaml` |

Secrets live under `backend/secrets/` and `backend/.env`, both gitignored.

---

## Database schema

**`transactions`** — one row per deduplicated financial transaction:

| Column | Type | Notes |
|--------|------|-------|
| id | int PK | |
| provider | str | HBL / ABL / NayaPay |
| account_identifier | str? | masked, e.g. `****1234` |
| transaction_type | str | `credit` \| `debit` |
| amount | numeric(18,2) | |
| currency | str(3) | default PKR |
| transaction_datetime | timestamptz? | null if source omits |
| merchant / description / reference | str? | null where unavailable |
| balance_after | numeric? | if provided |
| category | str? | from deterministic rules |
| source_type | str | email/sms/statement/api/manual |
| source_message_id / source_message_hash | str? | provenance |
| raw_data | json? | non-sensitive parsed audit data |
| **fingerprint** | str **unique** | dedup identity |
| confidence | float | parser/reconciliation confidence |
| verified | bool | corroborated by statement/multi-source |
| created_at / updated_at | timestamptz | |

**`transaction_sources`** — evidence per channel (email + SMS + statement can
all point to one transaction):

`id, transaction_id→transactions, source_type, source_id, source_thread_id,
received_at, raw_hash` with unique `(source_type, source_id)` and unique
`raw_hash` (idempotency).

**`gmail_sync_state`** — incremental sync checkpoints:

`id, provider (unique), last_history_id, last_sync_at`.

Migrations are managed by Alembic (`alembic/versions/0001_initial.py`).

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| GET | `/health/db` | Readiness (DB connectivity) |
| POST | `/api/v1/webhooks/sms` | Android SMS Gateway webhook (HMAC-authenticated) |
| POST | `/api/v1/sync/gmail` | Trigger Gmail sync (dry-run preview until parsers implemented) |
| GET | `/api/v1/transactions` | List + filter + paginate |
| GET | `/api/v1/transactions/{id}` | Transaction detail with sources |
| GET | `/api/v1/accounts` | Distinct provider/account pairs |
| GET | `/api/v1/providers` | Configured providers + channels |
| GET | `/api/v1/analytics/summary` | Income/expenses/net + provider breakdown |
| GET | `/api/v1/analytics/monthly` | Monthly buckets |
| GET | `/api/v1/export/csv` | CSV export |

Filtering examples:

```
GET /api/v1/transactions?provider=HBL
GET /api/v1/transactions?type=debit
GET /api/v1/transactions?start_date=2026-01-01&end_date=2026-09-26
GET /api/v1/transactions?category=Transport&limit=100&offset=0
```

---

## Gmail OAuth setup (read-only)

1. In **Google Cloud Console**: create a project → enable the **Gmail API**.
2. Configure the OAuth consent screen (External, add your own Google account as a
   test user). Add scope `.../auth/gmail.readonly`.
3. Create an **OAuth client ID** of type **Desktop app**; download the JSON.
4. Save it to `backend/secrets/gmail_client_secret.json` (create the folder).
5. Authorize once:
   ```bash
   cd backend && source .venv/bin/activate
   python ../scripts/gmail_authorize.py
   ```
   A browser opens; consent with your account. The refresh token is stored at
   `backend/secrets/gmail_token.json` (gitignored, `chmod 600`).
6. Preview what would be ingested (safe, no writes yet):
   ```bash
   curl -X POST "http://localhost:8000/api/v1/sync/gmail?provider=hbl&dry_run=true"
   ```
   This lists `message_id / sender / subject / date / snippet` so you can confirm
   sender/subject patterns before enabling parsing.

Only `gmail.readonly` is requested. Your Gmail password is never handled.

---

## Android SMS Gateway setup

See **[android/documentation/SETUP.md](android/documentation/SETUP.md)** for the
full guide. Summary:

1. Install the [SMS Gateway APK](https://github.com/capcom6/android-sms-gateway/releases)
   on the phone with your HBL SIM; grant **RECEIVE_SMS**.
2. Enable **Local Server**, copy the **Signing Key** into
   `SMS_WEBHOOK_SIGNING_KEY`.
3. Expose the backend (ADB reverse for dev, or Cloudflare Tunnel/ngrok for
   HTTPS).
4. Register the webhook for `sms:received` → `.../api/v1/webhooks/sms`.
5. Test with `python scripts/send_test_sms.py --key "$SMS_WEBHOOK_SIGNING_KEY"`.

The webhook rejects any request without a valid HMAC signature.

---

## Security model

- **No secrets stored:** never passwords, OTPs, PINs, CVVs, or full card numbers.
- **Minimal SMS retention:** raw SMS text is not persisted; only normalized
  fields + a one-way hash for dedup. Unrelated SMS bodies are never logged.
- **Gmail:** read-only OAuth, minimum scope, refresh token stored locally with
  restricted permissions, never committed.
- **Webhook auth:** mandatory HMAC-SHA256 with timestamp anti-replay.
- **Database:** parameterized SQLAlchemy queries, unique fingerprint constraint,
  Alembic migrations.

---

## Deduplication

A robust `fingerprint` (provider + type + amount + currency + account_last4 +
reference + rounded time bucket) makes the same transaction collide across
channels. Ingestion states:

- `unique` → new transaction created
- `exact_duplicate` → same fingerprint; attach source only
- `probable_duplicate` → same money/time window; attach source, raise confidence
- `needs_review` → looks similar but conflicting reference → **keep both**, flag

Ingestion is idempotent: re-processing the same Gmail/SMS message is a no-op
(guarded by unique `source_id` and `raw_hash`).

---

## Development phases

- [x] **Phase 1 — Foundation:** FastAPI, PostgreSQL, SQLAlchemy, Alembic,
      models, health, transactions API, Docker, webhook + Gmail scaffolding.
- [ ] **Phase 2 — Gmail:** implement `hbl_email`, `abl_email`, `nayapay_email`
      parsers from your real samples; enable non-dry-run sync + incremental
      historyId checkpoints.
- [ ] **Phase 3 — Android SMS:** finalize HBL SMS patterns from real samples.
- [ ] **Phase 4 — Deduplication:** expand tests for cross-channel merges.
- [ ] **Phase 5 — Dashboard:** React + Vite frontend.
- [ ] **Phase 6 — Statements:** CSV/PDF importers + reconciliation.

---

## What I need from you before implementing provider parsers

The parsers are intentionally **stubs** (they return `None`) so nothing is
misclassified. To implement them I need **anonymized** real samples — redact
account numbers, names, and any codes; keep the structure/wording intact:

1. **HBL bank-transfer email** — 1–2 examples (sender address, subject line,
   body). Both a sent transfer and a received transfer if possible.
2. **HBL card SMS** — 2–3 examples (a purchase, a refund/credit, and one with a
   balance line if HBL includes it). Include the **sender ID** shown on the
   phone (e.g. `HBL`).
3. **ABL email** — 1–2 examples (credit and debit), with sender + subject.
4. **NayaPay email** — 1–2 examples (e.g. money received and money sent), with
   sender + subject.

For each, please also confirm:
- the **sender address / short code** as it actually appears,
- the **subject pattern** (for emails),
- how HBL/ABL/NayaPay indicate **credit vs debit** in wording,
- the **date/time format** used,
- whether a **reference/transaction ID** is present.

Fill the real senders/patterns into `backend/providers.yaml` (placeholders are
marked `REPLACE_WITH_...`). I'll then implement the parsers and their unit tests
using your anonymized examples.
