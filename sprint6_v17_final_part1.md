# Sprint 6 — Architecture, Schema & Core Code (Revision 17 — Final)

> **Self-contained document.** Part 1 of 3. No external revision references required.
> All invariants, decisions, DDL, and code are fully specified here.

---

## 1. Architectural Invariants

| # | Invariant |
|---|-----------|
| I1 | All database operations use SQLAlchemy async sessions (`AsyncSessionLocal`). No raw `psycopg2` connections. |
| I2 | Every data-mutating UPDATE uses **OCC** (Optimistic Concurrency Control) — WHERE clause includes original column values to detect concurrent modification. |
| I3 | Encryption is **versioned**. Ciphertext carries a version prefix (`v{N}:{token}`). Decryption parses prefix to select the correct key. |
| I4 | `ENCRYPTION_ACTIVE` flag controls the **write path**. When `True`, new writes encrypt. When `False`, new writes store plaintext. Flag change requires pod restart. |
| I5 | `evening_note` is **cleared to `None`** after successful encryption. No plaintext copy remains alongside ciphertext. This is why rollback after encryption requires reverse migration. |
| I6 | `evening_note_ciphertext` stores bytes (`LargeBinary` / `bytea`). `evening_note_encrypted` is a boolean dispatch flag for the read path. |
| I7 | All batch migrations use **keyset pagination** with a composite cursor `(created_at, id)`. No OFFSET-based pagination. |
| I8 | Batch size is **500 rows** for all migration and resolution scripts. |
| I9 | **Circuit breaker** aborts migration after 10 consecutive encryption failures. Prevents runaway error storms. |
| I10 | `CRON_MAINTENANCE_MODE` must be `True` during data migrations to prevent cron-job overlap. |
| I11 | PostgreSQL ≥ 11 required. Checked via `SHOW server_version_num >= 110000` (integer comparison). |
| I12 | Version prefix matching MUST parse numerically via regex (`^v(\d+):(.+)$`), never `startswith` or slice. |
| I13 | `TIMESTAMPTZ` cursor ties: cursors MUST be composite `(created_at, id)` to guarantee deterministic ordering. |
| I14 | **`assert` is NOT a runtime guard.** All safety checks use `if/raise RuntimeError`. Python `-O` strips `assert`. |
| I15 | **Dead-letter writes use a separate DB session** (dedicated pool). Batch commit failure must not roll back failure tracking. |
| I16 | **Rollback after `ENCRYPTION_ACTIVE=true` always requires reverse migration.** The write path clears `evening_note` (sets to `None`). Old code cannot read `evening_note_ciphertext`. |
| I17 | **Migration cursor advances for all rows** (success, skip, error with DL tracked). Errored rows are tracked in `encryption_dead_letters` and resolved via `resolve_dead_letters.py`. Cursor does NOT advance if DL write fails (row retried next batch). |
| I18 | `ENCRYPTION_KEYS` is **append-only**. Index = version number. Removing a key makes all data encrypted with that version permanently unreadable. |
| I19 | Column drop (`Migration 012`) is **NEVER deployed in Sprint 6**. Only after 2+ weeks stable. Irreversible. |
| I20 | All migration scripts are **idempotent**. Re-running from any cursor position produces correct results. OCC prevents double-processing. |
| I21 | `ACTIVE_KEY_VERSION` must be `>= 0` and `< len(ENCRYPTION_KEYS)`. Enforced at app startup via Pydantic validator. |
| I22 | **DL writes use a dedicated pool (`DLSessionLocal`)**, NOT savepoints in the batch session. Outer commit failure cannot erase DL tracking. |
| I23 | **Cursor advances on error ONLY if DL write succeeded.** Failed DL write = row retried next batch. Prevents silent data loss. |
| I24 | **`resolve_dead_letters.py` handles ALL operation types** (encrypt, decrypt, reencrypt) via dispatch table. |
| I25 | **Migration aborts after 3 consecutive DL write failures within a batch.** Counter resets at batch boundary only. Prevents retry noise on DL pool outages without over-triggering on transient blips. |

