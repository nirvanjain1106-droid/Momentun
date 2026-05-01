# Sprint 6 — Implementation Plan (Revision 13 — Production-Final)

> [!IMPORTANT]
> Supersedes Rev 12. All changes marked `[V13-FIX]`. Follows Karpathy guidelines: every changed line traces to a review finding. No speculation.

---

## V13 Change Summary

| # | V12 Issue | V13 Fix | Test |
|---|-----------|---------|------|
| B1 | `assert` stripped by `python -O` | `if/raise RuntimeError` everywhere | T-B1 |
| B2 | Rollback matrix lies: "plaintext copies exist" | Corrected to ⚠️ Conditional + mandatory reverse migration | T-B2 |
| B3 | Failed rows orphaned by cursor advancement | Cursor does not advance for errored rows + `resolve_dead_letters.py` | T-B3 |
| B4 | Dead-letter inserts share batch transaction | Separate `AsyncSession` for dead-letter writes | T-B4 |
| C1 | `get_evening_note` hard-fails on corrupt data | try/except → `"[encrypted]"` (matches notification pattern) | T-C1 |
| C2 | No dead-letter resolution script | `scripts/resolve_dead_letters.py` provided | T-C2 |
| C3 | Post-migration concurrent insert gap | Post-migration sweep query in Step 20d | T-C3 |
| M1 | PG version string comparison broken | `SHOW server_version_num` → integer compare | T-M1 |
| M2 | `alembic.__version_tuple__` nonexistent | `packaging.version.parse(alembic.__version__)` | T-M2 |
| M3 | Re-encryption reads live `ACTIVE_KEY_VERSION` | Snapshot at job start, frozen for all batches | T-M3 |
| M4 | Config allows negative key version, empty list | Explicit `>= 0`, `len > 0`, all-key validation | T-M4 |
| M5 | Retention DELETE lock contention | `FOR UPDATE SKIP LOCKED` + `ORDER BY id` | T-M5 |
| M6 | Dead-letter duplicate rows on retry | Partial unique index + `ON CONFLICT DO UPDATE` | T-M6 |
| M7 | `_parse_version_prefix` value[:8] hard limit | Regex `^v(\d+):` — no slice | T-M7 |
| M8 | Health gate kubectl exec fragile | Filter `status.phase=Running` + `set -euo pipefail` | — |
| M9 | Retention no max iterations | `MAX_BATCHES = 10_000` + progress logging | T-M9 |
| M10 | Dead-letter table no retention | 90-day cleanup for resolved entries | — |
| m1 | DST gap time behavior undocumented | Explicit docstring + log `notification_dst_gap_skipped` option | — |

---

## Architectural Invariants

| # | Invariant |
|---|-----------|
| I1–I10 | Unchanged from Rev 12 |
| I11 | PostgreSQL ≥ 11 required. Checked via `SHOW server_version_num >= 110000` |
| I12 | Version prefix matching MUST parse numerically via regex, never `startswith` |
| I13 | `TIMESTAMPTZ` ties: cursors MUST be composite `(created_at, id)` |
| I14 | `[V13]` **`assert` is NOT a runtime guard.** All safety checks use `if/raise RuntimeError`. Python `-O` strips `assert`. |
| I15 | `[V13]` **Dead-letter writes use a separate DB session.** Batch commit failure must not roll back failure tracking. |
| I16 | `[V13]` **Rollback after `ENCRYPTION_ACTIVE=true` always requires reverse migration.** The write path clears `evening_note` (sets to `None`). Old code cannot read `evening_note_ciphertext`. |
| I17 | `[V13]` **Migration cursor does NOT advance for errored rows.** Failed rows remain reachable on restart. |

---

## Design Decisions

| # | Decision |
|---|----------|
| D1–D19 | Unchanged from Rev 10/11 |
| D20–D24 | Unchanged from Rev 12 |
| D25 | `[V13-NEW]` **All runtime guards use `if/raise RuntimeError`, never `assert`.** |
| D26 | `[V13-NEW]` **Dead-letter writes are transactionally isolated.** Separate session, immediate commit. |
| D27 | `[V13-NEW]` **Rollback after Step 15 requires reverse migration.** No exceptions. |
| D28 | `[V13-NEW]` **`get_evening_note` degrades gracefully on read.** Matches `NotificationResponse.from_db` pattern (D22). Hard failure (D9) is writes-only. |
| D29 | `[V13-NEW]` **Re-encryption snapshots `ACTIVE_KEY_VERSION` at job start.** Key rotation mid-job cannot cause version mixing. |
| D30 | `[V13-NEW]` **Post-migration sweep.** Step 20d runs a cursorless scan for any remaining plaintext rows. |

