from typing import List

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUser, DB
from app.schemas.onboarding import (
    AcademicProfileRequest,
    AcademicProfileResponse,
    BehaviouralProfileRequest,
    BehaviouralProfileResponse,
    FixedBlocksRequest,
    FixedBlockResponse,
    GoalRequest,
    GoalResponse,
    HealthProfileRequest,
    HealthProfileResponse,
    OnboardingStatusResponse,
)
from app.services import onboarding_service

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])


@router.get(
    "/status",
    response_model=OnboardingStatusResponse,
    summary="Get current onboarding status",
    description=(
        "Returns which onboarding steps are complete and which step to go to next. "
        "Use this to resume onboarding if the user leaves mid-way."
    ),
)
async def get_status(current_user: CurrentUser, db: DB) -> OnboardingStatusResponse:
    return await onboarding_service.get_onboarding_status(current_user, db)


@router.post(
    "/academic-profile",
    response_model=AcademicProfileResponse,
    status_code=201,
    summary="Save academic profile (Step 2)",
    description=(
        "Submit college and course details. "
        "For student_intern users, internship details are also required. "
        "This endpoint is idempotent — calling it again updates the existing profile."
    ),
)
async def save_academic_profile(
    data: AcademicProfileRequest,
    current_user: CurrentUser,
    db: DB,
) -> AcademicProfileResponse:
    return await onboarding_service.save_academic_profile(current_user, data, db)


@router.post(
    "/health-profile",
    response_model=HealthProfileResponse,
    status_code=201,
    summary="Save health profile (Optional)",
    description=(
        "Submit scheduling-relevant health information. "
        "This step is optional but improves schedule quality. "
        "Can be submitted at any point, not just during initial onboarding."
    ),
)
async def save_health_profile(
    data: HealthProfileRequest,
    current_user: CurrentUser,
    db: DB,
) -> HealthProfileResponse:
    return await onboarding_service.save_health_profile(current_user, data, db)


@router.post(
    "/behavioural-profile",
    response_model=BehaviouralProfileResponse,
    status_code=201,
    summary="Save behavioural profile (Step 3)",
    description=(
        "Submit chronotype, wake/sleep times, and commitment data. "
        "This is the most important step — the scheduler uses this data "
        "to determine when to place tasks. "
        "Peak energy window is auto-derived from chronotype if not provided."
    ),
)
async def save_behavioural_profile(
    data: BehaviouralProfileRequest,
    current_user: CurrentUser,
    db: DB,
) -> BehaviouralProfileResponse:
    return await onboarding_service.save_behavioural_profile(current_user, data, db)


@router.post(
    "/fixed-blocks",
    response_model=List[FixedBlockResponse],
    status_code=201,
    summary="Save fixed time blocks (Step 4)",
    description=(
        "Submit all immovable daily commitments in one call — "
        "college hours, meals, sleep, travel, etc. "
        "The constraint solver uses these to determine available time windows. "
        "Set replace_existing=true to replace all existing blocks (use with caution)."
    ),
)
async def save_fixed_blocks(
    data: FixedBlocksRequest,
    current_user: CurrentUser,
    db: DB,
    replace_existing: bool = Query(
        default=False,
        description="If true, deletes all existing fixed blocks before saving",
    ),
) -> List[FixedBlockResponse]:
    return await onboarding_service.save_fixed_blocks(
        current_user, data, db, replace_existing
    )


@router.post(
    "/goal",
    response_model=GoalResponse,
    status_code=201,
    summary="Create first goal and complete onboarding (Step 5)",
    description=(
        "Create your first active goal. "
        "Only one active goal is allowed at a time. "
        "This is the final onboarding step — completing it marks onboarding as done "
        "and unlocks schedule generation."
    ),
)
async def create_first_goal(
    data: GoalRequest,
    current_user: CurrentUser,
    db: DB,
) -> GoalResponse:
    return await onboarding_service.save_first_goal(current_user, data, db)