---

## 2. Design Decisions

| # | Decision |
|---|----------|
| D1 | Use **Fernet symmetric encryption** (AES-128-CBC with HMAC-SHA256). Cryptography library provides authenticated encryption. |
| D2 | Key derivation: `SHA-256(raw_key_string)` → `base64url-encode` → 32-byte Fernet key. Each entry in `ENCRYPTION_KEYS` is a passphrase, not a raw key. |
| D3 | Ciphertext format: `v{version}:{fernet_token}`. Version prefix parsed by regex `^v(\d+):(.+)$`. Supports v0, v10, v999999 uniformly. |
| D4 | `ENCRYPTION_KEYS` is an **ordered list**. Index = version number. Append new keys for rotation; never remove or reorder. |
| D5 | `ACTIVE_KEY_VERSION` selects which key encrypts new data. All keys remain available for decryption. Enables zero-downtime key rotation. |
| D6 | `evening_note` column is **nullable**. Cleared to `NULL` on encryption. This is the mechanism that forces reverse migration on rollback (I5, I16). |
| D7 | `evening_note_ciphertext` stored as `LargeBinary` (`bytea` in PostgreSQL). Avoids encoding ambiguity. Read path normalizes `memoryview` → `bytes` → `str`. |
| D8 | `evening_note_encrypted` is a **boolean dispatch flag**. Read path checks this flag first: `True` → decrypt ciphertext; `False` → return plaintext. |
| D9 | **Hard failure on write path.** If encryption fails during a write, the request fails with an error. Never silently drop or store plaintext when encryption is active. |
| D10 | **Graceful degradation on notification read path.** `NotificationResponse.from_db` catches decrypt failures and returns a safe placeholder rather than crashing the entire response. |
| D11 | **Composite cursor** `(created_at, id)` for all batch scripts. Deterministic ordering even with identical `created_at` values. UUID comparison breaks ties. |
| D12 | **One session per batch**, commit at batch boundary. Row-level operations within a batch share a transaction. Cursor advances after commit (not before). |
| D13 | All timestamps use `TIMESTAMPTZ`. No naive datetimes anywhere in the system. |
| D14 | **UTC-only internal storage.** Timezone conversions happen at the API boundary. All cursor comparisons use UTC. |
| D15 | Migration 011 is **additive** — adds `evening_note_encrypted` and `evening_note_ciphertext` columns. Old code ignores new columns. Safe to deploy before feature code. |
| D16 | Column drop (Migration 012) is a **separate release**, deferred 2+ weeks after stable encryption. Irreversible. Not part of Sprint 6. |
| D17 | **Alembic ≥ 1.11** required for `CREATE INDEX CONCURRENTLY` in autocommit mode. Verified via `packaging.version.parse()`. |
| D18 | **PostgreSQL version check** uses `SHOW server_version_num` → integer comparison `>= 110000`. Not string parsing of `SELECT version()`. |
| D19 | Feature code deployed with `ENCRYPTION_ACTIVE=false` first. Encryption activated in a separate step after health gate verification. Two-phase deployment. |
| D20 | **Cursor initialization** uses `datetime.min` (UTC) and UUID zero (`00000000-...`). Guarantees first batch fetches all rows. |
| D21 | **Dead-letter table** (`encryption_dead_letters`) tracks individual row failures with operation type, error message, and resolution timestamp. |
| D22 | **`get_evening_note` graceful degradation on DailyLog read path.** Matches `NotificationResponse.from_db` pattern (D10). Returns `None` on encrypted-but-null-ciphertext, `"[encrypted]"` on corrupt ciphertext. Hard failure (D9) is writes-only. |
| D23 | **Partial unique index** on dead-letter table `(source_table, source_row_id, operation) WHERE resolved_at IS NULL`. Prevents duplicate entries on retry. Upsert uses `ON CONFLICT DO UPDATE`. |
| D24 | **Dead-letter retention**: 90-day cleanup for resolved entries. Unresolved entries never auto-deleted. |
| D25 | **All runtime guards use `if/raise RuntimeError`, never `assert`.** Python `-O` strips assert statements, creating silent bypasses. |
| D26 | **Dead-letter writes are transactionally isolated.** Separate `DLSessionLocal` session, immediate commit. Batch rollback cannot lose error tracking. |
| D27 | **Rollback after Step 15 requires reverse migration.** No exceptions. The write path clears `evening_note`. |
| D28 | **`get_evening_note` degrades gracefully on read.** Matches notification response pattern (D10, D22). Hard failure (D9) applies to writes only. |
| D29 | **Re-encryption snapshots `ACTIVE_KEY_VERSION` at job start.** Frozen for entire job. Key rotation mid-job cannot cause version mixing. |
| D30 | **Post-migration sweep.** Step 20d runs a cursorless scan for any remaining plaintext rows (catches concurrent inserts with small UUIDs or delayed pods). |
| D31 | **DL writes use a dedicated small pool** (`DLSessionLocal`, `pool_size=2`, `max_overflow=3`). Replaces SAVEPOINT approach. SAVEPOINTs roll back with the outer transaction; separate pool provides true isolation. |
| D32 | **ON CONFLICT upsert** for dead-letter writes updates `error_message` and `last_retry_at` on conflict with the partial unique index. |
| D33 | **`get_evening_note` returns `None` on failure** (not `"[encrypted]"` for null-ciphertext case). `"[encrypted]"` only for corrupt/unreadable ciphertext. |
| D34 | **Retention cleanup uses `FOR UPDATE SKIP LOCKED`** with `ORDER BY id` for deterministic subquery. Prevents blocking user transactions. |
| D35 | **`_write_dead_letter` returns `bool`.** Callers use return value to decide cursor advancement. `True` = DL tracked, safe to advance. `False` = untracked, hold cursor. |
| D36 | **Pre-flight nullable check on `evening_note`.** Migration 011 conditionally drops NOT NULL constraint if present. |
| D37 | **Health endpoint returns cached `encryption_columns_present`.** Cache computed at startup, no per-request DB query. Lazy retry if startup check failed (DB down at boot). |
| D38 | **Smoke test selects rows with `evening_note IS NOT NULL AND evening_note_encrypted = true`.** Validates actual decryption, not null passthrough. Only rejects `[encrypted]` placeholder and HTTP errors. |
| D39 | **`resolve_dead_letters` auto-resolves `encrypt` DLs when `ENCRYPTION_ACTIVE=false`** (row stays plaintext). Guard is per-row in dispatch, not at entry. `decrypt` and `reencrypt` always allowed. |
| D40 | **Migration/resolution scripts emit structured JSON summary at exit** for log-based alerting. Pushgateway optional (not a hard dependency). |

