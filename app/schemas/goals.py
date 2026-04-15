import uuid
from typing import Optional, List
from pydantic import BaseModel, field_validator
import re


class GoalCreateRequest(BaseModel):
    """Create a new goal."""
    title: str
    goal_type: str
    description: Optional[str] = None
    target_date: str        # "YYYY-MM-DD"
    motivation: Optional[str] = None
    consequence: Optional[str] = None
    success_metric: Optional[str] = None
    metadata: Optional[dict] = None

    @field_validator("goal_type")
    @classmethod
    def valid_goal_type(cls, v: str) -> str:
        allowed = {"exam", "fitness", "skill", "project", "habit", "other"}
        if v not in allowed:
            raise ValueError(f"goal_type must be one of: {allowed}")
        return v

    @field_validator("target_date")
    @classmethod
    def valid_future_date(cls, v: str) -> str:
        from datetime import date
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("target_date must be in YYYY-MM-DD format")
        try:
            target = date.fromisoformat(v)
        except ValueError:
            raise ValueError("Invalid date")
        if target <= date.today():
            raise ValueError("target_date must be in the future")
        return v

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Goal title must be at least 3 characters")
        return v


class GoalUpdateRequest(BaseModel):
    """Update an existing goal."""
    title: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[str] = None
    motivation: Optional[str] = None
    consequence: Optional[str] = None
    success_metric: Optional[str] = None
    metadata: Optional[dict] = None

    @field_validator("target_date")
    @classmethod
    def valid_future_date(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        from datetime import date
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("target_date must be in YYYY-MM-DD format")
        try:
            target = date.fromisoformat(v)
        except ValueError:
            raise ValueError("Invalid date")
        if target <= date.today():
            raise ValueError("target_date must be in the future")
        return v

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if len(v) < 3:
                raise ValueError("Goal title must be at least 3 characters")
        return v


class GoalDetailResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    goal_type: str
    description: Optional[str]
    target_date: str
    motivation: Optional[str]
    consequence: Optional[str]
    success_metric: Optional[str]
    status: str
    metadata: Optional[dict] = None
    progress_pct: Optional[float] = None
    tasks_completed: Optional[int] = None
    tasks_total: Optional[int] = None
    days_remaining: Optional[int] = None
    # Multi-goal rank (Commit 3)
    priority_rank: Optional[int] = None
    pre_pause_rank: Optional[int] = None

    model_config = {"from_attributes": True}

    @field_validator("target_date", mode="before")
    @classmethod
    def date_to_string(cls, v):
        from datetime import date
        if isinstance(v, date):
            return v.isoformat()
        return str(v)


class GoalStatusUpdateRequest(BaseModel):
    """Update a goal's status (lifecycle transition)."""
    status: str

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        # 'active' is now allowed here for resume (multi-goal)
        allowed = {"active", "paused", "achieved", "abandoned"}
        if v not in allowed:
            raise ValueError(
                f"status must be one of: {', '.join(sorted(allowed))}."
            )
        return v


class GoalReorderRequest(BaseModel):
    """Reorder active goals by providing the desired order of goal IDs."""
    goal_ids: List[uuid.UUID]

    @field_validator("goal_ids")
    @classmethod
    def at_least_one(cls, v: List[uuid.UUID]) -> List[uuid.UUID]:
        if len(v) == 0:
            raise ValueError("Must provide at least one goal_id")
        if len(v) > 3:
            raise ValueError("Cannot have more than 3 active goals")
        return v


class GoalListResponse(BaseModel):
    """List of all goals with summary."""
    goals: List[GoalDetailResponse]
    total: int
    active_count: int
