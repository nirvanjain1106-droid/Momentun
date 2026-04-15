"""User profile schemas — GET/PATCH /users/me, change password, pause/resume."""

import uuid
from typing import Optional, List

from pydantic import BaseModel, field_validator


class UserProfileResponse(BaseModel):
    """Full user profile for frontend settings page."""
    id: uuid.UUID
    name: str
    email: str
    user_type: str
    timezone: str
    onboarding_complete: bool
    onboarding_step: int
    email_verified: bool
    is_paused: bool
    paused_reason: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def datetime_to_string(cls, v) -> str:
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)


class UserProfileUpdateRequest(BaseModel):
    """Update user profile fields."""
    name: Optional[str] = None
    timezone: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if len(v) < 2:
                raise ValueError("Name must be at least 2 characters")
            if len(v) > 100:
                raise ValueError("Name must be at most 100 characters")
        return v

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        # Basic validation — check format
        if "/" not in v and v not in ("UTC", "GMT"):
            raise ValueError("timezone must be a valid IANA timezone (e.g. 'Asia/Kolkata', 'America/New_York')")
        return v


class ChangePasswordRequest(BaseModel):
    """Change password — requires current password."""
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("New password must be at least 8 characters")
        return v


class PauseRequest(BaseModel):
    """Activate sick mode / vacation freeze."""
    reason: str
    days: Optional[int] = None  # None = indefinite until resume

    @field_validator("reason")
    @classmethod
    def valid_reason(cls, v: str) -> str:
        allowed = {"sick", "vacation", "burnout", "personal", "other"}
        if v not in allowed:
            raise ValueError(f"reason must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("days")
    @classmethod
    def valid_days(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 1 or v > 30):
            raise ValueError("days must be between 1 and 30")
        return v


class FeedbackRequest(BaseModel):
    """User feedback / bug report."""
    feedback_type: str = "general"
    message: str
    screen_state: Optional[str] = None
    device_info: Optional[str] = None
    request_ids: Optional[List[str]] = None

    @field_validator("feedback_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        allowed = {"bug", "feature", "general", "schedule_quality"}
        if v not in allowed:
            raise ValueError(f"feedback_type must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("Feedback message must be at least 10 characters")
        if len(v) > 2000:
            raise ValueError("Feedback message must be at most 2000 characters")
        return v


class FeedbackResponse(BaseModel):
    id: uuid.UUID
    feedback_type: str
    message: str
    created_at: str

    model_config = {"from_attributes": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def datetime_to_string(cls, v) -> str:
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)


class MessageResponse(BaseModel):
    """Simple message response."""
    message: str


class DayScoreResponse(BaseModel):
    """Daily score breakdown."""
    date: str
    total_score: int  # 0-100
    completion_score: int
    timing_score: int
    core_tasks_score: int
    streak_bonus: int
    breakdown: dict
