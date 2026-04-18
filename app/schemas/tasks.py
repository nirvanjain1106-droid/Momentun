"""Task management schemas — complete, park, reschedule, undo, bulk-delete."""

import uuid
from typing import Optional, List
from datetime import date as date_type

from pydantic import BaseModel, field_validator
import re

from app.schemas.users import DayScoreResponse
from app.schemas.insights import StreakResponse


class TaskCompleteRequest(BaseModel):
    """Mark a task as completed in real time."""
    actual_duration_mins: Optional[int] = None
    quality_rating: Optional[int] = None

    @field_validator("quality_rating")
    @classmethod
    def valid_quality(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v not in range(1, 6):
            raise ValueError("quality_rating must be between 1 and 5")
        return v

    @field_validator("actual_duration_mins")
    @classmethod
    def valid_duration(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v <= 0:
            raise ValueError("actual_duration_mins must be positive")
        return v


class TaskParkRequest(BaseModel):
    """Manually park a task (move to later)."""
    reason: Optional[str] = None

    @field_validator("reason")
    @classmethod
    def valid_reason(cls, v: Optional[str]) -> Optional[str]:
        allowed = {
            "too_tired", "no_time", "lost_motivation",
            "higher_priority", "reschedule_later", None
        }
        if v not in allowed:
            raise ValueError(f"reason must be one of: {allowed}")
        return v


class TaskRescheduleRequest(BaseModel):
    """Reschedule a parked task to a specific date."""
    task_id: uuid.UUID
    target_date: str

    @field_validator("target_date")
    @classmethod
    def valid_future_date(cls, v: str) -> str:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("target_date must be in YYYY-MM-DD format")
        try:
            target = date_type.fromisoformat(v)
        except ValueError:
            raise ValueError("Invalid date")
        if target < date_type.today():
            raise ValueError("target_date cannot be in the past")
        return v


class BulkDeleteRequest(BaseModel):
    """Bulk delete multiple tasks."""
    task_ids: List[uuid.UUID]

    @field_validator("task_ids")
    @classmethod
    def at_least_one(cls, v: List[uuid.UUID]) -> List[uuid.UUID]:
        if len(v) == 0:
            raise ValueError("Must provide at least one task_id")
        if len(v) > 50:
            raise ValueError("Cannot delete more than 50 tasks at once")
        return v


class TaskDetailResponse(BaseModel):
    """Full task detail with status and scheduling info."""
    id: uuid.UUID
    title: str
    description: Optional[str]
    task_type: str
    scheduled_start: Optional[str]
    scheduled_end: Optional[str]
    duration_mins: int
    energy_required: str
    priority: int
    priority_label: str
    is_mvp_task: bool
    sequence_order: int
    task_status: str
    previous_status: Optional[str] = None
    slot_reasons: Optional[List[str]] = None
    # Multi-goal context (Commit 3)
    goal_id: Optional[uuid.UUID] = None
    goal_rank_snapshot: Optional[int] = None

    model_config = {"from_attributes": True}

    @field_validator("priority_label", mode="before")
    @classmethod
    def derive_priority_label(cls, v, info):
        if v:
            return v
        priority = info.data.get("priority", 2)
        return {1: "Core", 2: "Normal", 3: "Bonus"}.get(priority, "Normal")


class ParkedTaskDetailResponse(BaseModel):
    """Parked task with staleness info."""
    id: uuid.UUID
    title: str
    description: Optional[str]
    task_type: str
    duration_mins: int
    energy_required: str
    priority: int
    priority_label: str
    task_status: str
    days_parked: int
    is_stale: bool
    created_at: str

    model_config = {"from_attributes": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def datetime_to_string(cls, v) -> str:
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)


class ParkedTasksListResponse(BaseModel):
    """List of parked/deferred tasks."""
    tasks: List[ParkedTaskDetailResponse]
    total: int
    stale_count: int


class BulkDeleteResponse(BaseModel):
    """Response after bulk delete."""
    deleted_count: int
    message: str


class QuickAddRequest(BaseModel):
    """Quick-capture: minimal task creation, straight to later."""
    title: str
    duration_mins: int = 30
    goal_id: Optional[uuid.UUID] = None

    @field_validator("title")
    @classmethod
    def valid_title(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Title must be at least 2 characters")
        if len(v) > 200:
            raise ValueError("Title must be at most 200 characters")
        return v

    @field_validator("duration_mins")
    @classmethod
    def valid_duration(cls, v: int) -> int:
        if v < 5 or v > 480:
            raise ValueError("Duration must be between 5 and 480 minutes")
        return v


class AdHocTaskRequest(BaseModel):
    """Create a task that isn't tied to a specific goal, fitted into today's schedule."""
    title: str
    duration_mins: int = 30
    energy_required: str = "medium"
    priority: int = 2
    description: Optional[str] = None
    task_type: str = "general"
    goal_id: Optional[uuid.UUID] = None

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: int) -> int:
        if v not in (2, 3):
            raise ValueError("Ad-hoc tasks must be priority 2 (Normal) or 3 (Bonus)")
        return v

    @field_validator("energy_required")
    @classmethod
    def valid_energy(cls, v: str) -> str:
        allowed = {"low", "medium", "high"}
        if v.lower() not in allowed:
            raise ValueError(f"energy_required must be one of: {allowed}")
        return v.lower()


class TaskMutationResponse(BaseModel):
    """Aggregate response returned after a task mutation."""
    task: TaskDetailResponse
    day_score: DayScoreResponse
    streak: StreakResponse
