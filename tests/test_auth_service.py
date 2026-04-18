import uuid

import pytest
from fastapi import HTTPException

from app.schemas.auth import LoginRequest, RegisterRequest
from app.services import auth_service


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    def __init__(self, select_results=None):
        self._results = list(select_results or [])
        self.added = []

    async def execute(self, _stmt):
        value = self._results.pop(0) if self._results else None
        return _FakeResult(value)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        for obj in self.added:
            if hasattr(obj, "id") and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())

    async def commit(self): pass
    async def rollback(self): pass
    def begin_nested(self):
        class _Nested:
            async def __aenter__(self): return self
            async def __aexit__(self, *args): pass
        return _Nested()


@pytest.mark.asyncio
async def test_register_user_success():
    db = _FakeDB([None])
    data = RegisterRequest(
        name="Test User",
        email="test@example.com",
        password="Secure123",
        user_type="student",
    )

    token_response, refresh_token = await auth_service.register_user(data, db)

    assert token_response.user_id is not None
    assert token_response.onboarding_step == 1
    assert token_response.access_token
    assert refresh_token


@pytest.mark.asyncio
async def test_login_user_invalid_credentials():
    db = _FakeDB([None])
    data = LoginRequest(email="nope@example.com", password="Secure123")

    with pytest.raises(HTTPException) as exc:
        await auth_service.login_user(data, db)

    assert exc.value.status_code == 401

