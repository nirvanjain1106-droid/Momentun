import uuid
from datetime import date
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, field_validator, model_validator, Field
import re


# ─────────────────────────────────────────
# Academic Profile
# ─────────────────────────────────────────

class AcademicProfileRequest(BaseModel):
    college_name: str
    course_name: str
    course_duration: int           # years
    current_year: int
    current_semester: Optional[int] = None
    cgpa: Optional[Decimal] = None
    performance_self_rating: Optional[str] = None
    college_schedule_type: Optional[str] = None
    has_weekend_college: bool = False

    # Intern fields — only required if user_type is student_intern
    internship_company: Optional[str] = None
    internship_days: Optional[List[int]] = None
    internship_hours_per_day: Optional[int] = None

    @field_validator("course_duration")
    @classmethod
    def valid_duration(cls, v: int) -> int:
        if v not in (1, 2, 3, 4, 5, 6):
            raise ValueError("Course duration must be between 1 and 6 years")
        return v

    @field_validator("current_year")
    @classmethod
    def valid_year(cls, v: int) -> int:
        if v not in (1, 2, 3, 4, 5, 6):
            raise ValueError("Current year must be between 1 and 6")
        return v

    @field_validator("cgpa")
    @classmethod
    def valid_cgpa(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and not (0 <= float(v) <= 10):
            raise ValueError("CGPA must be between 0 and 10")
        return v

    @field_validator("performance_self_rating")
    @classmethod
    def valid_rating(cls, v: Optional[str]) -> Optional[str]:
        allowed = {
            "top_of_class", "above_average", "average",
            "below_average", "struggling", None
        }
        if v not in allowed:
            raise ValueError(f"performance_self_rating must be one of: {allowed}")
        return v

    @field_validator("college_schedule_type")
    @classmethod
    def valid_schedule_type(cls, v: Optional[str]) -> Optional[str]:
        allowed = {"fixed", "rotating", "irregular", None}
        if v not in allowed:
            raise ValueError(f"college_schedule_type must be one of: {allowed}")
        return v

    @field_validator("internship_days")
    @classmethod
    def valid_days(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is not None:
            for day in v:
                if day not in range(1, 8):
                    raise ValueError("Days must be 1-7 (1=Sun, 7=Sat)")
        return v


class AcademicProfileResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    college_name: str
    course_name: str
    course_duration: int
    current_year: int
    current_semester: Optional[int]
    cgpa: Optional[Decimal]
    performance_self_rating: Optional[str]
    college_schedule_type: Optional[str]
    has_weekend_college: bool
    internship_company: Optional[str]
    internship_days: Optional[List[int]]
    internship_hours_per_day: Optional[int]

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────
# Health Profile
# ─────────────────────────────────────────

class HealthProfileRequest(BaseModel):
    has_physical_limitation: bool = False
    physical_limitation_note: Optional[str] = None
    sleep_quality: Optional[str] = None
    average_sleep_hrs: Optional[Decimal] = None
    has_afternoon_crash: bool = False
    has_chronic_fatigue: bool = False
    has_focus_difficulty: bool = False
    focus_note: Optional[str] = None
    current_fitness_level: Optional[str] = None
    diet_type: Optional[str] = None

    @field_validator("sleep_quality")
    @classmethod
    def valid_sleep_quality(cls, v: Optional[str]) -> Optional[str]:
        allowed = {"excellent", "good", "poor", "irregular", None}
        if v not in allowed:
            raise ValueError(f"sleep_quality must be one of: {allowed}")
        return v

    @field_validator("average_sleep_hrs")
    @classmethod
    def valid_sleep_hrs(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and not (0 < float(v) <= 24):
            raise ValueError("average_sleep_hrs must be between 0 and 24")
        return v

    @field_validator("current_fitness_level")
    @classmethod
    def valid_fitness(cls, v: Optional[str]) -> Optional[str]:
        allowed = {
            "sedentary", "lightly_active", "moderately_active",
            "very_active", "athlete", None
        }
        if v not in allowed:
            raise ValueError(f"current_fitness_level must be one of: {allowed}")
        return v

    @field_validator("diet_type")
    @classmethod
    def valid_diet(cls, v: Optional[str]) -> Optional[str]:
        allowed = {
            "vegetarian", "non_vegetarian", "vegan",
            "jain", "eggetarian", "no_preference", None
        }
        if v not in allowed:
            raise ValueError(f"diet_type must be one of: {allowed}")
        return v

    @model_validator(mode="after")
    def limitation_note_required(self) -> "HealthProfileRequest":
        if self.has_physical_limitation and not self.physical_limitation_note:
            raise ValueError(
                "physical_limitation_note is required when has_physical_limitation is True"
            )
        return self


class HealthProfileResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    has_physical_limitation: bool
    physical_limitation_note: Optional[str]
    sleep_quality: Optional[str]
    average_sleep_hrs: Optional[Decimal]
    has_afternoon_crash: bool
    has_chronic_fatigue: bool
    has_focus_difficulty: bool
    focus_note: Optional[str]
    current_fitness_level: Optional[str]
    diet_type: Optional[str]

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────
# Behavioural Profile
# ─────────────────────────────────────────

class BehaviouralProfileRequest(BaseModel):
    wake_time: str          # "HH:MM" format
    sleep_time: str         # "HH:MM" format
    chronotype: str
    peak_energy_start: Optional[str] = None   # "HH:MM"
    peak_energy_end: Optional[str] = None     # "HH:MM"
    preferred_study_style: Optional[str] = None
    max_focus_duration_mins: int = 45
    daily_commitment_hrs: Decimal
    heavy_days: List[int] = []
    light_days: List[int] = []
    primary_distraction: Optional[str] = None
    self_reported_failure: Optional[str] = None
    motivation_style: Optional[str] = None
    bad_day_response: Optional[str] = None
    study_environment: Optional[str] = None

    @field_validator("wake_time", "sleep_time", "peak_energy_start", "peak_energy_end")
    @classmethod
    def valid_time_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not re.match(r"^\d{2}:\d{2}$", v):
            raise ValueError("Time must be in HH:MM format")
        hour, minute = map(int, v.split(":"))
        if not (0 <= hour <= 23 and minute in (0, 30)):
            raise ValueError(
                "Hour must be 0-23, minutes must be 0 or 30 (30-min slot grid)"
            )
        return v

    @field_validator("chronotype")
    @classmethod
    def valid_chronotype(cls, v: str) -> str:
        allowed = {"early_bird", "intermediate", "night_owl"}
        if v not in allowed:
            raise ValueError(f"chronotype must be one of: {allowed}")
        return v

    @field_validator("daily_commitment_hrs")
    @classmethod
    def valid_commitment(cls, v: Decimal) -> Decimal:
        if not (Decimal("0.5") <= v <= Decimal("12")):
            raise ValueError("daily_commitment_hrs must be between 0.5 and 12")
        return v

    @field_validator("max_focus_duration_mins")
    @classmethod
    def valid_focus_duration(cls, v: int) -> int:
        if not (10 <= v <= 180):
            raise ValueError("max_focus_duration_mins must be between 10 and 180")
        return v

    @field_validator("heavy_days", "light_days")
    @classmethod
    def valid_day_numbers(cls, v: List[int]) -> List[int]:
        for day in v:
            if day not in range(1, 8):
                raise ValueError("Day numbers must be 1-7 (1=Sun, 2=Mon ... 7=Sat)")
        return v

    @model_validator(mode="after")
    def no_day_overlap(self) -> "BehaviouralProfileRequest":
        overlap = set(self.heavy_days) & set(self.light_days)
        if overlap:
            raise ValueError(
                f"Days cannot be both heavy and light: {overlap}"
            )
        return self

    @field_validator("preferred_study_style")
    @classmethod
    def valid_study_style(cls, v: Optional[str]) -> Optional[str]:
        allowed = {"pomodoro", "long_blocks", "short_bursts", "flexible", None}
        if v not in allowed:
            raise ValueError(f"preferred_study_style must be one of: {allowed}")
        return v


class BehaviouralProfileResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    wake_time: str
    sleep_time: str
    chronotype: str
    peak_energy_start: Optional[str]
    peak_energy_end: Optional[str]
    preferred_study_style: Optional[str]
    max_focus_duration_mins: int
    daily_commitment_hrs: Decimal
    heavy_days: List[int]
    light_days: List[int]
    primary_distraction: Optional[str]
    self_reported_failure: Optional[str]
    motivation_style: Optional[str]
    bad_day_response: Optional[str]
    study_environment: Optional[str]

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────
# Fixed Blocks
# ─────────────────────────────────────────

class FixedBlockRequest(BaseModel):
    title: str
    block_type: str
    applies_to_days: List[int]
    start_time: str       # "HH:MM"
    end_time: str         # "HH:MM"
    is_hard_constraint: bool = True
    buffer_before: int = 0
    buffer_after: int = 0
    valid_from: Optional[str] = None    # "YYYY-MM-DD"
    valid_until: Optional[str] = None   # "YYYY-MM-DD"
    is_seasonal: bool = False
    season_label: Optional[str] = None

    @field_validator("block_type")
    @classmethod
    def valid_block_type(cls, v: str) -> str:
        allowed = {
            "sleep", "meal", "college", "travel",
            "hygiene", "prayer", "family", "commute", "other"
        }
        if v not in allowed:
            raise ValueError(f"block_type must be one of: {allowed}")
        return v

    @field_validator("applies_to_days")
    @classmethod
    def valid_days(cls, v: List[int]) -> List[int]:
        if not v:
            raise ValueError("applies_to_days cannot be empty")
        for day in v:
            if day not in range(1, 8):
                raise ValueError("Day numbers must be 1-7")
        return list(set(v))  # deduplicate

    @field_validator("start_time", "end_time")
    @classmethod
    def valid_time(cls, v: str) -> str:
        if not re.match(r"^\d{2}:\d{2}$", v):
            raise ValueError("Time must be in HH:MM format")
        hour, minute = map(int, v.split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError("Invalid time value")
        return v

    @model_validator(mode="after")
    def end_after_start(self) -> "FixedBlockRequest":
        # Fix #2 — allow overnight blocks (e.g. sleep: 23:00 -> 06:30)
        # Only reject if start and end are identical
        if self.start_time == self.end_time:
            raise ValueError("start_time and end_time cannot be the same")
        # Overnight blocks (end < start) are valid — solver handles them correctly
        return self

    @field_validator("buffer_before", "buffer_after")
    @classmethod
    def valid_buffer(cls, v: int) -> int:
        if not (0 <= v <= 120):
            raise ValueError("Buffer must be between 0 and 120 minutes")
        return v


class FixedBlockResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    block_type: str
    applies_to_days: List[int]
    start_time: str
    end_time: str
    is_hard_constraint: bool
    buffer_before: int
    buffer_after: int
    valid_from: Optional[str]
    valid_until: Optional[str]
    is_seasonal: bool
    season_label: Optional[str]

    model_config = {"from_attributes": True}

    @field_validator("valid_from", "valid_until", mode="before")
    @classmethod
    def date_to_string(cls, v) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, date):
            return v.isoformat()
        return str(v)


class FixedBlocksRequest(BaseModel):
    """Bulk create fixed blocks during onboarding."""
    blocks: List[FixedBlockRequest]

    @field_validator("blocks")
    @classmethod
    def at_least_one_block(cls, v: List[FixedBlockRequest]) -> List[FixedBlockRequest]:
        if not v:
            raise ValueError("At least one fixed block is required")
        return v


# ─────────────────────────────────────────
# Goal
# ─────────────────────────────────────────

class GoalRequest(BaseModel):
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


class GoalResponse(BaseModel):
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
    metadata: Optional[dict] = Field(
        default=None,
        validation_alias="goal_metadata",
        serialization_alias="metadata",
    )

    model_config = {"from_attributes": True}

    @field_validator("target_date", mode="before")
    @classmethod
    def goal_date_to_string(cls, v) -> str:
        if isinstance(v, date):
            return v.isoformat()
        return str(v)


# ─────────────────────────────────────────
# Combined onboarding step responses
# ─────────────────────────────────────────

class OnboardingStatusResponse(BaseModel):
    user_id: uuid.UUID
    onboarding_complete: bool
    onboarding_step: int
    completed_steps: List[str]
    next_step: Optional[str]
