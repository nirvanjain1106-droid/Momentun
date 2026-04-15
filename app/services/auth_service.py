import uuid
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.user import User, NotificationSettings, UserSettings
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    EmailVerificationResponse,
    MessageResponse,
)
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    create_email_verification_token,
    create_password_reset_token,
    decode_token,
)
from app.core.email import send_verification_email, send_password_reset_email

logger = logging.getLogger(__name__)
DUMMY_PASSWORD_HASH = "$2b$12$wli3xY5XI7V3xjIZ3Qw2AOm9mN67MM9YuPusSsUNnN7DTHt2fMCT."


async def register_user(data: RegisterRequest, db: AsyncSession) -> tuple[TokenResponse, str]:
    """
    Create a new user account.
    Returns JWT tokens immediately so the user can proceed to onboarding.
    Sends a verification email in the background.
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
        email_verified=False,
    )
    db.add(user)
    await db.flush()
    logger.info("user_registered", extra={"user_id": str(user.id)})

    db.add(NotificationSettings(user_id=user.id))
    db.add(UserSettings(user_id=user.id))
    await db.flush()

    # Send verification email (non-blocking — failure doesn't break registration)
    try:
        token = create_email_verification_token(user.id)
        send_verification_email(user.email, token)
    except Exception:
        logger.exception("verification_email_send_failed", extra={"user_id": str(user.id)})

    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id)

    response = TokenResponse(
        access_token=access_token,
        user_id=user.id,
        onboarding_complete=user.onboarding_complete,
        onboarding_step=user.onboarding_step,
    )
    return response, refresh_token


async def login_user(data: LoginRequest, db: AsyncSession) -> tuple[TokenResponse, str]:
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

    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id)

    response = TokenResponse(
        access_token=access_token,
        user_id=user.id,
        onboarding_complete=user.onboarding_complete,
        onboarding_step=user.onboarding_step,
    )
    return response, refresh_token


async def refresh_access_token(refresh_token: str, db: AsyncSession) -> dict:
    """Validate refresh token and issue a new access token."""
    payload = decode_token(refresh_token)

    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

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


# ── Email Verification ───────────────────────────────────────


async def verify_email(token: str, db: AsyncSession) -> EmailVerificationResponse:
    """Validate email verification token and mark user as verified."""
    payload = decode_token(token)

    if payload is None or payload.get("type") != "email_verify":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.email_verified:
        return EmailVerificationResponse(
            message="Email already verified",
            email_verified=True,
        )

    user.email_verified = True
    user.email_verified_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info("email_verified", extra={"user_id": str(user.id)})

    return EmailVerificationResponse(
        message="Email verified successfully",
        email_verified=True,
    )


# ── Password Reset ───────────────────────────────────────────


async def request_password_reset(email: str, db: AsyncSession) -> MessageResponse:
    """
    Request a password reset email.
    Always returns success to prevent email enumeration attacks.
    """
    result = await db.execute(
        select(User).where(User.email == email.lower())
    )
    user = result.scalar_one_or_none()

    if user:
        try:
            token = create_password_reset_token(user.id)
            send_password_reset_email(user.email, token)
            logger.info("password_reset_requested", extra={"user_id": str(user.id)})
        except Exception:
            logger.exception("password_reset_email_failed", extra={"user_id": str(user.id)})

    # Always return success to prevent email enumeration
    return MessageResponse(
        message="If an account with that email exists, a password reset link has been sent.",
    )


async def confirm_password_reset(
    token: str, new_password: str, db: AsyncSession
) -> MessageResponse:
    """Validate reset token and update the user's password."""
    payload = decode_token(token)

    if payload is None or payload.get("type") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.password_hash = hash_password(new_password)
    await db.flush()
    logger.info("password_reset_complete", extra={"user_id": str(user.id)})

    return MessageResponse(message="Password has been reset successfully")


# ── Logout ────────────────────────────────────────────────────


async def logout() -> MessageResponse:
    """
    Logout endpoint.
    Client-side token discard — the client should delete stored tokens.
    For full server-side revocation, a token blacklist (Redis) is recommended.
    """
    return MessageResponse(message="Logged out successfully. Please discard your tokens.")