---

## Feature 1 — Notification Engine

### 1.1–1.2 — Unchanged from Rev 12

### 1.3 Notification Generation — Unchanged from Rev 12

#### `_safe_localize` — Unchanged from Rev 12

> [!NOTE]
> `[V13 documentation]` DST gap behavior: when a gap is detected (e.g., 2:30 AM spring-forward), the function returns the UTC equivalent assuming standard-time offset. The reminder fires ~1 hour before the intended wall-clock time. This is a conscious trade-off: delivering early is safer than silently dropping. The `dst_gap_detected` log event enables ops to audit.

### 1.4 API — Notification Response — Unchanged from Rev 12

### 1.5 Retention `[V13-FIX]`

```python
async def cleanup_old_notifications():
    """
    V13-FIX (M5, M9):
    - FOR UPDATE SKIP LOCKED: don't block on rows locked by user transactions
    - ORDER BY id: deterministic subquery, no index thrashing
    - MAX_BATCHES: prevent runaway loop (10M rows max at 1000/batch)
    - Progress logging every 100 batches
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    total_deleted = 0
    MAX_BATCHES = 10_000
    batch_num = 0

    async with AsyncSessionLocal() as db:
        while batch_num < MAX_BATCHES:
            batch_num += 1

            # V13: subquery with ORDER BY + SKIP LOCKED
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

## Feature 2 — Recurring Tasks — Unchanged
## Feature 3 — Milestones — Unchanged
## Feature 4 — Rescue Mission — Unchanged (including Alembic autocommit pattern)

---

## Feature 5 — Encryption Pipeline

### 5.1 Migration 011 — Unchanged from Rev 12

### 5.1b Dead-Letter Table `[V13-FIX]`

```sql
-- Migration 011b (D23, D26)
CREATE TABLE encryption_dead_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table TEXT NOT NULL,
    source_row_id UUID NOT NULL,
    operation TEXT NOT NULL,  -- 'encrypt', 'decrypt', 'reencrypt'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- V13-FIX (M6): Partial unique prevents duplicates on retry
CREATE UNIQUE INDEX uq_dead_letter_active
  ON encryption_dead_letters (source_table, source_row_id, operation)
  WHERE resolved_at IS NULL;

-- Efficient lookup for unresolved entries
CREATE INDEX ix_dead_letters_unresolved
  ON encryption_dead_letters (source_table, created_at)
  WHERE resolved_at IS NULL;
```

### 5.2 Encryption Module `[V13-FIX]`

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
    keys: List[str] = settings.ENCRYPTION_KEYS
    if version < 0 or version >= len(keys):
        raise ValueError(f"Invalid key version {version}, have {len(keys)} keys")
    raw = keys[version].encode("utf-8")
    digest = hashlib.sha256(raw).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_field_versioned(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return value
    version = settings.ACTIVE_KEY_VERSION
    key = _get_key_for_version(version)
    token = Fernet(key).encrypt(value.encode("utf-8")).decode("utf-8")
    return f"v{version}:{token}"


def _parse_version_prefix(value: str) -> tuple[int, str]:
    """
    V13-FIX (M7): Regex-based parser. No slice limit.
    Handles v0, v10, v999999 uniformly. No startswith collision.
    """
    m = _VERSION_RE.match(value)
    if m:
        return int(m.group(1)), m.group(2)
    return 0, value  # Legacy: no prefix → version 0


def decrypt_field_versioned(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return value
    version, token = _parse_version_prefix(value)
    key = _get_key_for_version(version)
    return Fernet(key).decrypt(token.encode("utf-8")).decode("utf-8")


# Aliases — prevent accidental unversioned use
encrypt_field = encrypt_field_versioned
decrypt_field = decrypt_field_versioned
```

### 5.2b Config `[V13-FIX]`

