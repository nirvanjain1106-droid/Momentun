# Sprint 6 — Implementation Plan (Revision 14 — Final Hardened)

> [!IMPORTANT]
> Supersedes Rev 13. All changes marked `[V14-FIX]`. Synthesizes findings from two independent kill-test reviews. Every fix traces to a specific review finding.

---

## V14 Change Summary

| # | V13 Issue | V14 Fix | Source | Test |
|---|-----------|---------|--------|------|
| B1 | `_write_dead_letter` failure crashes migration loop | Wrap DL call in inner try/except, never abort main loop | R1-B1 | T-B1 |
| B2 | `resolve_dead_letters.py` unbounded memory + single commit | Keyset pagination + per-row commit + error isolation | R1-B2, R2-B1 | T-B2 |
| B3 | Retention query lacks covering index | Partial index `ix_notifications_retention` | R1-B3, R2-C3 | T-B3 |
| B4 | Re-encryption reimplements Fernet inline | `encrypt_field_versioned(value, force_version=)` | R2-B2 | T-B4 |
| C1 | Dead-letter `ON CONFLICT` overwrites `created_at` | Remove from `set_`, add `last_retry_at` column | R2-C2 | T-C1 |
| C2 | Post-migration sweep full table scan | `LIMIT 1` on sweep query | R1-C6, R2-C1 | T-C2 |
| C3 | DL session pool exhaustion under error storm | Reuse main session with `SAVEPOINT` for DL writes | R1-C5 | T-C3 |
| M1 | Health gate includes terminating/NotReady pods | `kubectl rollout status` + readiness filter | R1-C4, R2-M5 | — |
| M2 | Health gate `python3 -c` may not exist in pod | Use `jq` for JSON parsing | R2-M5 | — |
| M3 | Cron straggler during `rollout restart` | `preStop` sleep hook on worker deployment | R1-C7 | — |
| M4 | No rollback path after Step 20 (Day 3+) | New rollback matrix entry documented | R2-M2 | — |
| M5 | `get_evening_note` returns `"[encrypted]"` string | Return `None` instead — matches API contract | R1-C8 | T-M5 |
| M6 | `_safe_localize` DST gap fires wrong time | **Product decision required** — flag for review | R2-M3 | — |
| M7 | Reverse migration cursor skippable by concurrent edits | Document: maintenance mode required for reverse | R2-M1 | — |

---

## Architectural Invariants

| # | Invariant |
|---|-----------|
| I1–I17 | Unchanged from Rev 13 |
| I18 | `[V14]` **Dead-letter write failures MUST NOT abort the migration loop.** Inner try/except required. |
| I19 | `[V14]` **`resolve_dead_letters.py` MUST commit per-row (or per-batch) with error isolation.** Single-commit-at-end is forbidden. |
| I20 | `[V14]` **All encryption MUST go through `encrypt_field_versioned()`.** No inline Fernet calls anywhere. |
| I21 | `[V14]` **Dead-letter `created_at` is immutable after first insert.** Retries update `last_retry_at` only. |

---

## Design Decisions

| # | Decision |
|---|----------|
| D1–D30 | Unchanged from Rev 13 |
| D31 | `[V14]` **DL writes use SAVEPOINT within main session** — eliminates pool exhaustion while maintaining isolation. Replaces D26 separate-session approach. |
| D32 | `[V14]` **`encrypt_field_versioned` accepts optional `force_version` parameter.** Re-encryption calls it instead of duplicating Fernet logic. |
| D33 | `[V14]` **`get_evening_note` returns `None` on decrypt failure**, not `"[encrypted]"`. API contract expects `Optional[str]`. Placeholder strings break mobile parsers. |
| D34 | `[V14]` **Reverse migration requires maintenance mode.** Concurrent user writes during rollback can shift cursor position. |

---

## Feature 1 — Notification Engine

### 1.1–1.4 — Unchanged from Rev 13

### 1.5 Retention `[V14-FIX]`

> [!IMPORTANT]
> V14 adds the partial index (B3). The query logic is unchanged from V13.

