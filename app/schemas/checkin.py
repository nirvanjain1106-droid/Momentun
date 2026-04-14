import uuid
from typing import Optional, List
from pydantic import BaseModel, field_validator


class MorningCheckinRequest(BaseModel):
    morning_energy: str
    yesterday_rating: str
    surprise_event: Optional[str] = "none"
    surprise_note: Optional[str] = None

    @field_validator("morning_energy")
    @classmethod
    def valid_energy(cls, v: str) -> str:
        allowed = {"high", "medium", "low", "exhausted"}
        if v not in allowed:
            raise ValueError(f"morning_energy must be one of: {allowed}")
        return v

    @field_validator("yesterday_rating")
    @classmethod
    def valid_rating(cls, v: str) -> str:
        allowed = {"crushed_it", "decent", "rough", "barely_survived"}
        if v not in allowed:
            raise ValueError(f"yesterday_rating must be one of: {allowed}")
        return v

    @field_validator("surprise_event")
    @classmethod
    def valid_event(cls, v: Optional[str]) -> Optional[str]:
        allowed = {
            "none", "family_event", "sick", "college_extra",
            "power_cut", "travel", "other", None
        }
        if v not in allowed:
            raise ValueError(f"surprise_event must be one of: {allowed}")
        return v


class MorningCheckinResponse(BaseModel):
    log_id: uuid.UUID
    log_date: str
    morning_energy: str
    yesterday_rating: str
    surprise_event: Optional[str]
    day_type_assigned: str
    message: str          # human readable explanation of today's plan

    @field_validator("log_date", mode="before")
    @classmethod
    def date_to_string(cls, v) -> str:
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)

    model_config = {"from_attributes": True}


class TaskCompletionUpdate(BaseModel):
    task_id: uuid.UUID
    status: str
    skip_reason: Optional[str] = None
    actual_duration_mins: Optional[int] = None
    quality_rating: Optional[int] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        allowed = {"completed", "partial", "skipped", "rescheduled"}
        if v not in allowed:
            raise ValueError(f"status must be one of: {allowed}")
        return v

    @field_validator("skip_reason")
    @classmethod
    def valid_skip_reason(cls, v: Optional[str]) -> Optional[str]:
        allowed = {
            "too_tired", "no_time", "lost_motivation", "forgot",
            "sick", "emergency", "chose_something_else", None
        }
        if v not in allowed:
            raise ValueError(f"skip_reason must be one of: {allowed}")
        return v

    @field_validator("quality_rating")
    @classmethod
    def valid_quality(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v not in range(1, 6):
            raise ValueError("quality_rating must be between 1 and 5")
        return v


class EveningReviewRequest(BaseModel):
    task_completions: List[TaskCompletionUpdate]
    mood_score: int
    evening_note: Optional[str] = None

    @field_validator("mood_score")
    @classmethod
    def valid_mood(cls, v: int) -> int:
        if v not in range(1, 6):
            raise ValueError("mood_score must be between 1 and 5")
        return v


class EveningReviewResponse(BaseModel):
    log_id: uuid.UUID
    log_date: str
    tasks_scheduled: int
    tasks_completed: int
    completion_rate: float
    mood_score: int
    message: str          # motivational/informational message

    @field_validator("log_date", mode="before")
    @classmethod
    def date_to_string(cls, v) -> str:
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)

    model_config = {"from_attributes": True}