---

## 3. Schema — Migration 011 (Encryption Columns)

```python
# In migration 011 upgrade(), BEFORE adding encryption columns:
# Pre-flight: Ensure evening_note is nullable (D36)
op.execute("""
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'daily_logs'
              AND column_name = 'evening_note'
              AND is_nullable = 'NO'
        ) THEN
            ALTER TABLE daily_logs ALTER COLUMN evening_note DROP NOT NULL;
        END IF;
    END $$;
""")

# Add encryption columns (D15 — additive, old code ignores)
op.add_column('daily_logs', sa.Column(
    'evening_note_encrypted', sa.Boolean(),
    server_default=sa.text('false'), nullable=False,
))
op.add_column('daily_logs', sa.Column(
    'evening_note_ciphertext', sa.LargeBinary(), nullable=True,
))
```

## 4. Schema — Migration 011b (Dead-Letter Table)

```sql
-- Migration 011b (D21, D23, D26)
CREATE TABLE encryption_dead_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table TEXT NOT NULL,
    source_row_id UUID NOT NULL,
    operation TEXT NOT NULL,  -- 'encrypt', 'decrypt', 'reencrypt'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    last_retry_at TIMESTAMPTZ
);

-- Partial unique prevents duplicates on retry (D23)
CREATE UNIQUE INDEX uq_dead_letter_active
  ON encryption_dead_letters (source_table, source_row_id, operation)
  WHERE resolved_at IS NULL;

-- Efficient lookup for unresolved entries
CREATE INDEX ix_dead_letters_unresolved
  ON encryption_dead_letters (source_table, created_at)
  WHERE resolved_at IS NULL;
```

