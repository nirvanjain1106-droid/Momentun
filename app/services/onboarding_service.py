from datetime import date
from typing import List

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.user import (
    User,
    UserAcademicProfile,
    UserHealthProfile,
    UserBehaviouralProfile,
)
from app.models.goal import Goal, FixedBlock
from app.schemas.onboarding import (
    AcademicProfileRequest,
    AcademicProfileResponse,
    BehaviouralProfileRequest,
    BehaviouralProfileResponse,
    FixedBlockResponse,
    FixedBlocksRequest,
    GoalRequest,
    GoalResponse,
    HealthProfileRequest,
    HealthProfileResponse,
    OnboardingStatusResponse,
)

# Maps onboarding_step to step name for status responses
ONBOARDING_STEPS = {
    1: "basic_info",           # done at registration
    2: "academic_profile",
    3: "behavioural_profile",
    4: "fixed_blocks",
    5: "first_goal",
    6: "complete",
}


async def save_academic_profile(
    user: User,
    data: AcademicProfileRequest,
    db: AsyncSession,
) -> AcademicProfileResponse:
    """
    Create or update academic profile.
    Validates intern fields if user_type is student_intern.
    Advances onboarding_step to 3.
    """
    # Validate intern fields for student_intern users
    if user.user_type == "student_intern":
        if not data.internship_company:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="internship_company is required for student_intern users",
            )
        if not data.internship_days:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="internship_days is required for student_intern users",
            )
        if not data.internship_hours_per_day:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="internship_hours_per_day is required for student_intern users",
            )

    # Fix #11 — native PostgreSQL upsert (race-safe)
    values = dict(
        user_id=user.id,
        college_name=data.college_name,
        course_name=data.course_name,
        course_duration=data.course_duration,
        current_year=data.current_year,
        current_semester=data.current_semester,
        cgpa=data.cgpa,
        performance_self_rating=data.performance_self_rating,
        college_schedule_type=data.college_schedule_type,
        has_weekend_college=data.has_weekend_college,
        internship_company=data.internship_company,
        internship_days=data.internship_days,
        internship_hours_per_day=data.internship_hours_per_day,
    )
    stmt = (
        pg_insert(UserAcademicProfile)
        .values(**values)
        .on_conflict_do_update(index_elements=["user_id"], set_={
            k: v for k, v in values.items() if k != "user_id"
        })
        .returning(UserAcademicProfile)
    )
    result = await db.execute(stmt)
    profile = result.scalar_one()

    if user.onboarding_step < 3:
        user.onboarding_step = 3

    await db.flush()
    return AcademicProfileResponse.model_validate(profile)


async def save_health_profile(
    user: User,
    data: HealthProfileRequest,
    db: AsyncSession,
) -> HealthProfileResponse:
    """
    Create or update health profile (optional step).
    Does not advance onboarding step — health is collected progressively.
    Free-text notes are encrypted at the application layer.
    """
    from app.core.encryption import encrypt_field, decrypt_field

    # Fix #11 — native PostgreSQL upsert (race-safe)
    values = dict(
        user_id=user.id,
        has_physical_limitation=data.has_physical_limitation,
        physical_limitation_note=encrypt_field(data.physical_limitation_note),
        sleep_quality=data.sleep_quality,
        average_sleep_hrs=data.average_sleep_hrs,
        has_afternoon_crash=data.has_afternoon_crash,
        has_chronic_fatigue=data.has_chronic_fatigue,
        has_focus_difficulty=data.has_focus_difficulty,
        focus_note=encrypt_field(data.focus_note),
        current_fitness_level=data.current_fitness_level,
        diet_type=data.diet_type,
    )
    stmt = (
        pg_insert(UserHealthProfile)
        .values(**values)
        .on_conflict_do_update(index_elements=["user_id"], set_={
            k: v for k, v in values.items() if k != "user_id"
        })
        .returning(UserHealthProfile)
    )
    result = await db.execute(stmt)
    profile = result.scalar_one()

    await db.flush()

    # Build response with decrypted notes
    resp = HealthProfileResponse.model_validate(profile)
    resp.physical_limitation_note = decrypt_field(profile.physical_limitation_note)
    resp.focus_note = decrypt_field(profile.focus_note)
    return resp


async def save_behavioural_profile(
    user: User,
    data: BehaviouralProfileRequest,
    db: AsyncSession,
) -> BehaviouralProfileResponse:
    """
    Create or update behavioural profile — includes wake/sleep times.
    Advances onboarding_step to 4.
    Sets peak energy window automatically if not provided by user
    (derived from chronotype).
    """
    # Auto-derive peak energy window from chronotype if not provided
    peak_start, peak_end = _derive_peak_energy(
        data.chronotype, data.wake_time, data.peak_energy_start, data.peak_energy_end
    )

    # Fix #11 — native PostgreSQL upsert (race-safe)
    values = dict(
        user_id=user.id,
        wake_time=data.wake_time,
        sleep_time=data.sleep_time,
        chronotype=data.chronotype,
        peak_energy_start=peak_start,
        peak_energy_end=peak_end,
        preferred_study_style=data.preferred_study_style,
        max_focus_duration_mins=data.max_focus_duration_mins,
        daily_commitment_hrs=data.daily_commitment_hrs,
        heavy_days=data.heavy_days,
        light_days=data.light_days,
        primary_distraction=data.primary_distraction,
        self_reported_failure=data.self_reported_failure,
        motivation_style=data.motivation_style,
        bad_day_response=data.bad_day_response,
        study_environment=data.study_environment,
    )
    stmt = (
        pg_insert(UserBehaviouralProfile)
        .values(**values)
        .on_conflict_do_update(index_elements=["user_id"], set_={
            k: v for k, v in values.items() if k != "user_id"
        })
        .returning(UserBehaviouralProfile)
    )
    result = await db.execute(stmt)
    profile = result.scalar_one()

    # Advance onboarding step
    if user.onboarding_step < 4:
        user.onboarding_step = 4

    await db.flush()
    return BehaviouralProfileResponse.model_validate(profile)


