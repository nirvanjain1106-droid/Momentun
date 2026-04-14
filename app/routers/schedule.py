from typing import Optional
from fastapi import APIRouter, Query, Request
from app.core.dependencies import CurrentUserComplete, DB
from app.config import settings
from app.core.rate_limit import limiter
from app.schemas.schedule import (
    GenerateScheduleRequest,
    ScheduleResponse,
    WeekScheduleResponse,
)
from app.services import schedule_service

router = APIRouter(prefix="/schedule", tags=["Schedule"])


@router.post(
    "/generate",
    response_model=ScheduleResponse,
    status_code=201,
    summary="Generate a schedule for a specific date",
    description=(
        "Runs the constraint solver + LLM enrichment to generate a daily schedule. "
        "If a schedule already exists for that date, returns the existing one. "
        "Set use_llm=false for faster generation without AI descriptions."
    ),
)
@limiter.limit(settings.RATE_LIMIT_SCHEDULE)
async def generate_schedule(
    request: Request,
    data: GenerateScheduleRequest,
    current_user: CurrentUserComplete,
    db: DB,
) -> ScheduleResponse:
    return await schedule_service.generate_schedule(current_user, data, db)


@router.get(
    "/today",
    response_model=ScheduleResponse,
    summary="Get today's schedule",
    description=(
        "Returns today's schedule. "
        "Auto-generates it if it doesn't exist yet."
    ),
)
async def get_today(
    current_user: CurrentUserComplete,
    db: DB,
) -> ScheduleResponse:
    return await schedule_service.get_today_schedule(current_user, db)


@router.get(
    "/week",
    response_model=WeekScheduleResponse,
    summary="Get full week schedule",
    description=(
        "Returns the schedule for an entire week (Mon-Sun). "
        "Generates any missing days automatically. "
        "Optionally provide week_start (YYYY-MM-DD) for a specific week, "
        "otherwise returns the current week."
    ),
)
async def get_week(
    current_user: CurrentUserComplete,
    db: DB,
    week_start: Optional[str] = Query(
        default=None,
        description="Week start date in YYYY-MM-DD format (must be a Monday)",
    ),
) -> WeekScheduleResponse:
    return await schedule_service.get_week_schedule(current_user, db, week_start)


@router.post(
    "/regenerate",
    response_model=ScheduleResponse,
    summary="Regenerate today's schedule",
    description=(
        "Re-run the constraint solver for today. "
        "Use when the day has gone off-plan (tasks parked, surprise events). "
        "Already-completed tasks are preserved. "
        "Replaces the current schedule with a fresh one."
    ),
)
@limiter.limit(settings.RATE_LIMIT_SCHEDULE)
async def regenerate_schedule(
    request: Request,
    current_user: CurrentUserComplete,
    db: DB,
) -> ScheduleResponse:
    return await schedule_service.regenerate_today_schedule(current_user, db)

