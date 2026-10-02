#!/bin/sh
# Container entrypoint: apply migrations, then start the API.
# Honors $PORT (Render injects it); defaults to 8000 for local/compose/Fly.
set -e

alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
