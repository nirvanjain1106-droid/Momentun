from typing import Optional

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUserComplete, DB
from app.schemas.insights import (
    PatternsResponse,
    TrajectoryResponse,
    WeeklyInsightsResponse,
)
from app.services import insights_service

# Fix: consistent /insights prefix for all endpoints
router = APIRouter(prefix="/insights", tags=["Insights"])


@router.get(
    "/patterns",
    response_model=PatternsResponse,
    summary="Get active behaviour patterns",
    description=(
        "Returns detected behaviour patterns for the user: "
        "day-of-week avoidance, time decay, streak vulnerability, "
        "post-bad-day collapse, subject avoidance, overload triggers. "
        "Requires at least 2 weeks of daily logs for reliable patterns."
    ),
)
async def get_patterns(
    current_user: CurrentUserComplete,
    db: DB,
) -> PatternsResponse:
    return await insights_service.get_patterns(current_user, db)


@router.get(
    "/trajectory",
    response_model=TrajectoryResponse,
    summary="Get goal trajectory and pace projection",
    description=(
        "Calculates whether the active goal is on track at the current pace. "
        "Shows which subjects are behind, how much extra effort per day is needed, "
        "and projects the final outcome at current pace."
    ),
)
async def get_trajectory(
    current_user: CurrentUserComplete,
    db: DB,
) -> TrajectoryResponse:
    return await insights_service.get_trajectory(current_user, db)


@router.get(
    "/weekly",
    response_model=WeeklyInsightsResponse,
    summary="Get weekly performance report",
    description=(
        "Returns a full weekly report including: completion trends, "
        "best and toughest days, current active patterns, trajectory status, "
        "and a personalised coaching note. "
        "Optionally provide week_start (YYYY-MM-DD, must be a Monday) "
        "for a specific past week."
    ),
)
async def get_weekly_insights(
    current_user: CurrentUserComplete,
    db: DB,
    week_start: Optional[str] = Query(
        default=None,
        description="Optional Monday date in YYYY-MM-DD format",
    ),
) -> WeeklyInsightsResponse:
    return await insights_service.get_weekly_insights(current_user, db, week_start)