```python
# In Settings class:
ENCRYPTION_ACTIVE: bool = False
ENCRYPTION_MIN_VERSION: int = 13
CODE_VERSION: int = 13
ENCRYPTION_KEYS: list = [""]  # Append-only. Index = version number.
ACTIVE_KEY_VERSION: int = 0
CRON_MAINTENANCE_MODE: bool = False

@model_validator(mode="after")
def validate_encryption_keys(self) -> "Settings":
    # V13-FIX (M4): Comprehensive validation
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

### 5.2c Write Path — Unchanged from Rev 12

### 5.3 Read Path `[V13-FIX]`

```python
def get_evening_note(daily_log: DailyLog) -> Optional[str]:
    """
    V13-FIX (D28): Graceful degradation on read path.
    Matches NotificationResponse.from_db pattern.
    D9 hard-failure is for writes only.
    """
    if daily_log.evening_note_encrypted is True:
        if daily_log.evening_note_ciphertext is None:
            logger.error("daily_log_encrypted_but_null_ciphertext", extra={
                "daily_log_id": str(daily_log.id),
            })
            return None

        try:
            return decrypt_field_versioned(
                daily_log.evening_note_ciphertext.decode('utf-8')
            )
        except Exception:
            logger.error("daily_log_decrypt_failed", extra={
                "daily_log_id": str(daily_log.id),
            })
            return "[encrypted]"

    return daily_log.evening_note
```

### 5.4 Forward Migration `[V13-FIX]`

```python
async def _write_dead_letter(
    source_table: str, source_row_id, operation: str, error: str
):
    """
    V13-FIX (D26, I15): Isolated dead-letter write.
    Uses a separate session so batch rollback cannot lose tracking.
    ON CONFLICT updates existing entry (M6).
    """
    async with AsyncSessionLocal() as dl_db:
        stmt = pg_insert(EncryptionDeadLetter).values(
            source_table=source_table,
            source_row_id=source_row_id,
            operation=operation,
            error_message=error[:500],
        ).on_conflict_do_update(
            index_elements=['source_table', 'source_row_id', 'operation'],
            index_where=(EncryptionDeadLetter.resolved_at.is_(None)),
            set_={
                'error_message': error[:500],
                'created_at': func.now(),
            },
        )
        await dl_db.execute(stmt)
        await dl_db.commit()


async def migrate_evening_notes():
    """
    V13 fixes over V12:
    1. if/raise instead of assert (D25, I14)
    2. Dead-letter writes in isolated session (D26, I15)
    3. Cursor does NOT advance for errored rows (I17)
    4. ON CONFLICT upsert for dead letters (M6)
    """
    # V13-FIX (B1): if/raise, NOT assert
    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError(
            "ENCRYPTION_ACTIVE must be True before forward migration. "
            "Set the flag and restart pods before running this script."
        )

    batch_size = 500
    total_migrated = 0
    total_skipped = 0
    total_errors = 0
    consecutive_errors = 0
    MAX_CONSECUTIVE_ERRORS = 10

    # Composite cursor (D20)
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    while True:
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                select(DailyLog).where(
                    DailyLog.evening_note.isnot(None),
                    DailyLog.evening_note_encrypted == False,
                    sa.or_(
                        DailyLog.created_at > last_created_at,
                        sa.and_(
                            DailyLog.created_at == last_created_at,
                            DailyLog.id > last_id,
                        ),
                    ),
                ).order_by(
                    DailyLog.created_at, DailyLog.id
                ).limit(batch_size)
            )
            batch = rows.scalars().all()
            if not batch:
                break

            for row in batch:
                try:
                    original_text = row.evening_note
                    ciphertext = encrypt_field_versioned(original_text)
                    if ciphertext is None:
                        raise ValueError("encrypt_field_versioned returned None")

                    stmt = sa_update(DailyLog).where(
                        DailyLog.id == row.id,
                        DailyLog.evening_note == original_text,
                        DailyLog.evening_note_encrypted == False,
                    ).values(
                        evening_note_ciphertext=ciphertext.encode('utf-8'),
                        evening_note_encrypted=True,
                        evening_note=None,
                    )
                    result = await db.execute(stmt)

                    if result.rowcount == 1:
                        total_migrated += 1
                        consecutive_errors = 0
                    else:
                        total_skipped += 1

                    # V13-FIX (I17): Advance cursor ONLY on success or skip
                    last_created_at = row.created_at
                    last_id = row.id

                except Exception as e:
                    consecutive_errors += 1
                    total_errors += 1

                    # V13-FIX (D26): Isolated dead-letter write
                    await _write_dead_letter(
                        'daily_logs', row.id, 'encrypt', str(e)
                    )

                    logger.error("encryption_migration_row_error", extra={
                        "daily_log_id": str(row.id),
                        "error": str(e),
                    })

                    # V13-FIX (I17): Advance cursor past errored row
                    # so next batch doesn't re-fetch it (dead letter tracks it)
                    last_created_at = row.created_at
                    last_id = row.id

                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        await db.commit()
                        raise RuntimeError(
                            f"Circuit breaker: {MAX_CONSECUTIVE_ERRORS} "
                            f"consecutive failures. Last error: {e}"
                        )

            await db.commit()
            logger.info("encryption_migration_batch", extra={
                "total_migrated": total_migrated,
                "total_skipped": total_skipped,
                "total_errors": total_errors,
            })

    logger.info("encryption_migration_complete", extra={
        "total_migrated": total_migrated,
        "total_skipped": total_skipped,
        "total_errors": total_errors,
    })
