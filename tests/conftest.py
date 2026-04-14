"""Shared test fixtures and utilities."""

import uuid
from types import SimpleNamespace


def make_user(**overrides):
    """Create a fake user object for tests."""
    defaults = {
        "id": uuid.uuid4(),
        "name": "Test User",
        "email": "test@example.com",
        "user_type": "student",
        "timezone": "Asia/Kolkata",
        "onboarding_complete": True,
        "onboarding_step": 5,
        "email_verified": False,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def make_goal(**overrides):
    """Create a fake goal object for tests."""
    from datetime import date, timedelta

    defaults = {
        "id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "title": "Test Goal",
        "goal_type": "exam",
        "description": None,
        "target_date": date.today() + timedelta(days=30),
        "motivation": None,
        "consequence": None,
        "success_metric": None,
        "status": "active",
        "goal_metadata": {"subjects": ["math", "physics"], "weak_subjects": ["math"], "strong_subjects": ["physics"]},
        "deleted_at": None,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class FakeDB:
    """Minimal fake async DB session for unit tests."""

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

    async def commit(self):
        pass

    async def rollback(self):
        pass


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return self

    def all(self):
        if isinstance(self._value, list):
            return self._value
        return [self._value] if self._value else []


def async_return(value):
    """Create an async function that returns a fixed value."""
    async def _inner(*_args, **_kwargs):
        return value
    return _inner


def async_raise(exc):
    """Create an async function that raises an exception."""
    async def _inner(*_args, **_kwargs):
        raise exc
    return _inner
