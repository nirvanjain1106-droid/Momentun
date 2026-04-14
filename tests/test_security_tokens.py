import uuid

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_and_verify_roundtrip():
    hashed = hash_password("Secure123")
    assert verify_password("Secure123", hashed) is True
    assert verify_password("Wrong123", hashed) is False


def test_access_and_refresh_tokens_decode_with_types():
    user_id = uuid.uuid4()
    access = create_access_token(user_id, "a@example.com")
    refresh = create_refresh_token(user_id)
    assert decode_token(access)["type"] == "access"
    assert decode_token(refresh)["type"] == "refresh"