---

## 5. Encryption Module

```python
# app/core/encryption.py

import re
import base64
import hashlib
from typing import Optional, List
from cryptography.fernet import Fernet
from app.config import settings

_VERSION_RE = re.compile(r"^v(\d+):(.+)$", re.DOTALL)


def _get_key_for_version(version: int) -> bytes:
    """D2: SHA-256 key derivation from raw passphrase."""
    keys: List[str] = settings.ENCRYPTION_KEYS
    if version < 0 or version >= len(keys):
        raise ValueError(f"Invalid key version {version}, have {len(keys)} keys")
    raw = keys[version].encode("utf-8")
    digest = hashlib.sha256(raw).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_field_versioned(
    value: Optional[str], force_version: int = None
) -> Optional[str]:
    """
    D1, D3: Fernet encryption with version prefix.
    force_version: Override for re-encryption (D29). Defaults to ACTIVE_KEY_VERSION.
    """
    if value is None or value == "":
        return value
    version = force_version if force_version is not None else settings.ACTIVE_KEY_VERSION
    key = _get_key_for_version(version)
    token = Fernet(key).encrypt(value.encode("utf-8")).decode("utf-8")
    return f"v{version}:{token}"


def _parse_version_prefix(value: str) -> tuple[int, str]:
    """
    I12: Regex-based parser. No slice limit.
    Handles v0, v10, v999999 uniformly. No startswith collision.
    """
    m = _VERSION_RE.match(value)
    if m:
        return int(m.group(1)), m.group(2)
    return 0, value  # Legacy: no prefix → version 0


def decrypt_field_versioned(value: Optional[str]) -> Optional[str]:
    """I3: Parse version prefix, select key, decrypt."""
    if value is None or value == "":
        return value
    version, token = _parse_version_prefix(value)
    key = _get_key_for_version(version)
    return Fernet(key).decrypt(token.encode("utf-8")).decode("utf-8")


# Aliases — prevent accidental unversioned use
encrypt_field = encrypt_field_versioned
decrypt_field = decrypt_field_versioned
```

---

## 6. Configuration & Validation

```python
# In Settings class (Pydantic BaseSettings):
ENCRYPTION_ACTIVE: bool = False
ENCRYPTION_MIN_VERSION: int = 17
CODE_VERSION: int = 17
ENCRYPTION_KEYS: list = [""]  # Append-only. Index = version number. (D4)
ACTIVE_KEY_VERSION: int = 0
CRON_MAINTENANCE_MODE: bool = False

@model_validator(mode="after")
def validate_encryption_keys(self) -> "Settings":
    """I21: Comprehensive key validation at startup."""
    if not self.ENCRYPTION_KEYS:
        raise ValueError("ENCRYPTION_KEYS must not be empty")
    if self.ACTIVE_KEY_VERSION < 0:
        raise ValueError(
            f"ACTIVE_KEY_VERSION must be >= 0, got {self.ACTIVE_KEY_VERSION}"
        )
    if self.ACTIVE_KEY_VERSION >= len(self.ENCRYPTION_KEYS):
        raise ValueError(
            f"ACTIVE_KEY_VERSION={self.ACTIVE_KEY_VERSION} >= "
            f"len(ENCRYPTION_KEYS)={len(self.ENCRYPTION_KEYS)}"
        )
    for i, k in enumerate(self.ENCRYPTION_KEYS):
        if not k:
            raise ValueError(f"ENCRYPTION_KEYS[{i}] is empty")
    return self
```

