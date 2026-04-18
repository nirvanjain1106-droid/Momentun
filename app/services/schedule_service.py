"""
Schedule Service — Commit 3 (Multi-Goal Portfolio)

Portfolio ownership: schedules are user-day scoped (no goal_id on Schedule).
Tasks still belong to individual goals via task.goal_id.

Fixes from architecture review:
- Cross-day cleanup: expire active tasks from past schedules
- Horizon Line: uses scheduled_end in user timezone with grace window
- Stale contract: is_stale + is_regenerating + regeneration_started_at (with crash recovery)
- Parked tasks: filtered by active goal IDs, not bare user_id
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional, List
import uuid
import hmac
import hashlib

from app.config import settings

from app.core.timezone import get_user_today

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.exc import IntegrityError

from app.models.user import User, UserBehaviouralProfile, UserHealthProfile
from app.models.goal import (
    Goal, FixedBlock, Schedule, Task, WeeklyPlan, DailyLog
)
from app.schemas.schedule import (
    GenerateScheduleRequest, ScheduleResponse,
    TaskResponse, ParkedTaskResponse, WeekScheduleResponse
)
from app.schemas.insights import PatternResponse
from app.services.constraint_solver import (
    ConstraintSolver, FixedBlockData, TaskRequirement, GoalTaskGroup,
    PRIORITY_CORE, PRIORITY_NORMAL,
    generate_exam_tasks, generate_fitness_tasks
)
from app.core.constants import (
    PRIORITY_LABELS, HORIZON_GRACE_MINS, REGEN_LOCK_TIMEOUT_SECS,
)
from app.services.llm_service import (
    build_schedule_prompt, call_llm, build_fallback_enrichment
)
from app.services import insights_service
from app.services import goal_service

logger = logging.getLogger(__name__)

def _pii_hash(value: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256,
    ).hexdigest()[:12]


async def build_solver_for_user(
    user_id: uuid.UUID,
    target_date: date,
    db: AsyncSession,
) -> ConstraintSolver:
    """Builds a constraint solver configured for a specific user and date."""
    behavioural = await _get_behavioural_profile(user_id, db)
    if not behavioural:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete your behavioural profile before generating a schedule.",
        )

    health_profile = await _get_health_profile(user_id, db)
    capacity_modifier = 1.0

    if health_profile:
        if health_profile.has_chronic_fatigue:
            capacity_modifier *= 0.85
        if health_profile.sleep_quality == "poor":
            capacity_modifier *= 0.90
        elif health_profile.sleep_quality == "irregular":
            capacity_modifier *= 0.93
        if health_profile.average_sleep_hrs and float(health_profile.average_sleep_hrs) < 6:
            capacity_modifier *= 0.90

    fixed_blocks = await _get_fixed_blocks_for_date(user_id, target_date, db)
    _check_block_overlaps(fixed_blocks)

    solver_blocks = [
        FixedBlockData(
            title=b.title,
            block_type=b.block_type,
            start_time=str(b.start_time),
            end_time=str(b.end_time),
            buffer_before=b.buffer_before,
            buffer_after=b.buffer_after,
        )
        for b in fixed_blocks
    ]

    adjusted_commitment = float(behavioural.daily_commitment_hrs) * capacity_modifier

    return ConstraintSolver(
        fixed_blocks=solver_blocks,
        peak_energy_start=str(behavioural.peak_energy_start or "09:00"),
        peak_energy_end=str(behavioural.peak_energy_end or "13:00"),
        wake_time=str(behavioural.wake_time),
        sleep_time=str(behavioural.sleep_time),
        daily_commitment_hrs=adjusted_commitment,
        heavy_days=behavioural.heavy_days or [],
        light_days=behavioural.light_days or [],
        chronotype=behavioural.chronotype,
    )


async def generate_schedule(
    user: User,
    data: GenerateScheduleRequest,
    db: AsyncSession,
) -> ScheduleResponse:
    """
    Generate a portfolio-level schedule for a given date.
    Collects tasks from ALL active goals and runs the two-pass allocator.
    """
    target_date = (
        date.fromisoformat(data.target_date)
        if data.target_date
        else get_user_today(user.timezone)
    )

    # Return existing schedule if already generated
    # (Pre-check to avoid locking if not necessary)
    existing = await _get_existing_schedule(user.id, target_date, db)
    if existing:
        return await _build_schedule_response(existing, user.id, db)

    # 1. Acquire row-level lock on user to serialize generation (anti-thundering-herd)
    # This prevents multiple concurrent requests for the same user from running
    # the expensive Constraint Solver and LLM logic simultaneously.
    await db.execute(
        select(User).where(User.id == user.id).with_for_update()
    )

    # 2. Re-check for existing schedule after lock acquisition
    # Another request may have just finished creating it while we were waiting for the lock.
    existing = await _get_existing_schedule(user.id, target_date, db)
    if existing:
        return await _build_schedule_response(existing, user.id, db)

    # Load required profiles
    behavioural = await _get_behavioural_profile(user.id, db)
    if not behavioural:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete your behavioural profile before generating a schedule.",
        )

    # Load health profile for solver capacity modifiers
    health_profile = await _get_health_profile(user.id, db)
    capacity_modifier = 1.0
    max_block_mins = 90
    avoid_afternoon_peak = False

    if health_profile:
        # Chronic fatigue → reduce capacity by 15%
        if health_profile.has_chronic_fatigue:
            capacity_modifier *= 0.85
        # Poor sleep quality → reduce capacity by 10%
        if health_profile.sleep_quality == "poor":
            capacity_modifier *= 0.90
        elif health_profile.sleep_quality == "irregular":
            capacity_modifier *= 0.93
        # Low sleep hours → additional reduction
        if health_profile.average_sleep_hrs and float(health_profile.average_sleep_hrs) < 6:
            capacity_modifier *= 0.90
        # Focus difficulty → shorter blocks
        if health_profile.has_focus_difficulty:
            max_block_mins = 30  # noqa: F841 — will be used when solver supports block limits
        # Afternoon crash → avoid high-energy tasks after 2 PM
        if health_profile.has_afternoon_crash:
            avoid_afternoon_peak = True  # noqa: F841 — will be used when solver supports afternoon guard

    # Multi-goal: fetch all active goals
    active_goals = await goal_service.get_active_goals(user.id, db)
    if not active_goals:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Create a goal before generating a schedule.",
        )

    # Build GoalTaskGroups for the two-pass allocator
    goal_task_groups: List[GoalTaskGroup] = []
    primary_goal = active_goals[0]  # Highest ranked for LLM/insights context

    for goal in active_goals:
        active_patterns, trajectory = await insights_service.get_live_schedule_context(
            user=user,
            goal=goal,
            db=db,
            target_date=target_date,
        )

        task_requirements = _generate_task_requirements(
            goal,
            behavioural,
            active_patterns,
        )

        goal_task_groups.append(GoalTaskGroup(
            goal_id=str(goal.id),
            goal_rank=goal.priority_rank or 999,
            goal_title=goal.title,
            tasks=task_requirements,
        ))

    fixed_blocks = await _get_fixed_blocks_for_date(user.id, target_date, db)

    # Fix #8 — warn if fixed blocks overlap
    _check_block_overlaps(fixed_blocks)

    # Convert to solver format
    solver_blocks = [
        FixedBlockData(
            title=b.title,
            block_type=b.block_type,
            start_time=str(b.start_time),
            end_time=str(b.end_time),
            buffer_before=b.buffer_before,
            buffer_after=b.buffer_after,
        )
        for b in fixed_blocks
    ]

    # Build solver with health-adjusted capacity
    adjusted_commitment = float(behavioural.daily_commitment_hrs) * capacity_modifier

    solver = ConstraintSolver(
        fixed_blocks=solver_blocks,
        peak_energy_start=str(behavioural.peak_energy_start or "09:00"),
        peak_energy_end=str(behavioural.peak_energy_end or "13:00"),
        wake_time=str(behavioural.wake_time),
        sleep_time=str(behavioural.sleep_time),
        daily_commitment_hrs=adjusted_commitment,
        heavy_days=behavioural.heavy_days or [],
        light_days=behavioural.light_days or [],
        chronotype=behavioural.chronotype,
    )

    solver_result = solver.solve(
        target_date=target_date,
        goal_task_groups=goal_task_groups,
        day_type=data.day_type or "standard",
    )

    # LLM enrichment — portfolio-level narrative
    enrichment = None
    prompt = None
    if data.use_llm:
        days_until_deadline = (primary_goal.target_date - target_date).days
        prompt = build_schedule_prompt(
            solver_result=solver_result,
            goal_title=primary_goal.title,
            goal_type=primary_goal.goal_type,
            goal_metadata=primary_goal.goal_metadata or {},
            chronotype=behavioural.chronotype,
            self_reported_failure=behavioural.self_reported_failure,
            days_until_deadline=days_until_deadline,
            active_patterns=active_patterns,
            trajectory=trajectory,
        )
        preferred_model = getattr(getattr(user, "user_settings", None), "preferred_model", "primary") or "primary"
        enrichment = await call_llm(prompt, settings.GROQ_API_KEY, preferred_model=preferred_model)

    if not enrichment:
        days_until_deadline = (primary_goal.target_date - target_date).days
        enrichment = build_fallback_enrichment(
            solver_result,
            primary_goal.title,
            days_until_deadline,
            active_patterns=active_patterns,
            trajectory=trajectory,
        )
    enrichment = _sanitize_enrichment(enrichment, solver_result)

    # Race-safe save using a savepoint to avoid rolling back the entire session
    try:
        async with db.begin_nested():
            schedule = await _save_schedule(
                user_id=user.id,
                target_date=target_date,
                solver_result=solver_result,
                enrichment=enrichment,
                generation_prompt=prompt,
                db=db,
            )
    except IntegrityError:
        # Another request created this schedule concurrently
        existing = await _get_existing_schedule(user.id, target_date, db)
        if existing:
            return await _build_schedule_response(existing, user.id, db)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Schedule creation conflict. Please retry.",
        )

    return await _build_schedule_response(schedule, user.id, db)


async def get_today_schedule(user: User, db: AsyncSession) -> ScheduleResponse:
    # Sick mode guard — return paused response
    if user.paused_at is not None:
        from app.core.constants import BANKRUPTCY_INACTIVITY_DAYS
        return ScheduleResponse(
            id=uuid.uuid4(),
            user_id=user.id,
            schedule_date=get_user_today(user.timezone),
            day_type="paused",
            day_type_reason=f"Account paused: {user.paused_reason or 'rest mode'}",
            strategy_note="You're on a break. Rest up — your goals will be here when you're ready.",
            tasks=[],
            parked_tasks=[],
            total_tasks=0,
            total_study_mins=0,
            day_capacity_hrs=0.0,
            recovery_mode=False,
            is_paused=True,
        )

    today = get_user_today(user.timezone)

    # ── Cross-day cleanup: expire active tasks from past schedules ──
    await _cross_day_cleanup(user.id, today, db)

    # Schedule bankruptcy detection — check for missed days
    from app.core.constants import BANKRUPTCY_INACTIVITY_DAYS
    last_log = await db.execute(
        select(DailyLog)
        .where(and_(DailyLog.user_id == user.id, DailyLog.log_date < today))
        .order_by(DailyLog.log_date.desc())
        .limit(1)
    )
    last = last_log.scalar_one_or_none()
    recovery_mode = False
    if last and (today - last.log_date).days >= BANKRUPTCY_INACTIVITY_DAYS:
        # Auto-park all pending tasks from missed days
        missed_tasks = await db.execute(
            select(Task).where(
                and_(
                    Task.user_id == user.id,
                    Task.task_status == "active",
                    Task.deleted_at.is_(None),
                )
            )
        )
        for task in missed_tasks.scalars().all():
            task.previous_status = task.task_status
            task.task_status = "parked"
            task.schedule_id = None
            task.scheduled_start = None
            task.scheduled_end = None
        await db.flush()
        recovery_mode = True
        logger.info("schedule_bankruptcy_triggered", extra={
            "user_id": str(user.id), "missed_days": (today - last.log_date).days,
        })

    existing = await _get_existing_schedule(user.id, today, db)

    if existing:
        # ── Apply Horizon Line (expire past tasks) ──
        await _apply_horizon_line(user.id, existing, user.timezone, db)

        # ── Stale contract: check if regeneration or lock recovery needed ──
        if existing.is_stale or existing.is_regenerating:
            existing = await _handle_stale_schedule(user, existing, today, db)

        resp = await _build_schedule_response(existing, user.id, db)
        resp.recovery_mode = recovery_mode
        resp.is_stale = existing.is_stale
        return resp

    resp = await generate_schedule(
        user,
        GenerateScheduleRequest(target_date=today.isoformat()),
        db,
    )
    resp.recovery_mode = recovery_mode
    return resp


async def regenerate_today_schedule(user: User, db: AsyncSession) -> ScheduleResponse:
    """
    Re-generate today's schedule from scratch.
    Preserves completed + expired tasks. Soft-deletes the old schedule.
    """
    today = get_user_today(user.timezone)
    existing = await _get_existing_schedule(user.id, today, db)

    if existing:
        # Mark non-completed, non-expired tasks as deferred (they'll go to parking lot)
        tasks_result = await db.execute(
            select(Task).where(
                and_(
                    Task.schedule_id == existing.id,
                    Task.task_status.notin_(["completed", "expired"]),
                    Task.deleted_at.is_(None),
                )
            )
        )
        for task in tasks_result.scalars().all():
            task.previous_status = task.task_status
            task.task_status = "deferred"
            task.schedule_id = None
            task.scheduled_start = None
            task.scheduled_end = None

        # Soft-delete the old schedule (preserves FK integrity for TaskLogs)
        existing.deleted_at = datetime.now(timezone.utc)
        await db.flush()
        logger.info("schedule_regenerated_cleanup", extra={
            "user_id": str(user.id), "date": today.isoformat(),
        })

    # Generate fresh schedule
    return await generate_schedule(
        user,
        GenerateScheduleRequest(target_date=today.isoformat(), use_llm=False),
        db,
    )


async def get_week_schedule(
    user: User,
    db: AsyncSession,
    week_start: Optional[str] = None,
) -> WeekScheduleResponse:
    if week_start:
        start_date = date.fromisoformat(week_start)
    else:
        today      = get_user_today(user.timezone)
        start_date = today - timedelta(days=today.weekday())

    end_date    = start_date + timedelta(days=6)
    weekly_plan = await _get_or_create_weekly_plan(user, start_date, end_date, db)

    # Fix #9 — generate all 7 days in parallel
    async def _generate_one(target: date) -> Optional[ScheduleResponse]:
        try:
            return await generate_schedule(
                user,
                GenerateScheduleRequest(target_date=target.isoformat(), use_llm=False),
                db,
            )
        except Exception:
            logger.exception("weekly_schedule_generation_failed", extra={"target_date": target.isoformat()})
            return None

    results = await asyncio.gather(*[
        _generate_one(start_date + timedelta(days=i)) for i in range(7)
    ])
    day_schedules = [r for r in results if r is not None]

    return WeekScheduleResponse(
        week_start_date=start_date.isoformat(),
        week_end_date=end_date.isoformat(),
        week_theme=weekly_plan.week_theme,
        strategy_note=weekly_plan.strategy_note,
        days=day_schedules,
        days_generated=len(day_schedules),
    )


# ── Private helpers ───────────────────────────────────────────


async def _cross_day_cleanup(
    user_id: uuid.UUID, today: date, db: AsyncSession,
) -> None:
    """
    Expire all active tasks from past schedules (not today).
    Runs on every get_today_schedule call. No grace window for past days.
    """
    past_active = await db.execute(
        select(Task).join(Schedule).where(
            and_(
                Task.user_id == user_id,
                Task.task_status == "active",
                Task.deleted_at.is_(None),
                Schedule.schedule_date < today,
                Schedule.deleted_at.is_(None),
            )
        )
    )
    expired_count = 0
    for task in past_active.scalars().all():
        task.previous_status = task.task_status
        task.task_status = "expired"
        expired_count += 1

    if expired_count > 0:
        await db.flush()
        logger.info("cross_day_cleanup", extra={
            "user_id": str(user_id), "expired_count": expired_count,
        })


async def _apply_horizon_line(
    user_id: uuid.UUID,
    schedule: Schedule,
    user_tz: str,
    db: AsyncSession,
) -> None:
    """
    Expire tasks whose scheduled_end has passed (with grace window).
    Uses schedule_date + scheduled_end to construct the actual datetime.
    Only applies to today's schedule.
    """
    try:
        from zoneinfo import ZoneInfo
        # On Windows without tzdata, ZoneInfo("UTC") fails.
        tz = ZoneInfo(user_tz)
    except Exception:
        tz = timezone.utc if user_tz == "UTC" else None

    now = datetime.now(tz)
    today = now.date()

    if schedule.schedule_date != today:
        return  # Only apply to today's schedule

    tasks_result = await db.execute(
        select(Task).where(
            and_(
                Task.schedule_id == schedule.id,
                Task.task_status == "active",
                Task.scheduled_end.isnot(None),
                Task.deleted_at.is_(None),
            )
        )
    )

    expired_count = 0
    for task in tasks_result.scalars().all():
        try:
            end_parts = task.scheduled_end.split(":")
            task_end_dt = datetime(
                today.year, today.month, today.day,
                int(end_parts[0]), int(end_parts[1]),
                tzinfo=tz,
            )
            # Apply grace window
            if now > task_end_dt + timedelta(minutes=HORIZON_GRACE_MINS):
                task.previous_status = task.task_status
                task.task_status = "expired"
                expired_count += 1
        except (ValueError, IndexError):
            continue

    if expired_count > 0:
        await db.flush()
        logger.info("horizon_line_applied", extra={
            "user_id": str(user_id), "expired_count": expired_count,
        })


async def _handle_stale_schedule(
    user: User,
    schedule: Schedule,
    today: date,
    db: AsyncSession,
) -> Schedule:
    """
    Handle stale schedule regeneration with crash-safe locking.
    Returns the (possibly regenerated) schedule.
    """
    now_utc = datetime.now(timezone.utc)

    # Check if another process is already regenerating
    if schedule.is_regenerating:
        if (
            schedule.regeneration_started_at
            and (now_utc - schedule.regeneration_started_at).total_seconds() > REGEN_LOCK_TIMEOUT_SECS
        ):
            # Stale lock — force-release
            schedule.is_regenerating = False
            schedule.regeneration_started_at = None
            await db.flush()
            logger.warning("stale_regen_lock_released", extra={
                "user_id": str(user.id),
                "schedule_id": str(schedule.id),
            })
        else:
            # Active regen in progress — return stale schedule as-is
            return schedule

    # Claim the regeneration lock
    schedule.is_regenerating = True
    schedule.regeneration_started_at = now_utc
    await db.flush()

    try:
        # Regenerate: defer non-completed/non-expired tasks
        tasks_result = await db.execute(
            select(Task).where(
                and_(
                    Task.schedule_id == schedule.id,
                    Task.task_status.notin_(["completed", "expired"]),
                    Task.deleted_at.is_(None),
                )
            )
        )
        for task in tasks_result.scalars().all():
            task.previous_status = task.task_status
            task.task_status = "deferred"
            task.schedule_id = None
            task.scheduled_start = None
            task.scheduled_end = None

        # Soft-delete old schedule
        schedule.deleted_at = now_utc
        await db.flush()

        # Generate fresh
        await generate_schedule(
            user,
            GenerateScheduleRequest(target_date=today.isoformat(), use_llm=False),
            db,
        )

        # Fetch the new schedule
        new_schedule = await _get_existing_schedule(user.id, today, db)
        
        # Release the lock on the OLD schedule object before returning
        schedule.is_regenerating = False
        schedule.regeneration_started_at = None
        await db.flush()

        if new_schedule:
            return new_schedule
        return schedule  # fallback

    except Exception:
        logger.exception("stale_regen_failed", extra={
            "user_id": str(user.id),
            "schedule_id": str(schedule.id),
        })
        # Release the lock on failure
        schedule.is_regenerating = False
        schedule.regeneration_started_at = None
        schedule.deleted_at = None  # Undelete
        await db.flush()
        return schedule


async def _get_existing_schedule(
    user_id: uuid.UUID, target_date: date, db: AsyncSession
) -> Optional[Schedule]:
    result = await db.execute(
        select(Schedule).where(
            and_(
                Schedule.user_id    == user_id,
                Schedule.schedule_date == target_date,
                Schedule.deleted_at.is_(None),
            )
        )
    )
    return result.scalar_one_or_none()


async def _get_behavioural_profile(
    user_id: uuid.UUID, db: AsyncSession
) -> Optional[UserBehaviouralProfile]:
    result = await db.execute(
        select(UserBehaviouralProfile).where(
            UserBehaviouralProfile.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def _get_health_profile(
    user_id: uuid.UUID, db: AsyncSession
) -> Optional[UserHealthProfile]:
    result = await db.execute(
        select(UserHealthProfile).where(
            UserHealthProfile.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def _get_fixed_blocks_for_date(
    user_id: uuid.UUID, target_date: date, db: AsyncSession
) -> List[FixedBlock]:
    python_weekday = target_date.weekday()
    day_of_week    = (python_weekday + 2) % 7 or 7

    # Fix #10 — filter by day at DB level, date range in Python (ARRAY contains)
    result = await db.execute(
        select(FixedBlock).where(
            and_(
                FixedBlock.user_id == user_id,
                FixedBlock.applies_to_days.contains([day_of_week]),
            )
        )
    )
    all_blocks = result.scalars().all()

    applicable = []
    for block in all_blocks:
        if block.valid_from  and target_date < block.valid_from:
            continue
        if block.valid_until and target_date > block.valid_until:
            continue
        applicable.append(block)

    return applicable


def _check_block_overlaps(blocks: List[FixedBlock]) -> None:
    """
    Fix #8 — detect fixed block conflicts.
    Overnight blocks are exempt from overlap checks.
    Logs a warning; does NOT raise (allows schedule to proceed).
    """
    def to_mins(t: str) -> int:
        try:
            parts = str(t).split(":")
            return int(parts[0]) * 60 + int(parts[1])
        except (IndexError, ValueError):
            return 0

    normal_blocks = []
    for b in blocks:
        s = to_mins(str(b.start_time))
        e = to_mins(str(b.end_time))
        if s < e:  # normal (non-overnight) blocks only
            normal_blocks.append((s, e, b.title))

    normal_blocks.sort()
    for i in range(len(normal_blocks) - 1):
        _, e1, t1 = normal_blocks[i]
        s2, _, t2 = normal_blocks[i + 1]
        if s2 < e1:
            # Overlap detected — log it but continue
            logger.warning("fixed_block_overlap_detected", extra={
                "block_1_hash": _pii_hash(t1), 
                "block_2_hash": _pii_hash(t2)
            })


def _generate_task_requirements(
    goal: Goal,
    behavioural: UserBehaviouralProfile,
    active_patterns: Optional[List[PatternResponse]] = None,
) -> List[TaskRequirement]:
    metadata  = goal.goal_metadata or {}
    daily_hrs = float(behavioural.daily_commitment_hrs)

    task_requirements: List[TaskRequirement]
    if goal.goal_type == "exam":
        task_requirements = generate_exam_tasks(
            subjects=metadata.get("subjects", []),
            weak_subjects=metadata.get("weak_subjects", []),
            strong_subjects=metadata.get("strong_subjects", []),
            daily_commitment_hrs=daily_hrs,
            day_type="standard",
        )
    elif goal.goal_type == "fitness":
        task_requirements = generate_fitness_tasks(
            goal_type=metadata.get("goal_type", "general"),
            equipment=metadata.get("equipment", "none"),
            daily_commitment_hrs=daily_hrs,
        )
    else:
        task_requirements = [
            TaskRequirement(
                title=f"Work on: {goal.title}",
                task_type="deep_study",
                duration_mins=int(daily_hrs * 60 * 0.8),
                energy_required="high",
                priority=PRIORITY_CORE,
            ),
            TaskRequirement(
                title="Review & Plan Next Steps",
                task_type="admin",
                duration_mins=20,
                energy_required="low",
                priority=PRIORITY_NORMAL,
            ),
        ]

    return _apply_pattern_task_boosts(task_requirements, active_patterns or [])


def _apply_pattern_task_boosts(
    task_requirements: List[TaskRequirement],
    active_patterns: List[PatternResponse],
) -> List[TaskRequirement]:
    if not task_requirements or not active_patterns:
        return task_requirements

    boosted = list(task_requirements)
    subject_pattern = next(
        (
            pattern for pattern in active_patterns
            if pattern.pattern_type == "subject_avoidance"
        ),
        None,
    )
    if not subject_pattern:
        return boosted

    label = (subject_pattern.supporting_data or {}).get("label", "").lower()
    if not label:
        return boosted

    for index, requirement in enumerate(boosted):
        title = (requirement.title or "").lower()
        if label not in title:
            continue

        requirement.priority = PRIORITY_CORE
        if requirement.energy_required != "high":
            requirement.energy_required = "high"

        boosted.insert(0, boosted.pop(index))
        break

    return boosted


async def _save_schedule(
    user_id: uuid.UUID,
    target_date: date,
    solver_result,
    enrichment: dict,
    generation_prompt: Optional[str],
    db: AsyncSession,
) -> Schedule:
    """Save schedule + scheduled tasks + parked tasks (portfolio-level, no goal_id)."""
    schedule = Schedule(
        user_id=user_id,
        schedule_date=target_date,
        day_type=solver_result.day_type,
        day_type_reason=enrichment.get("day_type_reason"),
        strategy_note=enrichment.get("strategy_note"),
        generated_by="ai",
        model_used="openrouter/qwen3.5" if settings.OPENROUTER_API_KEY else "groq/llama-3.3-70b",
        generation_prompt=generation_prompt,
    )
    db.add(schedule)
    await db.flush()

    task_descriptions = enrichment.get("task_descriptions", {})

    # Save scheduled tasks (including goal_id and goal_rank_snapshot)
    for solver_task in solver_result.scheduled_tasks:
        description = task_descriptions.get(solver_task.title, solver_task.description)
        # Parse goal_id from solver's string UUID
        task_goal_id = uuid.UUID(solver_task.goal_id) if solver_task.goal_id else None
        task = Task(
            schedule_id=schedule.id,
            user_id=user_id,
            goal_id=task_goal_id,
            title=solver_task.title,
            description=description,
            task_type=solver_task.task_type,
            scheduled_start=solver_task.scheduled_start,
            scheduled_end=solver_task.scheduled_end,
            duration_mins=solver_task.duration_mins,
            energy_required=solver_task.energy_required,
            priority=solver_task.priority,
            is_mvp_task=solver_task.is_mvp_task,
            sequence_order=solver_task.sequence_order,
            task_status="active",
            slot_reasons=getattr(solver_task, 'slot_reasons', None),
            goal_rank_snapshot=solver_task.goal_rank_snapshot,
        )
        db.add(task)

    # Save unscheduled tasks as "deferred" (Parking Lot)
    for i, unscheduled_task in enumerate(solver_result.unscheduled_tasks):
        # Unscheduled tasks don't have goal_id on TaskRequirement,
        # so we won't set it here. They go to the general parking lot.
        task = Task(
            schedule_id=None,   # not on any schedule — in parking lot
            user_id=user_id,
            goal_id=None,
            title=unscheduled_task.title,
            description=None,
            task_type=unscheduled_task.task_type,
            scheduled_start=None,
            scheduled_end=None,
            duration_mins=unscheduled_task.duration_mins,
            energy_required=unscheduled_task.energy_required,
            priority=unscheduled_task.priority,
            is_mvp_task=(unscheduled_task.priority == PRIORITY_CORE),
            sequence_order=999 + i,
            task_status="deferred",
        )
        db.add(task)

    await db.flush()
    return schedule


def _sanitize_enrichment(enrichment: dict, solver_result) -> dict:
    """
    Treat LLM output as untrusted and normalize to expected shape.
    """
    if not isinstance(enrichment, dict):
        return build_fallback_enrichment(solver_result, "", 0)

    strategy_note = enrichment.get("strategy_note")
    if not isinstance(strategy_note, str):
        strategy_note = ""

    day_type_reason = enrichment.get("day_type_reason")
    if not isinstance(day_type_reason, str):
        day_type_reason = ""

    sanitized_descriptions: dict[str, str] = {}
    raw_descriptions = enrichment.get("task_descriptions")
    if isinstance(raw_descriptions, dict):
        for key, value in raw_descriptions.items():
            if isinstance(key, str) and isinstance(value, str):
                sanitized_descriptions[key] = value[:500]

    return {
        "strategy_note": strategy_note[:2000],
        "day_type_reason": day_type_reason[:1000],
        "task_descriptions": sanitized_descriptions,
    }


async def _build_schedule_response(
    schedule: Schedule,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> ScheduleResponse:
    """Load schedule + tasks and build full response with parked tasks."""

    # Active + completed + expired tasks on this schedule
    result = await db.execute(
        select(Task).where(
            and_(
                Task.schedule_id == schedule.id,
                Task.task_status.in_(["active", "completed", "expired"]),
                Task.deleted_at.is_(None),
            )
        ).order_by(Task.sequence_order)
    )
    tasks = result.scalars().all()

    # Parked tasks: filter by active goal IDs (not bare user_id)
    active_goals = await goal_service.get_active_goals(user_id, db)
    active_goal_ids = [g.id for g in active_goals]

    if active_goal_ids:
        result_parked = await db.execute(
            select(Task).where(
                and_(
                    Task.user_id == user_id,
                    Task.goal_id.in_(active_goal_ids),
                    Task.task_status.in_(["deferred", "parked"]),
                    Task.deleted_at.is_(None),
                    Task.created_at >= schedule.created_at - timedelta(hours=1),
                )
            ).order_by(Task.priority, Task.sequence_order)
        )
        parked_tasks = result_parked.scalars().all()
    else:
        parked_tasks = []

    task_responses = [
        TaskResponse(
            id=t.id,
            title=t.title,
            description=t.description,
            task_type=t.task_type,
            scheduled_start=t.scheduled_start,
            scheduled_end=t.scheduled_end,
            duration_mins=t.duration_mins,
            energy_required=t.energy_required,
            priority=t.priority,
            priority_label=PRIORITY_LABELS.get(t.priority, "Normal"),
            is_mvp_task=t.is_mvp_task,
            sequence_order=t.sequence_order,
            task_status=t.task_status,
            slot_reasons=t.slot_reasons,
            goal_id=t.goal_id,
            goal_rank_snapshot=t.goal_rank_snapshot,
        )
        for t in tasks
    ]

    parked_responses = [
        ParkedTaskResponse(
            id=t.id,
            title=t.title,
            task_type=t.task_type,
            duration_mins=t.duration_mins,
            energy_required=t.energy_required,
            priority=t.priority,
            priority_label=PRIORITY_LABELS.get(t.priority, "Normal"),
            task_status=t.task_status,
        )
        for t in parked_tasks
    ]

    total_study_mins = sum(
        t.duration_mins for t in tasks
        if t.task_type in ("deep_study", "practice", "revision", "light_review")
    )

    # Calculate day capacity from scheduled tasks
    day_capacity_hrs = round(sum(t.duration_mins for t in tasks) / 60, 2)

    return ScheduleResponse(
        id=schedule.id,
        user_id=schedule.user_id,
        schedule_date=schedule.schedule_date,
        day_type=schedule.day_type,
        day_type_reason=schedule.day_type_reason,
        strategy_note=schedule.strategy_note,
        tasks=task_responses,
        parked_tasks=parked_responses,
        total_tasks=len(task_responses),
        total_study_mins=total_study_mins,
        day_capacity_hrs=day_capacity_hrs,
        is_stale=schedule.is_stale,
    )


async def _get_or_create_weekly_plan(
    user: User,
    start_date: date,
    end_date: date,
    db: AsyncSession,
) -> WeeklyPlan:
    result = await db.execute(
        select(WeeklyPlan).where(
            and_(
                WeeklyPlan.user_id         == user.id,
                WeeklyPlan.week_start_date == start_date,
                WeeklyPlan.deleted_at.is_(None),
            )
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    week_theme = "Consistency Week"
    strategy_note = (
        "Stay consistent with your daily targets. "
        "Small daily actions compound into big results."
    )

    # Use the highest-ranked active goal for pattern context
    active_goals = await goal_service.get_active_goals(user.id, db)
    if active_goals:
        primary_goal = active_goals[0]
        patterns, trajectory = await insights_service.get_live_schedule_context(
            user=user,
            goal=primary_goal,
            db=db,
            target_date=start_date,
        )
        focus_line = insights_service.build_pattern_focus_line(patterns)
        if focus_line or trajectory:
            note_parts = [part for part in (
                focus_line,
                getattr(trajectory, "motivational_nudge", None),
            ) if part]
            if note_parts:
                strategy_note = " ".join(note_parts)

        if patterns:
            top_pattern = patterns[0]
            if top_pattern.pattern_type == "subject_avoidance":
                label = (top_pattern.supporting_data or {}).get("label", "Focus")
                week_theme = f"{label} Reset Week"
            elif top_pattern.pattern_type == "overload_triggers":
                week_theme = "Simplify to Win Week"
        elif trajectory and trajectory.status in {"behind", "critical"}:
            week_theme = "Catch-Up Week"
        elif trajectory and trajectory.status in {"ahead", "on_track"}:
            week_theme = "Momentum Week"

    plan = WeeklyPlan(
        user_id=user.id,
        week_start_date=start_date,
        week_end_date=end_date,
        week_theme=week_theme,
        strategy_note=strategy_note,
        status="active",
    )
    db.add(plan)
    await db.flush()
    return plan


# ── Background LLM Enrichment (Fix #9 — offloaded) ──────────


async def enrich_schedule_with_llm(
    schedule_id: uuid.UUID,
    prompt: str,
    groq_api_key: str,
    preferred_model: str = "primary",
) -> None:
    """
    Background task: call LLM and update schedule enrichment in DB.
    Called after the fast solver response is already returned to the client.
    """
    from app.database import AsyncSessionLocal

    try:
        enrichment = await call_llm(prompt, groq_api_key, preferred_model=preferred_model)
        if not enrichment:
            return

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Schedule).where(Schedule.id == schedule_id)
            )
            schedule = result.scalar_one_or_none()
            if not schedule:
                return

            if enrichment.get("strategy_note"):
                schedule.strategy_note = str(enrichment["strategy_note"])[:500]
            if enrichment.get("day_type_reason"):
                schedule.day_type_reason = str(enrichment["day_type_reason"])[:500]

            # Update task descriptions
            task_descs = enrichment.get("task_descriptions", {})
            if task_descs and isinstance(task_descs, dict):
                tasks_result = await db.execute(
                    select(Task).where(Task.schedule_id == schedule_id)
                )
                for task in tasks_result.scalars().all():
                    if task.title in task_descs:
                        task.description = str(task_descs[task.title])[:500]

            await db.commit()
            logger.info("background_llm_enrichment_complete", extra={"schedule_id": str(schedule_id)})
    except Exception:
        logger.exception("background_llm_enrichment_failed", extra={"schedule_id": str(schedule_id)})
