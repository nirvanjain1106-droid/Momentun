import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.core.security import decode_token
from app.models.user import User

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """
    Validates Bearer token and returns the current user.
    Fix #2 — eagerly loads user_settings to prevent MissingGreenlet error
    when accessing user.user_settings.preferred_model in schedule_service.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    payload = decode_token(token)

    if payload is None:
        raise credentials_exception

    if payload.get("type") != "access":
        raise credentials_exception

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise credentials_exception

    # Fix #2 — selectinload user_settings so it's available without lazy load
    result = await db.execute(
        select(User)
        .options(selectinload(User.user_settings))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


async def get_current_user_from_cookie(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Auth dependency for SSE endpoints.
    EventSource can't set Authorization headers, so we read from:
    1. Cookie: 'access_token' (set at login alongside refresh_token)
    2. Query param: '?token=' (fallback for clients that can't set cookies)
    """
    token = request.cookies.get("access_token")
    if not token:
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="SSE authentication required — no token in cookie or query param",
        )

    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        )

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await db.execute(
        select(User)
        .options(selectinload(User.user_settings))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user

async def get_current_user_onboarding_complete(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not current_user.onboarding_complete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please complete onboarding before accessing this feature",
        )
    return current_user


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentUserComplete = Annotated[User, Depends(get_current_user_onboarding_complete)]
DB = Annotated[AsyncSession, Depends(get_db)]