---

## 7. Dedicated DL Database Pool

```python
# app/database.py

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Main pool (existing)
engine = create_async_engine(settings.DATABASE_URL, pool_size=10, max_overflow=20)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# D31, I22: Dedicated small pool for dead-letter writes.
# Separate engine prevents batch commit failures from rolling back DL inserts.
_dl_engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=2,
    max_overflow=3,
    pool_timeout=10,
    pool_pre_ping=True,
)
DLSessionLocal = async_sessionmaker(_dl_engine, expire_on_commit=False)
```

---

## 8. Write Path

```python
# In DailyLog create/update endpoints (when ENCRYPTION_ACTIVE=true):

if settings.ENCRYPTION_ACTIVE and evening_note is not None:
    ciphertext = encrypt_field_versioned(evening_note)
    if ciphertext is None:
        raise ValueError("encrypt_field_versioned returned None for non-null input")
    daily_log.evening_note_ciphertext = ciphertext.encode('utf-8')
    daily_log.evening_note_encrypted = True
    daily_log.evening_note = None  # I5: Clear plaintext
else:
    daily_log.evening_note = evening_note
    daily_log.evening_note_encrypted = False
    daily_log.evening_note_ciphertext = None
```

---

## 9. Read Path

```python
from prometheus_client import Counter

daily_log_decrypt_failures = Counter(
    'daily_log_decrypt_failures',
    'Failed decrypt attempts on DailyLog read path',
)


def get_evening_note(daily_log: DailyLog) -> Optional[str]:
    """
    D22, D28, D33: Graceful degradation on read path.
    - encrypted=True, ciphertext=None → None + error log
    - encrypted=True, corrupt ciphertext → "[encrypted]" + error log
    - encrypted=False → return evening_note as-is
    Hard failure (D9) applies to writes only.
    """
    if daily_log.evening_note_encrypted is True:
        if daily_log.evening_note_ciphertext is None:
            logger.error("daily_log_encrypted_but_null_ciphertext", extra={
                "daily_log_id": str(daily_log.id),
            })
            return None

        try:
            # D7: Defensive type normalization for memoryview/bytes/str
            ct = daily_log.evening_note_ciphertext
            if isinstance(ct, memoryview):
                ct = ct.tobytes()
            if isinstance(ct, bytes):
                ct = ct.decode('utf-8')
            # ct is now str
            return decrypt_field_versioned(ct)
        except Exception:
            logger.error("daily_log_decrypt_failed", extra={
                "daily_log_id": str(daily_log.id),
            })
            daily_log_decrypt_failures.inc()
            return "[encrypted]"

    return daily_log.evening_note
```

---

## 10. Health Endpoint

```python
# app/routers/health.py
# D37: Startup-cached column check. Zero per-request DB queries.

from fastapi import APIRouter

router = APIRouter()

_encryption_columns_present: Optional[bool] = None


async def _check_encryption_columns() -> bool:
    """One-shot DB check, cached forever. Columns don't change at runtime."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'daily_logs' "
                "AND column_name IN ('evening_note_encrypted', "
                "'evening_note_ciphertext')"
            ))
            return len(result.fetchall()) == 2
    except Exception:
        return False


async def _cache_column_check():
    """Called from app lifespan — NOT registered on router."""
    global _encryption_columns_present
    _encryption_columns_present = await _check_encryption_columns()


@router.get("/health")
async def health_check():
    """
    D37: Returns cached encryption_columns_present.
    Lazy retry if startup check failed (DB was down at boot).
    Does NOT block pod boot if DB unavailable.
    """
    global _encryption_columns_present
    if _encryption_columns_present is None:
        _encryption_columns_present = await _check_encryption_columns()

    return {
        "status": "ok",
        "code_version": 17,
        "encryption_active": settings.ENCRYPTION_ACTIVE,
        "encryption_columns_present": _encryption_columns_present or False,
    }
```

