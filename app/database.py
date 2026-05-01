from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from app.config import settings


# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.APP_ENV == "development",
    pool_pre_ping=True,
    pool_size=20,          # Increased from 10 to 20 for standard operations
    max_overflow=10,       # Reduced from 20 to 10 to cap absolute max connections
)

# DL Dedicated Engine (I22)
# Strictly bounded, small pool reserved exclusively for dead-letter persistence.
# Prevents total connection exhaustion during massive batch failures.
dl_engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,           # Hard limit 5 connections
    max_overflow=5,        # Absolute max 10 total for DLs
)

# Session factories
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

DLSessionLocal = async_sessionmaker(
    bind=dl_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db() -> AsyncSession:
    """
    Dependency that provides a database session per request.
    Automatically closes session when request is done.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
