import uuid
from typing import Optional

from fastapi import APIRouter, Query, Request

from app.config import settings
from app.core.rate_limit import limiter
from app.core.dependencies import CurrentUserComplete, DB
from app.schemas.insights import (
    PatternsResponse,
    TrajectoryResponse,
    WeeklyInsightsResponse,
    StreakResponse,
    HeatmapResponse,
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
        "post-bad-day collapse, subject avoidance, overload triggers, golden hour. "
        "Requires at least 2 weeks of daily logs for reliable patterns."
    ),
)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
async def get_patterns(
    request: Request,
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
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
async def get_trajectory(
    request: Request,
    current_user: CurrentUserComplete,
    db: DB,
    goal_id: Optional[uuid.UUID] = Query(None, description="Optional specific goal ID"),
) -> TrajectoryResponse:
    return await insights_service.get_trajectory(current_user, db, goal_id)


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
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
async def get_weekly_insights(
    request: Request,
    current_user: CurrentUserComplete,
    db: DB,
    week_start: Optional[str] = Query(
        default=None,
        description="Optional Monday date in YYYY-MM-DD format",
    ),
) -> WeeklyInsightsResponse:
    return await insights_service.get_weekly_insights(current_user, db, week_start)


@router.get(
    "/streak",
    response_model=StreakResponse,
    summary="Get current streak",
    description="Returns current streak and best streak info.",
)
async def get_streak(
    current_user: CurrentUserComplete,
    db: DB,
) -> StreakResponse:
    return await insights_service.get_streak(current_user, db)


@router.get(
    "/heatmap",
    response_model=HeatmapResponse,
    summary="Get activity heatmap",
    description=(
        "GitHub-style contribution heatmap data. "
        "Default 90 days. Use ?days=30 for a shorter view."
    ),
)
async def get_heatmap(
    current_user: CurrentUserComplete,
    db: DB,
    days: int = Query(default=90, ge=7, le=365, description="Number of days"),
) -> HeatmapResponse:
    return await insights_service.get_heatmap(current_user, db, days)