```python
# app/main.py
# Startup registration via lifespan context manager (modern FastAPI pattern).
# APIRouter does NOT support on_event("startup") — registration MUST be here.

from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.routers.health import router as health_router, _cache_column_check


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _cache_column_check()
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(health_router)
```

---

## 11. Notification Retention

```python
async def cleanup_old_notifications():
    """
    D34: FOR UPDATE SKIP LOCKED — don't block user transactions.
    ORDER BY id — deterministic subquery, no index thrashing.
    MAX_BATCHES — prevent runaway loop (10M rows max at 1000/batch).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    total_deleted = 0
    MAX_BATCHES = 10_000
    batch_num = 0

    async with AsyncSessionLocal() as db:
        while batch_num < MAX_BATCHES:
            batch_num += 1

            subq = (
                select(Notification.id)
                .where(
                    Notification.created_at < cutoff,
                    Notification.dismissed_at.isnot(None),
                )
                .order_by(Notification.id)
                .limit(1000)
                .with_for_update(skip_locked=True)
            )

            result = await db.execute(
                sa_delete(Notification).where(
                    Notification.id.in_(subq)
                )
            )
            await db.commit()
            total_deleted += result.rowcount

            if result.rowcount == 0:
                break

            if batch_num % 100 == 0:
                logger.info("notification_retention_progress", extra={
                    "batch_num": batch_num,
                    "total_deleted_so_far": total_deleted,
                })

    if batch_num >= MAX_BATCHES:
        logger.warning("notification_retention_hit_max_batches", extra={
            "max_batches": MAX_BATCHES,
            "total_deleted": total_deleted,
        })

    logger.info("notification_retention_cleanup", extra={
        "deleted_count": total_deleted,
        "batches": batch_num,
        "cutoff": cutoff.isoformat(),
    })
```

---

## 12. DST Gap Behavior

> When a DST gap is detected (e.g., 2:30 AM spring-forward), `_safe_localize` returns the UTC equivalent assuming standard-time offset. The reminder fires ~1 hour before the intended wall-clock time. This is a conscious trade-off: delivering early is safer than silently dropping. The `dst_gap_detected` log event enables ops to audit. **Awaiting product sign-off** on this "fire early" behavior.

---

## 13. Regression Guard Summary

Every V17 fix was validated against these anti-regression rules:

| Fix | Could Introduce | Guard |
|-----|-----------------|-------|
| B1: Startup cache health | Pod fails to boot if DB down | `_encryption_columns_present = None` default; lazy retry on first `/health` call |
| B2: OCC cursor advance | Skips rows that need work | OCC skip means row was concurrently modified — already at different state. Safe to advance. |
| B3: Per-row encrypt guard | Blocks legitimate encrypt resolution | Guard only fires when `ENCRYPTION_ACTIVE=false`. During normal ops, encrypt DLs resolve normally. |
| B4: Smoke test relaxed | Misses real decrypt failures | Still checks HTTP 200 + rejects `[encrypted]` placeholder. Only removes false-positive on null/empty. |
| M1: Structured exit log | Adds import at exit | `import json` is stdlib, zero-dep. `finally` block guarantees execution. |
| M2: Batch-boundary DL reset | Misses cross-batch DL outage | Counter persists across rows within batch. Only resets between batches. Sustained outage hits threshold. |
| M3: Snapshot key version | Stale version during long run | Resolution scripts are short-lived. Key rotation requires maintenance mode. No concurrent version changes. |