**New migration (011c or added to 006):**

```sql
-- V14-FIX (B3): Partial index for retention query
CREATE INDEX CONCURRENTLY ix_notifications_retention
  ON notifications (created_at)
  WHERE dismissed_at IS NOT NULL;
```

The retention function body is unchanged from V13 §1.5. The index makes the `WHERE created_at < cutoff AND dismissed_at IS NOT NULL` predicate use an index scan instead of a sequential scan.

---

## Feature 2–4 — Unchanged

---

## Feature 5 — Encryption Pipeline

### 5.1 Migration 011 — Unchanged
### 5.1b Dead-Letter Table `[V14-FIX]`

```sql
-- Migration 011b (D23, D26, V14-FIX C1)
CREATE TABLE encryption_dead_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table TEXT NOT NULL,
    source_row_id UUID NOT NULL,
    operation TEXT NOT NULL,  -- 'encrypt', 'decrypt', 'reencrypt'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_retry_at TIMESTAMPTZ,          -- V14-FIX (C1): tracks retry timing
    resolved_at TIMESTAMPTZ
);

-- V13: Partial unique prevents duplicates on retry
CREATE UNIQUE INDEX uq_dead_letter_active
  ON encryption_dead_letters (source_table, source_row_id, operation)
  WHERE resolved_at IS NULL;

-- Efficient lookup for unresolved entries
CREATE INDEX ix_dead_letters_unresolved
  ON encryption_dead_letters (source_table, created_at)
  WHERE resolved_at IS NULL;
```

### 5.2 Encryption Module `[V14-FIX]`

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


def encrypt_field_versioned(
    value: Optional[str],
    force_version: Optional[int] = None,    # V14-FIX (B4, D32)
) -> Optional[str]:
    """
    V14-FIX (B4): Added force_version parameter.
    Re-encryption job passes target version here instead of
    reimplementing Fernet inline. Single source of truth.
    """
    if value is None or value == "":
        return value
    version = force_version if force_version is not None else settings.ACTIVE_KEY_VERSION
    key = _get_key_for_version(version)
    token = Fernet(key).encrypt(value.encode("utf-8")).decode("utf-8")
    return f"v{version}:{token}"


def _parse_version_prefix(value: str) -> tuple[int, str]:
    """V13-FIX (M7): Regex-based parser. No slice limit."""
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


