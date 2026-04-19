"""Shared test fixtures and utilities for Momentum API."""

import asyncio
import os
import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from types import SimpleNamespace
from datetime import timedelta
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# Force testing environment early
os.environ["APP_ENV"] = "testing"

# ── Chaos Proxy: Latency Injection ────────────────────────────

class LatencyAsyncSession(AsyncSession):
    """
    Proxy session that injects artificial latency into DB operations.
    Controlled via app.state.db_latency_ms.
    """
    def __init__(self, *args, **kwargs):
        self._latency_ms = kwargs.pop("latency_ms", 0)
        super().__init__(*args, **kwargs)

    async def execute(self, statement, params=None, **kw):
        if self._latency_ms > 0:
            await asyncio.sleep(self._latency_ms / 1000.0)
        return await super().execute(statement, params, **kw)

# ── Infrastructure: Session-Scoped Loop Compatibility ──────────

@pytest_asyncio.fixture(scope="session")
async def db_engine():
    """
    Create a session-scoped engine using a real Postgres container.
    Using NullPool ensures connections are freshly bound to the current loop,
    preventing state leakage and 'different loop' errors across test functions.
    """
    from testcontainers.postgres import PostgresContainer
    from app.database import Base
    import app.models  # noqa: F401 # MANDATORY: Ensures all tables are registered before create_all()
    
    with PostgresContainer("postgres:16-alpine") as postgres:
        raw_url = postgres.get_connection_url()
        url = raw_url.split("://")[1]
        async_url = f"postgresql+asyncpg://{url}"
        
        engine = create_async_engine(
            async_url, 
            echo=False, 
            poolclass=NullPool
        )
        
        # Initialize schema once for the session
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            
        yield engine
        
        await engine.dispose()

@pytest_asyncio.fixture(scope="function")
async def test_db(db_engine, app_instance):
    """
    Provide function-scoped DB session.
    Bound directly to the engine to allow multiple parallel sessions (for concurrency tests).
    Cleanup is handled via the separate db_cleanup fixture using TRUNCATE CASCADE.
    """
    # Inject latency if configured
    latency = getattr(app_instance.state, "db_latency_ms", 0)
    
    session_factory = async_sessionmaker(
        bind=db_engine,
        expire_on_commit=False,
        class_=LatencyAsyncSession
    )
    
    async with session_factory(latency_ms=latency) as session:
        yield session
        # We don't necessarily need rollback here because db_cleanup handles it,
        # but it's good practice for isolation in case cleanup fails.
        if session.is_active:
            await session.rollback()

@pytest_asyncio.fixture(scope="function", autouse=True)
async def db_cleanup(db_engine):
    """
    Nuclear cleanup fixture: Truncates all tables in the correct order.
    Ensures absolute isolation between tests even when they commit.
    """
    from app.database import Base
    from sqlalchemy import text
    yield
    
    async with db_engine.begin() as conn:
        # Get all table names from MetaData
        table_names = [f'"{t.name}"' for t in Base.metadata.sorted_tables]
        if table_names:
            # CASCADE handles foreign key order automatically
            await conn.execute(text(f"TRUNCATE {', '.join(table_names)} RESTART IDENTITY CASCADE"))

@pytest.fixture
def use_latency_proxy(app_instance):
    """Fixture to force DB latency for specific chaos/reliability tests."""
    app_instance.state.db_latency_ms = 500
    yield
    app_instance.state.db_latency_ms = 0

@pytest.fixture(scope="function")
def app_instance():
    """Get the FastAPI app instance."""
    from app.main import app
    # Reset state
    app.state.db_latency_ms = 0
    return app

@pytest_asyncio.fixture(scope="function")
async def async_client(db_engine, app_instance, request):
    """ 
    FastAPI test client with DB dependency overrides.
    Yields a FRESH session from the pool for every request to support concurrency.
    """
    from app.database import get_db
    
    async def override_get_db():
        latency = getattr(app_instance.state, "db_latency_ms", 0)
        session_factory = async_sessionmaker(
            bind=db_engine,
            expire_on_commit=False,
            class_=LatencyAsyncSession
        )
        async with session_factory(latency_ms=latency) as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    app_instance.dependency_overrides[get_db] = override_get_db

    # Patch the engine reference so advisory locks use the test container
    import app.database as _db_mod
    import app.services.schedule_service as _sched_mod
    _orig_db_engine = _db_mod.engine
    _orig_sched_engine = _sched_mod.engine
    _db_mod.engine = db_engine
    _sched_mod.engine = db_engine
    
    # Handle rate limiting: Disable unless explicitly requested via mark
    marker = request.node.get_closest_marker("rate_limit_enabled")
    if not marker and hasattr(app_instance.state, "limiter"):
        app_instance.state.limiter.enabled = False
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app_instance), 
                base_url="http://testserver",
                follow_redirects=True
            ) as ac:
                yield ac
        finally:
            app_instance.state.limiter.enabled = True
    else:
        # Rate limiting remains enabled
        async with AsyncClient(
            transport=ASGITransport(app=app_instance), 
            base_url="http://testserver",
            follow_redirects=True
        ) as ac:
            yield ac
        
    app_instance.dependency_overrides.clear()

    # Restore original engine references
    _db_mod.engine = _orig_db_engine
    _sched_mod.engine = _orig_sched_engine

