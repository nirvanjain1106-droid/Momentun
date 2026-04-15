"""
Field-level encryption for sensitive free-text health data.

Encrypts only free-text fields (physical_limitation_note, focus_note).
Enum/boolean fields stay plain for queryability.
Uses Fernet symmetric encryption (AES-128-CBC).
"""

import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet


def _get_encryption_key() -> bytes:
    """
    Derive a Fernet key from SECRET_KEY.
    Fernet requires a 32-byte URL-safe base64 key.
    """
    from app.config import settings
    raw = settings.SECRET_KEY.encode("utf-8")
    # Derive a consistent 32-byte key via SHA-256
    digest = hashlib.sha256(raw).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_field(value: Optional[str]) -> Optional[str]:
    """Encrypt a string field. Returns base64-encoded ciphertext or None."""
    if value is None or value == "":
        return value
    key = _get_encryption_key()
    f = Fernet(key)
    return f.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_field(value: Optional[str]) -> Optional[str]:
    """Decrypt a previously encrypted field. Returns plaintext or None."""
    if value is None or value == "":
        return value
    try:
        key = _get_encryption_key()
        f = Fernet(key)
        return f.decrypt(value.encode("utf-8")).decode("utf-8")
    except Exception:
        # If decryption fails (e.g. data was stored before encryption was added),
        # return the raw value rather than crashing
        return value
