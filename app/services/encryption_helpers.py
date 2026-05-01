"""
Evening note encryption helpers for the API read/write path.

Write path (D9): Hard failure — raises on encryption error.
Read path (D22, D28, D33): Graceful degradation — returns None or "[encrypted]" on failure.
"""
import logging
from typing import Optional

from app.config import settings
from app.core.encryption import encrypt_field_versioned, decrypt_field_versioned

logger = logging.getLogger(__name__)

# Prometheus counter for long-lived API process (Part 1 §9).
# Unlike ephemeral scripts, the API runs long enough for Prometheus to scrape.
try:
    from prometheus_client import Counter
    daily_log_decrypt_failures = Counter(
        'daily_log_decrypt_failures',
        'Failed decrypt attempts on DailyLog read path',
    )
except ImportError:
    # Graceful fallback if prometheus_client not installed
    daily_log_decrypt_failures = None


def get_evening_note(daily_log) -> Optional[str]:
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
            ct = daily_log.evening_note_ciphertext
            # D7: Defensive type normalization (column is Text, but guard anyway)
            if isinstance(ct, (memoryview, bytes)):
                ct = bytes(ct).decode('utf-8') if isinstance(ct, memoryview) else ct.decode('utf-8')
            return decrypt_field_versioned(ct)
        except Exception:
            logger.error("daily_log_decrypt_failed", extra={
                "daily_log_id": str(daily_log.id),
            })
            if daily_log_decrypt_failures is not None:
                daily_log_decrypt_failures.inc()
            return "[encrypted]"

    return daily_log.evening_note


def set_evening_note(daily_log, evening_note: Optional[str]) -> None:
    """
    Part 1 §8: Write path for evening_note.
    D9: Hard failure — raises on encryption error (no silent data loss).
    I5: Clears plaintext column after encryption.
    """
    if settings.ENCRYPTION_ACTIVE and evening_note is not None:
        ciphertext = encrypt_field_versioned(evening_note)
        if ciphertext is None:
            raise ValueError("encrypt_field_versioned returned None for non-null input")
        daily_log.evening_note_ciphertext = ciphertext  # Text column, no encode needed
        daily_log.evening_note_encrypted = True
        daily_log.evening_note = None  # I5: Clear plaintext
    else:
        daily_log.evening_note = evening_note
        daily_log.evening_note_encrypted = False
        daily_log.evening_note_ciphertext = None
