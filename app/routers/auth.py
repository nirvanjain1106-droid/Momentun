from fastapi import APIRouter, Request
from app.config import settings
from app.core.rate_limit import limiter
from app.core.dependencies import DB
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    AccessTokenResponse,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
    summary="Register a new account",
    description=(
        "Creates a new user account and returns JWT tokens immediately. "
        "The user can then proceed to onboarding with the access token."
    ),
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def register(request: Request, data: RegisterRequest, db: DB) -> TokenResponse:
    return await auth_service.register_user(data, db)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email and password",
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def login(request: Request, data: LoginRequest, db: DB) -> TokenResponse:
    return await auth_service.login_user(data, db)


@router.post(
    "/refresh",
    response_model=AccessTokenResponse,
    summary="Get a new access token using refresh token",
    description=(
        "Provide a valid refresh token to receive a new short-lived access token. "
        "Use this when the access token expires (every 30 minutes)."
    ),
)
async def refresh(data: RefreshRequest, db: DB) -> AccessTokenResponse:
    result = await auth_service.refresh_access_token(data.refresh_token, db)
    return AccessTokenResponse(**result)