# ── Auth & User Helpers ─────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def setup_test_user(test_db):
    """Create a standard user and return (user, token)."""
    from app.models.user import User, UserBehaviouralProfile, UserSettings
    from app.core.security import hash_password, create_access_token
    
    uid = uuid.uuid4()
    user = User(
        id=uid,
        name="Test User",
        email=f"test_{uid.hex[:6]}@example.com",
        password_hash=hash_password("Password123!"),
        user_type="student",
        onboarding_complete=True,
        onboarding_step=5,
        timezone="Asia/Kolkata"
    )
    test_db.add(user)
    
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
    
    # Note: create_access_token signature is (user_id, email, ...)
    token = create_access_token(user.id, user.email)
    return user, token

@pytest_asyncio.fixture(scope="function")
async def setup_second_user(test_db):
    """Create a second distinct user and return (user, token)."""
    from app.models.user import User, UserBehaviouralProfile, UserSettings
    from app.core.security import hash_password, create_access_token
    
    uid = uuid.uuid4()
    user = User(
        id=uid,
        name="Second User",
        email=f"second_{uid.hex[:6]}@example.com",
        password_hash=hash_password("Password123!"),
        user_type="student",
        onboarding_complete=True,
        onboarding_step=5,
        timezone="Asia/Kolkata"
    )
    test_db.add(user)
    
    settings = UserSettings(user_id=uid, theme="dark", preferred_model="secondary")
    profile = UserBehaviouralProfile(
        user_id=uid,
        wake_time="08:00",
        sleep_time="00:00",
        chronotype="night_owl",
        daily_commitment_hrs=2.0
    )
    test_db.add(settings)
    test_db.add(profile)
    
    await test_db.flush()
    await test_db.commit()
    
    token = create_access_token(user.id, user.email)
    return user, token

@pytest_asyncio.fixture(scope="function")
async def redis_client():
    """Mock redis client for rate limit tests when storage is memory://"""
    from unittest.mock import AsyncMock
    mock = AsyncMock()
    mock.flushdb = AsyncMock()
    return mock

# ── Standalone Unit Test Helpers ───────────────────────────

def make_user(**overrides):
    """Create a fake user object (SimpleNamespace) for unit tests."""
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
    """Create a fake goal object (SimpleNamespace) for unit tests."""
    from datetime import date
    defaults = {
        "id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "title": "Test Goal",
        "description": "Test Description",
        "goal_type": "exam",
        "status": "active",
        "priority_rank": 1,
        "pre_pause_rank": None,
        "target_date": date.today() + timedelta(days=30),
        "motivation": "Test motivation",
        "consequence": "Test consequence",
        "success_metric": "Test metric",
        "goal_metadata": {"subjects": ["math"], "weak_subjects": ["math"], "strong_subjects": []},
        "deleted_at": None,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class FakeDB:
    """Minimal fake async DB session for local unit tests."""
    def __init__(self, select_results=None):
        self._results = list(select_results or [])
        self.added = []
    async def execute(self, _stmt):
        value = self._results.pop(0) if self._results else None
        return _FakeResult(value)
    def add(self, obj):
        self.added.append(obj)
    async def flush(self):
        for obj in getattr(self, "added", []):
            if hasattr(obj, "id") and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())
    async def commit(self): pass
    async def rollback(self): pass
    def begin_nested(self):
        class _Nested:
            async def __aenter__(self): return self
            async def __aexit__(self, *args): pass
        return _Nested()

class _FakeResult:
    def __init__(self, value):
        self._value = value
    def scalar_one_or_none(self): return self._value
    def scalar(self): return self._value
    def scalars(self):
        return self
    def all(self):
        if isinstance(self._value, list):
            return self._value
        return [self._value] if self._value else []
