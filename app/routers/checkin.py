from fastapi import APIRouter
from app.core.dependencies import CurrentUserComplete, DB
from app.schemas.checkin import (
    MorningCheckinRequest,
    MorningCheckinResponse,
    EveningReviewRequest,
    EveningReviewResponse,
)
from app.services import checkin_service

router = APIRouter(prefix="/checkin", tags=["Daily Check-in"])


@router.post(
    "/morning",
    response_model=MorningCheckinResponse,
    status_code=201,
    summary="Morning check-in (2 questions)",
    description=(
        "Submit your morning check-in — energy level and how yesterday went. "
        "This triggers automatic day type detection and schedule adjustment. "
        "Can only be submitted once per day."
    ),
)
async def morning_checkin(
    data: MorningCheckinRequest,
    current_user: CurrentUserComplete,
    db: DB,
) -> MorningCheckinResponse:
    return await checkin_service.morning_checkin(current_user, data, db)


@router.post(
    "/evening",
    response_model=EveningReviewResponse,
    status_code=201,
    summary="Evening review — log task completions",
    description=(
        "Submit your evening review with task completion status. "
        "This feeds the pattern engine and trajectory calculator. "
        "Can only be submitted once per day."
    ),
)
async def evening_review(
    data: EveningReviewRequest,
    current_user: CurrentUserComplete,
    db: DB,
) -> EveningReviewResponse:
    return await checkin_service.evening_review(current_user, data, db)
