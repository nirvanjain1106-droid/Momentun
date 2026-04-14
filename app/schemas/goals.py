import uuid
from typing import Optional
from pydantic import BaseModel, field_validator
import re


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

    model_config = {"from_attributes": True}

    @field_validator("target_date", mode="before")
    @classmethod
    def date_to_string(cls, v):
        from datetime import date
        if isinstance(v, date):
            return v.isoformat()
        return str(v)