async def save_fixed_blocks(
    user: User,
    data: FixedBlocksRequest,
    db: AsyncSession,
    replace_existing: bool = False,
) -> List[FixedBlockResponse]:
    """
    Bulk create fixed blocks.
    If replace_existing=True, deletes all existing blocks first
    (used during onboarding re-do).
    Advances onboarding_step to 5.
    """
    if replace_existing:
        result = await db.execute(
            select(FixedBlock).where(FixedBlock.user_id == user.id)
        )
        existing = result.scalars().all()
        for block in existing:
            await db.delete(block)
        await db.flush()

    created_blocks = []
    for block_data in data.blocks:
        block = FixedBlock(
            user_id=user.id,
            title=block_data.title,
            block_type=block_data.block_type,
            applies_to_days=block_data.applies_to_days,
            start_time=block_data.start_time,
            end_time=block_data.end_time,
            is_hard_constraint=block_data.is_hard_constraint,
            buffer_before=block_data.buffer_before,
            buffer_after=block_data.buffer_after,
            valid_from=date.fromisoformat(block_data.valid_from)
            if block_data.valid_from
            else None,
            valid_until=date.fromisoformat(block_data.valid_until)
            if block_data.valid_until
            else None,
            is_seasonal=block_data.is_seasonal,
            season_label=block_data.season_label,
        )
        db.add(block)
        created_blocks.append(block)

    # Advance onboarding step
    if user.onboarding_step < 5:
        user.onboarding_step = 5

    await db.flush()
    return [FixedBlockResponse.model_validate(b) for b in created_blocks]


async def save_first_goal(
    user: User,
    data: GoalRequest,
    db: AsyncSession,
) -> GoalResponse:
    """
    Create the user's first active goal.
    Enforces one-active-goal-at-a-time rule.
    Marks onboarding as complete.
    """
    # Enforce single active goal rule
    result = await db.execute(
        select(Goal).where(
            Goal.user_id == user.id,
            Goal.status == "active",
            Goal.deleted_at.is_(None),
        )
    )
    existing_active = result.scalar_one_or_none()

    if existing_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"You already have an active goal: '{existing_active.title}'. "
                "Pause or complete it before creating a new one."
            ),
        )

    goal = Goal(
        user_id=user.id,
        title=data.title.strip(),
        goal_type=data.goal_type,
        description=data.description,
        target_date=date.fromisoformat(data.target_date),
        motivation=data.motivation,
        consequence=data.consequence,
        success_metric=data.success_metric,
        status="active",
        priority_rank=1,            # required by CHECK: active goals must have non-NULL rank
        goal_metadata=data.metadata or {},
    )
    db.add(goal)

    # Mark onboarding complete
    user.onboarding_step = 6
    user.onboarding_complete = True

    await db.flush()
    return GoalResponse.model_validate(goal)


async def get_onboarding_status(
    user: User,
    db: AsyncSession,
) -> OnboardingStatusResponse:
    """
    Returns current onboarding state and which steps are complete.
    Frontend uses this to resume interrupted onboarding.
    """
    completed_steps = ["basic_info"]  # always done if account exists

    # Check each profile
    result = await db.execute(
        select(UserAcademicProfile).where(UserAcademicProfile.user_id == user.id)
    )
    if result.scalar_one_or_none():
        completed_steps.append("academic_profile")

    result = await db.execute(
        select(UserBehaviouralProfile).where(
            UserBehaviouralProfile.user_id == user.id
        )
    )
    if result.scalar_one_or_none():
        completed_steps.append("behavioural_profile")

    result = await db.execute(
        select(FixedBlock).where(FixedBlock.user_id == user.id)
    )
    if result.scalars().first():
        completed_steps.append("fixed_blocks")

    result = await db.execute(
        select(Goal).where(
            Goal.user_id == user.id,
            Goal.deleted_at.is_(None),
        )
    )
    if result.scalars().first():
        completed_steps.append("first_goal")

    # Determine next step
    all_steps = [
        "basic_info",
        "academic_profile",
        "behavioural_profile",
        "fixed_blocks",
        "first_goal",
    ]
    next_step = None
    for step in all_steps:
        if step not in completed_steps:
            next_step = step
            break

    return OnboardingStatusResponse(
        user_id=user.id,
        onboarding_complete=user.onboarding_complete,
        onboarding_step=user.onboarding_step,
        completed_steps=completed_steps,
        next_step=next_step,
    )


# ─────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────

def _derive_peak_energy(
    chronotype: str,
    wake_time: str,
    provided_start: str | None,
    provided_end: str | None,
) -> tuple[str, str]:
    """
    If user hasn't specified peak energy window, derive it from chronotype.
    Returns (peak_start, peak_end) as "HH:MM" strings.
    """
    if provided_start and provided_end:
        return provided_start, provided_end

    # Default windows by chronotype
    defaults = {
        "early_bird": ("05:30", "09:30"),
        "intermediate": ("09:00", "13:00"),
        "night_owl": ("20:00", "00:00"),
    }

    return defaults.get(chronotype, ("09:00", "13:00"))
