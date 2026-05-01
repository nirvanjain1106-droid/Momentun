from app.config import settings  # noqa: F401
# D53: Alembic CI/CD contract — alembic upgrade head is the ONLY supported
# migration path. Manual re-runs on an already-migrated DB require:
#   alembic stamp head
# Pipeline retries must check `alembic current` before running upgrade.
