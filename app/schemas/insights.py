import uuid
from typing import Any, Optional, List

from pydantic import BaseModel, field_validator


class PatternResponse(BaseModel):
    pattern_type: str
    severity: str
    insight: str
    fix: str
    supporting_data: Optional[dict[str, Any]] = None


class PatternsResponse(BaseModel):
    patterns: List[PatternResponse]
    total_active: int


class SubjectTrajectoryResponse(BaseModel):
    subject: str
    status: str
    completed_mins: int
    target_mins_by_now: int
    target_mins_by_deadline: int
    gap_mins: int
    extra_mins_per_day_needed: int


class TrajectoryResponse(BaseModel):
    goal_id: uuid.UUID
    goal_title: str
    goal_type: str
    status: str
    projection: str
    days_remaining: int
    elapsed_days: int
    completed_study_mins: int
    expected_study_mins_by_now: int
    projected_total_mins_by_deadline: int
    target_total_mins_by_deadline: int
    current_pace_mins_per_day: float
    required_pace_mins_per_day: float
    extra_mins_per_day_needed: int
    subject_breakdown: List[SubjectTrajectoryResponse]
    motivational_nudge: str


class WeeklyDayInsightResponse(BaseModel):
    log_date: str
    weekday: str
    tasks_scheduled: int
    tasks_completed: int
    completion_rate: Optional[float]
    mood_score: Optional[int]

    @field_validator("log_date", mode="before")
    @classmethod
    def date_to_string(cls, value) -> str:
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return str(value)


class WeeklyInsightsResponse(BaseModel):
    week_start_date: str
    week_end_date: str
    tasks_scheduled: int
    tasks_completed: int
    completion_rate: float
    average_mood: Optional[float]
    best_day: Optional[str]
    toughest_day: Optional[str]
    coaching_note: str
    motivational_nudge: str
    patterns: List[PatternResponse]
    day_breakdown: List[WeeklyDayInsightResponse]
    trajectory: TrajectoryResponse

    @field_validator("week_start_date", "week_end_date", mode="before")
    @classmethod
    def week_date_to_string(cls, value) -> str:
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return str(value)