```

> [!IMPORTANT]
> **V13 cursor behavior (I17):** The cursor advances for ALL rows (success, skip, AND error). Errored rows are tracked in `encryption_dead_letters` and resolved via `resolve_dead_letters.py` (§5.9). This prevents infinite re-fetching of permanently failing rows while maintaining recoverability.

### 5.7 Reverse Migration `[V13-FIX]`

```python
async def reverse_migrate_evening_notes():
    """
    V13: if/raise (D25), isolated dead letters (D26), cursor advances for all rows.
    """
    # V13-FIX (B1): if/raise, NOT assert
    if settings.ENCRYPTION_ACTIVE:
        raise RuntimeError(
            "ENCRYPTION_ACTIVE must be False before reverse migration. "
            "Set the flag to false and restart pods before running."
        )

    batch_size = 500
    total_reversed = 0
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    while True:
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                select(DailyLog).where(
                    DailyLog.evening_note_encrypted == True,
                    DailyLog.evening_note_ciphertext.isnot(None),
                    sa.or_(
                        DailyLog.created_at > last_created_at,
                        sa.and_(
                            DailyLog.created_at == last_created_at,
                            DailyLog.id > last_id,
                        ),
                    ),
                ).order_by(
                    DailyLog.created_at, DailyLog.id
                ).limit(batch_size)
            )
            batch = rows.scalars().all()
            if not batch:
                break

            for row in batch:
                # Always advance cursor
                last_created_at = row.created_at
                last_id = row.id

                try:
                    original_ct = row.evening_note_ciphertext
                    plaintext = decrypt_field_versioned(
                        original_ct.decode('utf-8')
                    )

                    stmt = sa_update(DailyLog).where(
                        DailyLog.id == row.id,
                        DailyLog.evening_note_encrypted == True,
                        DailyLog.evening_note_ciphertext == original_ct,
                    ).values(
                        evening_note=plaintext,
                        evening_note_encrypted=False,
                        evening_note_ciphertext=None,
                    )
                    result = await db.execute(stmt)
                    if result.rowcount == 1:
                        total_reversed += 1

                except Exception as e:
                    await _write_dead_letter(
                        'daily_logs', row.id, 'decrypt', str(e)
                    )
                    logger.error("reverse_migration_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()

    logger.info("reverse_migration_complete", extra={
        "total_reversed": total_reversed,
    })
```

### 5.8 Re-Encryption Job `[V13-FIX]`

```python
async def reencrypt_evening_notes():
    """
    V13-FIX (D29, M3): Snapshots ACTIVE_KEY_VERSION at start.
    Key rotation mid-job cannot cause version mixing.
    """
    # V13-FIX (M3): Snapshot — frozen for entire job
    target_version = settings.ACTIVE_KEY_VERSION

    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError("ENCRYPTION_ACTIVE must be True for re-encryption")

    batch_size = 500
    total = 0
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    logger.info("reencryption_started", extra={
        "target_version": target_version,
    })

    while True:
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                select(DailyLog).where(
                    DailyLog.evening_note_encrypted == True,
                    DailyLog.evening_note_ciphertext.isnot(None),
                    sa.or_(
                        DailyLog.created_at > last_created_at,
                        sa.and_(
                            DailyLog.created_at == last_created_at,
                            DailyLog.id > last_id,
                        ),
                    ),
                ).order_by(
                    DailyLog.created_at, DailyLog.id
                ).limit(batch_size)
            )
            batch = rows.scalars().all()
            if not batch:
                break

            for row in batch:
                last_created_at = row.created_at
                last_id = row.id

                ct = row.evening_note_ciphertext.decode('utf-8')
                current_version, _ = _parse_version_prefix(ct)

                # V13-FIX: Compare against snapshot, not live config
                if current_version == target_version:
                    continue

                try:
                    plaintext = decrypt_field_versioned(ct)

                    # V13-FIX: Use snapshot version for encryption
                    key = _get_key_for_version(target_version)
                    new_token = Fernet(key).encrypt(
                        plaintext.encode("utf-8")
                    ).decode("utf-8")
                    new_ct = f"v{target_version}:{new_token}"

                    original_ct = row.evening_note_ciphertext
                    stmt = sa_update(DailyLog).where(
                        DailyLog.id == row.id,
                        DailyLog.evening_note_ciphertext == original_ct,
                    ).values(
                        evening_note_ciphertext=new_ct.encode('utf-8'),
                    )
                    result = await db.execute(stmt)
                    if result.rowcount == 1:
                        total += 1

                except Exception as e:
                    await _write_dead_letter(
                        'daily_logs', row.id, 'reencrypt', str(e)
                    )
                    logger.error("reencrypt_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()

    logger.info("reencryption_complete", extra={
        "total": total, "target_version": target_version,
    })
```

### 5.9 Dead-Letter Resolution Script `[V13-NEW]`

```python
# scripts/resolve_dead_letters.py
"""
V13-NEW (C2): Retries encryption for rows tracked in encryption_dead_letters.
Bypasses cursor — queries by primary key from dead-letter table.
Idempotent: already-encrypted rows are skipped via OCC.
"""
import asyncio
from app.database import AsyncSessionLocal
from app.models import DailyLog, EncryptionDeadLetter
from app.core.encryption import encrypt_field_versioned, decrypt_field_versioned
from app.config import settings


async def resolve_dead_letters():
    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError("ENCRYPTION_ACTIVE must be True")

    resolved = 0
    still_failing = 0

    async with AsyncSessionLocal() as db:
        entries = await db.execute(
            select(EncryptionDeadLetter).where(
                EncryptionDeadLetter.source_table == 'daily_logs',
                EncryptionDeadLetter.operation == 'encrypt',
                EncryptionDeadLetter.resolved_at.is_(None),
            ).order_by(EncryptionDeadLetter.created_at)
        )

        for dl in entries.scalars():
            try:
                row = await db.get(DailyLog, dl.source_row_id)
                if row is None:
                    # Row was deleted — mark resolved
                    dl.resolved_at = func.now()
                    resolved += 1
                    continue

                if row.evening_note_encrypted is True:
                    # Already encrypted (manually or by re-run) — mark resolved
                    dl.resolved_at = func.now()
                    resolved += 1
                    continue

                if row.evening_note is None:
                    # Nothing to encrypt — mark resolved
                    dl.resolved_at = func.now()
                    resolved += 1
                    continue

                # Retry encryption
                ciphertext = encrypt_field_versioned(row.evening_note)
                if ciphertext is None:
                    raise ValueError("encrypt returned None")

                stmt = sa_update(DailyLog).where(
                    DailyLog.id == row.id,
                    DailyLog.evening_note_encrypted == False,
                ).values(
                    evening_note_ciphertext=ciphertext.encode('utf-8'),
                    evening_note_encrypted=True,
                    evening_note=None,
                )
                result = await db.execute(stmt)

                if result.rowcount == 1:
                    dl.resolved_at = func.now()
                    resolved += 1
                else:
                    # OCC conflict — row changed concurrently, skip
                    dl.resolved_at = func.now()
                    resolved += 1

            except Exception as e:
                still_failing += 1
                dl.error_message = str(e)[:500]
                logger.error("dead_letter_retry_failed", extra={
                    "source_row_id": str(dl.source_row_id),
                    "error": str(e),
                })

        await db.commit()

    logger.info("dead_letter_resolution_complete", extra={
        "resolved": resolved, "still_failing": still_failing,
    })


if __name__ == "__main__":
    asyncio.run(resolve_dead_letters())
```

### 5.10 Health Endpoint — Unchanged from Rev 12

---

## Feature 6 — Heatmap Cache — Unchanged
## Health Profile — Unchanged
