"""Shared test fixtures and utilities."""

import uuid
import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from types import SimpleNamespace
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserBehaviouralProfile, UserSettings
from app.core.security import hash_password, create_access_token


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


# ── Database ──────────────────────────────────────────────────

@pytest.fixture(scope="session")
def sqlite_engine():
    """Create a session-wide SQLite in-memory engine."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    return engine


@pytest.fixture(scope="function")
async def test_db(sqlite_engine):
    """Provide a fresh, clean database for each test function."""
    async with sqlite_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(sqlite_engine, expire_on_commit=False, class_=AsyncSession)
    async with session_factory() as session:
        yield session

    async with sqlite_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# ── Client ────────────────────────────────────────────────────

@pytest.fixture(scope="function")
async def async_client(test_db):
    """FastAPI test client with DB override."""
    
    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides.clear()


# ── Specialized Security Fixtures ───────────────────────────

@pytest.fixture(scope="function")
async def setup_test_user(test_db):
    """Create a standard user and return (user, token)."""
    uid = uuid.uuid4()
    user = User(
        id=uid,
        name="Test User",
        email=f"test_{uid.hex[:6]}@example.com",
        password_hash=hash_password("Password123!"),
        user_type="student",
        onboarding_complete=True,
    )
    test_db.add(user)
    
    # Needs settings and profile for some dependencies
    settings = UserSettings(user_id=uid, theme="light", preferred_model="primary")
    profile = UserBehaviouralProfile(
        user_id=uid,
        wake_time="07:00",
        sleep_time="23:00",
        chronotype="intermediate",
        daily_commitment_hrs=4.0
    )
    test_db.add(settings)
    test_db.add(profile)
    
    await test_db.flush()
    await test_db.commit()
    
    token = create_access_token(user.id, user.email)
    return user, token


@pytest.fixture(scope="function")
def redis_client(mocker):
    """Mock Redis client for rate limit tests."""
    class MockRedis:
        def __init__(self):
            self.storage = {}

        async def flushdb(self):
            self.storage = {}

        async def get(self, key):
            return self.storage.get(key)

        async def setex(self, key, time, value):
            self.storage[key] = value

        async def incr(self, key):
            val = int(self.storage.get(key, 0)) + 1
            self.storage[key] = str(val)
            return val

    return MockRedis()


# ── Legacy Handlers (Keep for backward compat) ────────────────


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
        # Commit 3: multi-goal rank fields
        "priority_rank": None,
        "pre_pause_rank": None,
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

    def scalar(self):
        """Return scalar value (for aggregate queries like COUNT, MAX)."""
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
