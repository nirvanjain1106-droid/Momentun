"""
Pydantic schemas for Recurring Task Rules — Sprint 7

I47: days_of_week uses Python weekday() semantics (0=Mon..6=Sun).
API may accept ISO 8601 (1=Mon..7=Sun) and convert at the boundary.
Uniqueness + range validated here; DB trigger provides defense-in-depth (P2#6).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field, field_validator


class RecurringRuleBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    task_type: str = Field(..., pattern=r"^(study|practice|review|exercise|reading|deep_study|light_review|admin|other)$")
    duration_mins: int = Field(..., ge=5, le=480)
    priority: int = Field(default=3, ge=1, le=5)
    # I44: Python weekday() — 0=Mon..6=Sun
    days_of_week: List[int] = Field(..., min_length=1, max_length=7)
    # v2 placeholder: scheduled_start. Not used in solver v1.
    scheduled_start: Optional[str] = Field(
        default=None,
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
        description="HH:MM format. v2 placeholder — not used in solver v1.",
    )
    max_per_day: int = Field(default=1, ge=1, le=1, description="v1 hardcoded to 1 (§9c)")

    @field_validator("days_of_week")
    @classmethod
    def validate_days_of_week(cls, v: List[int]) -> List[int]:
        """I47: Enforce unique, sorted values in 0-6 range (Python weekday())."""
        for day in v:
            if day < 0 or day > 6:
                raise ValueError(
                    f"days_of_week values must be 0-6 (Python weekday), got {day}"
                )
        unique_sorted = sorted(set(v))
        if len(unique_sorted) != len(v):
            raise ValueError(
                "days_of_week must contain unique values"
            )
        return unique_sorted


class RecurringRuleCreate(RecurringRuleBase):
    goal_id: uuid.UUID


class RecurringRuleUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    task_type: Optional[str] = Field(
        default=None,
        pattern=r"^(study|practice|review|exercise|reading|deep_study|light_review|admin|other)$",
    )
    duration_mins: Optional[int] = Field(default=None, ge=5, le=480)
    priority: Optional[int] = Field(default=None, ge=1, le=5)
    days_of_week: Optional[List[int]] = Field(default=None, min_length=1, max_length=7)
    scheduled_start: Optional[str] = Field(
        default=None,
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
    )
    is_active: Optional[bool] = None

    @field_validator("days_of_week")
    @classmethod
    def validate_days_of_week(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is None:
            return v
        for day in v:
            if day < 0 or day > 6:
                raise ValueError(f"days_of_week values must be 0-6, got {day}")
        unique_sorted = sorted(set(v))
        if len(unique_sorted) != len(v):
            raise ValueError("days_of_week must contain unique values")
        return unique_sorted


class RecurringRuleResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    goal_id: uuid.UUID
    title: str
    task_type: str
    duration_mins: int
    priority: int
    days_of_week: List[int]
    scheduled_start: Optional[str]
    is_active: bool
    max_per_day: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