# Aliases
encrypt_field = encrypt_field_versioned
decrypt_field = decrypt_field_versioned
```

### 5.2b Config — Unchanged from V13

### 5.3 Read Path `[V14-FIX]`

```python
def get_evening_note(daily_log: DailyLog) -> Optional[str]:
    """
    V14-FIX (M5, D33): Returns None on decrypt failure.
    V13 returned "[encrypted]" which breaks mobile/web parsers
    that expect valid string or null. Matches API Optional[str] contract.
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
            return None  # V14: was "[encrypted]", now None

    return daily_log.evening_note
```

### 5.4 Forward Migration `[V14-FIX]`

```python
async def _write_dead_letter(
    db: AsyncSession,
    source_table: str, source_row_id, operation: str, error: str
):
    """
    V14-FIX (C3, D31): Uses SAVEPOINT within the caller's session.
    Replaces V13's separate AsyncSession approach which risked pool exhaustion
    under error storms (100+ errors/batch → 100+ connections).
    
    V14-FIX (C1): Does NOT overwrite created_at on conflict.
    Updates last_retry_at and error_message only.
    """
    try:
        async with db.begin_nested():  # SAVEPOINT
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
                    'last_retry_at': func.now(),   # V14: NOT created_at
                },
            )
            await db.execute(stmt)
    except Exception as dl_err:
        # SAVEPOINT rolled back automatically. Main transaction intact.
        logger.error("dead_letter_write_failed", extra={
            "source_row_id": str(source_row_id),
            "dl_error": str(dl_err),
        })


async def migrate_evening_notes():
    """
    V14 fixes over V13:
    1. _write_dead_letter uses SAVEPOINT, not separate session (D31)
    2. DL write failure cannot crash migration loop (B1, I18)
    3. ON CONFLICT preserves created_at (C1, I21)
    """
    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError(
            "ENCRYPTION_ACTIVE must be True before forward migration."
        )

    batch_size = 500
    total_migrated = 0
    total_skipped = 0
    total_errors = 0
    total_dl_failures = 0
    consecutive_errors = 0
    MAX_CONSECUTIVE_ERRORS = 10

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

                    last_created_at = row.created_at
                    last_id = row.id

                except Exception as e:
                    consecutive_errors += 1
                    total_errors += 1

                    # V14-FIX (B1, I18): DL write failure CANNOT crash loop
                    await _write_dead_letter(
                        db, 'daily_logs', row.id, 'encrypt', str(e)
                    )
                    # _write_dead_letter has its own try/except internally.
                    # If it fails, it logs and continues. Loop never breaks.

                    logger.error("encryption_migration_row_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

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

### 5.7 Reverse Migration `[V14-FIX]`

```python
async def reverse_migrate_evening_notes():
    """
    V14-FIX (M7, D34): Document that app MUST be in maintenance mode.
    Concurrent user writes during rollback can shift cursor position.
    DL writes use SAVEPOINT (D31).
    """
    if settings.ENCRYPTION_ACTIVE:
        raise RuntimeError(
            "ENCRYPTION_ACTIVE must be False before reverse migration."
        )
    if not settings.CRON_MAINTENANCE_MODE:
        raise RuntimeError(
            "CRON_MAINTENANCE_MODE must be True during reverse migration. "
            "Set it and restart workers before running."
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
                        db, 'daily_logs', row.id, 'decrypt', str(e)
                    )
                    logger.error("reverse_migration_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()

    logger.info("reverse_migration_complete", extra={
        "total_reversed": total_reversed,
    })
```

### 5.8 Re-Encryption Job `[V14-FIX]`

```python
async def reencrypt_evening_notes():
    """
    V14-FIX (B4, D32, I20): Uses encrypt_field_versioned(force_version=)
    instead of inline Fernet. Single source of truth for encryption logic.
    """
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

                if current_version == target_version:
                    continue

                try:
                    plaintext = decrypt_field_versioned(ct)

                    # V14-FIX (B4): Call encrypt_field_versioned, NOT inline Fernet
                    new_ct = encrypt_field_versioned(plaintext, force_version=target_version)

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
                        db, 'daily_logs', row.id, 'reencrypt', str(e)
                    )
                    logger.error("reencrypt_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()

    logger.info("reencryption_complete", extra={
        "total": total, "target_version": target_version,
    })
```

### 5.9 Dead-Letter Resolution Script `[V14-FIX]`

```python
# scripts/resolve_dead_letters.py
"""
V14-FIX (B2, I19): Complete rewrite.
- Keyset pagination instead of loading all rows into memory (R1-B2)
- Per-row commit with error isolation (R2-B1)
- One bad row cannot block resolution of others
"""
import asyncio
from sqlalchemy import select, func
from sqlalchemy import update as sa_update
from app.database import AsyncSessionLocal
from app.models import DailyLog, EncryptionDeadLetter
from app.core.encryption import encrypt_field_versioned
from app.config import settings


BATCH_SIZE = 500


async def resolve_dead_letters():
    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError("ENCRYPTION_ACTIVE must be True")

    resolved = 0
    still_failing = 0
    processed = 0

    # V14-FIX: Keyset pagination — never loads all rows into memory
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    while True:
        # Fetch one batch of unresolved dead letters
        async with AsyncSessionLocal() as db:
            entries = await db.execute(
                select(EncryptionDeadLetter).where(
                    EncryptionDeadLetter.source_table == 'daily_logs',
                    EncryptionDeadLetter.operation == 'encrypt',
                    EncryptionDeadLetter.resolved_at.is_(None),
                    sa.or_(
                        EncryptionDeadLetter.created_at > last_created_at,
                        sa.and_(
                            EncryptionDeadLetter.created_at == last_created_at,
                            EncryptionDeadLetter.id > last_id,
                        ),
                    ),
                ).order_by(
                    EncryptionDeadLetter.created_at,
                    EncryptionDeadLetter.id,
                ).limit(BATCH_SIZE)
            )
            batch = entries.scalars().all()

        if not batch:
            break

        # V14-FIX: Process each dead letter in its own session + commit
        for dl_snapshot in batch:
            dl_id = dl_snapshot.id
            dl_source_row_id = dl_snapshot.source_row_id
            last_created_at = dl_snapshot.created_at
            last_id = dl_snapshot.id
            processed += 1

            async with AsyncSessionLocal() as db:
                try:
                    # Re-fetch to avoid stale state
                    dl = await db.get(EncryptionDeadLetter, dl_id)
                    if dl is None or dl.resolved_at is not None:
                        continue

                    row = await db.get(DailyLog, dl_source_row_id)
                    if row is None:
                        dl.resolved_at = func.now()
                    elif row.evening_note_encrypted is True:
                        dl.resolved_at = func.now()
                    elif row.evening_note is None:
                        dl.resolved_at = func.now()
                    else:
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
                        else:
                            dl.resolved_at = func.now()  # OCC skip

                    await db.commit()
                    resolved += 1

                except Exception as e:
                    still_failing += 1
                    # Update error + last_retry_at but do NOT resolve
                    try:
                        async with AsyncSessionLocal() as err_db:
                            dl = await err_db.get(EncryptionDeadLetter, dl_id)
                            if dl:
                                dl.error_message = str(e)[:500]
                                dl.last_retry_at = func.now()
                                await err_db.commit()
                    except Exception:
                        pass  # Best-effort error update

                    logger.error("dead_letter_retry_failed", extra={
                        "source_row_id": str(dl_source_row_id),
                        "error": str(e),
                    })

    logger.info("dead_letter_resolution_complete", extra={
        "resolved": resolved,
        "still_failing": still_failing,
        "processed": processed,
    })


if __name__ == "__main__":
    asyncio.run(resolve_dead_letters())
```

### 5.10 Health Endpoint — Unchanged from Rev 13

---

## Feature 6 — Heatmap Cache — Unchanged
## Health Profile — Unchanged

---

## Appendix A: Review Cross-Reference

| Finding | Review 1 | Review 2 | Severity | V14 Fix |
|---------|----------|----------|----------|---------|
| DL write failure crashes loop | B1 (Blocker) | — | Blocker | §5.4 inner try/except |
| resolve_dead_letters unbounded memory | B2 (Blocker) | — | Blocker | §5.9 keyset pagination |
| resolve_dead_letters single commit | — | B1 (Blocker) | Blocker | §5.9 per-row commit |
| Retention missing index | B3 (Blocker) | C3 (Critical) | Blocker | §1.5 partial index |
| Re-encryption inline Fernet | — | B2 (Blocker) | Blocker | §5.2 force_version, §5.8 |
| DL ON CONFLICT overwrites created_at | "Looks Safe" table | C2 (Critical) | Critical | §5.1b last_retry_at, §5.4 |
| Post-migration sweep full scan | C6 (Major) | C1 (Critical) | Critical | Part 2 §B Step 20d |
| DL session pool exhaustion | C5 (Major) | — | Critical | §5.4 SAVEPOINT |
| Health gate terminating pods | C4 (Major) | — | Major | Part 2 §B Step 14 |
| Health gate python3 | — | M5 (Minor) | Major | Part 2 §B Step 14 |
| Cron straggler | C7 (Major) | — | Major | Part 2 §B Step 10 |
| No Day 3+ rollback | — | M2 (Major) | Major | Part 2 §C |
| `"[encrypted]"` breaks clients | C8 (Major) | — | Major | §5.3 returns None |
| DST gap wrong reminder | — | M3 (Major) | Major | Product decision |
| Reverse migration concurrent | — | M1 (Major) | Major | §5.7 maintenance gate |
