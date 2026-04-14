import uuid  # Fix #3 — moved from inside function body to top-level
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.user import User, NotificationSettings, UserSettings
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)

logger = logging.getLogger(__name__)
DUMMY_PASSWORD_HASH = "$2b$12$wli3xY5XI7V3xjIZ3Qw2AOm9mN67MM9YuPusSsUNnN7DTHt2fMCT."


async def register_user(data: RegisterRequest, db: AsyncSession) -> TokenResponse:
    """
    Create a new user account.
    Returns JWT tokens immediately so the user can proceed to onboarding.
    """
    result = await db.execute(
        select(User).where(User.email == data.email.lower())
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        name=data.name.strip(),
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        user_type=data.user_type,
        onboarding_complete=False,
        onboarding_step=1,
    )
    db.add(user)
    await db.flush()
    logger.info("user_registered", extra={"user_id": str(user.id)})

    db.add(NotificationSettings(user_id=user.id))
    db.add(UserSettings(user_id=user.id))
    await db.flush()

    access_token  = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        onboarding_complete=user.onboarding_complete,
        onboarding_step=user.onboarding_step,
    )


async def login_user(data: LoginRequest, db: AsyncSession) -> TokenResponse:
    """
    Authenticate user.
    Timing-attack-safe: always runs verify_password even when user not found.
    """
    result = await db.execute(
        select(User).where(User.email == data.email.lower())
    )
    user = result.scalar_one_or_none()

    password_correct = verify_password(
        data.password,
        user.password_hash if user else DUMMY_PASSWORD_HASH,
    )

    if not user or not password_correct:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    logger.info("user_login_success", extra={"user_id": str(user.id)})

    access_token  = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        onboarding_complete=user.onboarding_complete,
        onboarding_step=user.onboarding_step,
    )


async def refresh_access_token(refresh_token: str, db: AsyncSession) -> dict:
    """Validate refresh token and issue a new access token."""
    payload = decode_token(refresh_token)

    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Fix #3 — uuid is now imported at top of file
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return {
        "access_token": create_access_token(user.id, user.email),
        "token_type": "bearer",
    }
