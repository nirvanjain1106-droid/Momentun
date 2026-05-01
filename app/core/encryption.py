"""
Field-level encryption for sensitive free-text health data.

Encrypts only free-text fields (physical_limitation_note, focus_note, evening_note).
Enum/boolean fields stay plain for queryability.
Uses Fernet symmetric encryption (AES-128-CBC) with key versioning prefix.
"""

import base64
import hashlib
import re
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
