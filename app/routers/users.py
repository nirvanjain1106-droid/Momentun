"""User profile, settings, pause/resume, feedback, account management."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Query, Request
from app.config import settings
from app.core.rate_limit import limiter
from app.core.dependencies import CurrentUser, CurrentUserComplete, DB
from app.schemas.users import (
    UserProfileResponse,
    UserProfileUpdateRequest,
    ChangePasswordRequest,
    PauseRequest,
    FeedbackRequest,
    FeedbackResponse,
    MessageResponse,
    DayScoreResponse,
)
from app.services import user_service

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current user profile",
    description="Returns the authenticated user's profile including timezone, pause status, and onboarding state.",
)
async def get_profile(current_user: CurrentUser) -> UserProfileResponse:
    return await user_service.get_profile(current_user)


@router.patch(
    "/me",
    response_model=UserProfileResponse,
    summary="Update profile",
    description="Update name and/or timezone. Only provided fields are updated.",
)
async def update_profile(
    data: UserProfileUpdateRequest,
    current_user: CurrentUser,
    db: DB,
) -> UserProfileResponse:
    return await user_service.update_profile(current_user, data, db)


@router.post(
    "/me/change-password",
    response_model=MessageResponse,
    summary="Change password",
    description="Change password in-app. Requires current password verification.",
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def change_password(
    request: Request,
    data: ChangePasswordRequest,
    current_user: CurrentUser,
    db: DB,
) -> MessageResponse:
    return await user_service.change_password(current_user, data, db)


@router.post(
    "/me/pause",
    response_model=UserProfileResponse,
    summary="Activate sick mode / vacation freeze",
    description=(
        "Pause your account. Goal deadlines are shifted forward. "
        "No schedules will be generated while paused. "
        "Pattern engine ignores paused days. "
        "Set 'days' for auto-resume, or leave empty for manual resume."
    ),
)
async def pause_account(
    data: PauseRequest,
    current_user: CurrentUser,
    db: DB,
) -> UserProfileResponse:
    return await user_service.pause_account(current_user, data, db)


@router.post(
    "/me/resume",
    response_model=UserProfileResponse,
    summary="Resume after pause",
    description="Deactivate sick mode. Goal deadlines shift by actual pause duration if indefinite.",
)
async def resume_account(
    current_user: CurrentUser,
    db: DB,
) -> UserProfileResponse:
    return await user_service.resume_account(current_user, db)


@router.post(
    "/me/feedback",
    response_model=FeedbackResponse,
    status_code=201,
    summary="Submit feedback or bug report",
    description=(
        "Submit feedback with optional screen state and device info. "
        "Include recent request IDs to help debug backend issues."
    ),
)
async def submit_feedback(
    data: FeedbackRequest,
    current_user: CurrentUser,
    db: DB,
) -> FeedbackResponse:
    return await user_service.submit_feedback(current_user, data, db)


@router.get(
    "/me/day-score",
    response_model=DayScoreResponse,
    summary="Get day score",
    description=(
        "Calculate today's holistic score (0-100). "
        "Components: completion rate, core tasks, timing, streak, mood."
    ),
)
async def get_day_score(
    current_user: CurrentUserComplete,
    db: DB,
    target_date: Optional[str] = Query(
        default=None,
        description="Date in YYYY-MM-DD format. Defaults to today.",
    ),
) -> DayScoreResponse:
    if target_date:
        dt = date.fromisoformat(target_date)
    else:
        from app.core.timezone import get_user_today
        dt = get_user_today(current_user.timezone)
    return await user_service.calculate_day_score(current_user.id, dt, db)


@router.get(
    "/me/export",
    summary="Export all user data",
    description="GDPR-compliant data export. Returns all your data as JSON.",
)
async def export_data(
    current_user: CurrentUser,
    db: DB,
) -> dict:
    return await user_service.export_user_data(current_user, db)


@router.delete(
    "/me",
    response_model=MessageResponse,
    summary="Delete account",
    description=(
        "Permanently delete your account and all associated data. "
        "This action cannot be undone."
    ),
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def delete_account(
    request: Request,
    current_user: CurrentUser,
    db: DB,
) -> MessageResponse:
    return await user_service.delete_account(current_user, db)
