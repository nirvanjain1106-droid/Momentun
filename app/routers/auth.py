from fastapi import APIRouter, Query, Request, Response, HTTPException, status
from app.config import settings
from app.core.rate_limit import limiter
from app.core.dependencies import CurrentUser, DB
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    AccessTokenResponse,
    PasswordResetRequest,
    PasswordResetConfirm,
    EmailVerificationResponse,
    LogoutResponse,
    MessageResponse,
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
        "The user can then proceed to onboarding with the access token. "
        "A verification email is sent automatically."
    ),
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def register(request: Request, response: Response, data: RegisterRequest, db: DB) -> TokenResponse:
    auth_response, refresh_token = await auth_service.register_user(data, db)
    _secure = settings.APP_ENV == "production"
    response.set_cookie(
        key="access_token",
        value=auth_response.access_token,
        httponly=True,
        secure=_secure,
        samesite="lax",
        path="/api/v1",
        max_age=1800,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=_secure,
        samesite="lax",
        path="/api/v1",
        max_age=604800,
    )
    return auth_response


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email and password",
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def login(request: Request, response: Response, data: LoginRequest, db: DB) -> TokenResponse:
    auth_response, refresh_token = await auth_service.login_user(data, db)
    _secure = settings.APP_ENV == "production"
    response.set_cookie(
        key="access_token",
        value=auth_response.access_token,
        httponly=True,
        secure=_secure,
        samesite="lax",
        path="/api/v1",
        max_age=1800,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=_secure,
        samesite="lax",
        path="/api/v1",
        max_age=604800,
    )
    return auth_response


@router.post(
    "/refresh",
    response_model=AccessTokenResponse,
    summary="Get a new access token using refresh token",
    description=(
        "Provide a valid refresh token to receive a new short-lived access token. "
        "Use this when the access token expires (every 30 minutes)."
    ),
)
async def refresh(request: Request, response: Response, db: DB, data: RefreshRequest | None = None) -> AccessTokenResponse:
    # Relaxed content-type check — axios may omit Content-Type on empty-body POSTs
    content_type = request.headers.get("content-type", "")
    if content_type and "application/json" not in content_type and "application/x-www-form-urlencoded" not in content_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Content-Type must be application/json",
        )
        
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing in cookies",
        )

    result = await auth_service.refresh_access_token(refresh_token, db)
    _secure = settings.APP_ENV == "production"

    response.set_cookie(
        key="access_token",
        value=result["access_token"],
        httponly=True,
        secure=_secure,
        samesite="lax",
        path="/api/v1",
        max_age=1800,
    )
    
    if result.get("new_refresh_token"):
        response.set_cookie(
            key="refresh_token",
            value=result["new_refresh_token"],
            httponly=True,
            secure=_secure,
            samesite="lax",
            path="/api/v1",
            max_age=604800,
        )

    return AccessTokenResponse(
        access_token=result["access_token"],
        token_type="bearer"
    )


@router.get(
    "/verify-email",
    response_model=EmailVerificationResponse,
    summary="Verify email address",
    description=(
        "Verify your email using the token sent to your inbox. "
        "The token is valid for 24 hours."
    ),
)
async def verify_email(
    token: str = Query(..., description="Verification token from email"),
    db: DB = None,  # type: ignore[assignment]
) -> EmailVerificationResponse:
    assert db is not None
    return await auth_service.verify_email(token, db)


@router.post(
    "/password-reset/request",
    response_model=MessageResponse,
    summary="Request password reset",
    description=(
        "Send a password reset link to the provided email. "
        "Always returns success to prevent email enumeration."
    ),
)
@limiter.limit("5/minute")
async def request_password_reset(
    request: Request, data: PasswordResetRequest, db: DB
) -> MessageResponse:
    return await auth_service.request_password_reset(data.email, db)


@router.post(
    "/password-reset/confirm",
    response_model=MessageResponse,
    summary="Confirm password reset",
    description="Reset your password using the token from the reset email.",
)
async def confirm_password_reset(
    data: PasswordResetConfirm, db: DB
) -> MessageResponse:
    return await auth_service.confirm_password_reset(data.token, data.new_password, db)


@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Logout",
    description=(
        "Logout and discard tokens. "
        "The client should delete any stored access and refresh tokens."
    ),
)
async def logout(request: Request, response: Response, db: DB, current_user: CurrentUser) -> LogoutResponse:
    refresh_token = request.cookies.get("refresh_token") or ""
    result = await auth_service.logout(refresh_token, db)
    _secure = settings.APP_ENV == "production"
    response.set_cookie(
        key="access_token",
        value="",
        httponly=True,
        secure=_secure,
        samesite="lax",
        path="/api/v1",
        max_age=0,
    )
    response.set_cookie(
        key="refresh_token",
        value="",
        httponly=True,
        secure=_secure,
        samesite="lax",
        path="/api/v1",
        max_age=0,
    )
    return LogoutResponse(message=result.message)
