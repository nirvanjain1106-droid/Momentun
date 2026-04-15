import uuid
from typing import Optional, List
from pydantic import BaseModel, field_validator
import re



class GenerateScheduleRequest(BaseModel):
    target_date: Optional[str] = None
    day_type: Optional[str] = "standard"
    use_llm: bool = True

    @field_validator("target_date")
    @classmethod
    def valid_date(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("target_date must be in YYYY-MM-DD format")
        return v

    @field_validator("day_type")
    @classmethod
    def valid_day_type(cls, v: Optional[str]) -> Optional[str]:
        allowed = {
            "standard", "stretch", "minimum_viable",
            "recovery", "compressed", None
        }
        if v not in allowed:
            raise ValueError(f"day_type must be one of: {allowed}")
        return v


class TaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str]
    task_type: str
    scheduled_start: Optional[str]
    scheduled_end: Optional[str]
    duration_mins: int
    energy_required: str
    priority: int
    priority_label: str           # "Core" | "Normal" | "Bonus"
    is_mvp_task: bool
    sequence_order: int
    task_status: str              # "active" | "deferred" | "completed" | "parked"
    slot_reasons: Optional[List[str]] = None   # Why this time slot was chosen

    model_config = {"from_attributes": True}


class ParkedTaskResponse(BaseModel):
    """
    Fix #7 — tasks the solver couldn't fit today.
    Shown to user as "Parking Lot" items.
    """
    id: uuid.UUID
    title: str
    task_type: str
    duration_mins: int
    energy_required: str
    priority: int
    priority_label: str
    task_status: str

    model_config = {"from_attributes": True}


class ScheduleResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    schedule_date: str
    day_type: str
    day_type_reason: Optional[str]
    strategy_note: Optional[str]
    tasks: List[TaskResponse]
    parked_tasks: List[ParkedTaskResponse]   # Fix #7 — previously hidden
    total_tasks: int
    total_study_mins: int
    day_capacity_hrs: float
    recovery_mode: bool = False      # True when returning after missed days
    is_paused: bool = False          # True when user is in sick/vacation mode

    model_config = {"from_attributes": True}

    @field_validator("schedule_date", mode="before")
    @classmethod
    def date_to_string(cls, v) -> str:
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)


class WeekScheduleResponse(BaseModel):
    week_start_date: str
    week_end_date: str
    week_theme: Optional[str]
    strategy_note: Optional[str]
    days: List[ScheduleResponse]
    days_generated: int
