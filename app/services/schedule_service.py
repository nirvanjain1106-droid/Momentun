"""
Schedule Service — Phase 3

Fixes applied:
- #3  Race-safe schedule creation (catch unique constraint violation, return existing)
- #4  Async LLM call (await call_llm)
- #7  Surface unscheduled/parked tasks in response
- #8  Fixed block overlap check before building solver
"""

import asyncio
import logging
from datetime import date, timedelta
from typing import Optional, List
import uuid

from app.core.timezone import get_user_today

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.exc import IntegrityError

from app.models.user import User, UserBehaviouralProfile
from app.models.goal import (
    Goal, FixedBlock, Schedule, Task, WeeklyPlan
)
from app.schemas.schedule import (
    GenerateScheduleRequest, ScheduleResponse,
    TaskResponse, ParkedTaskResponse, WeekScheduleResponse
)
from app.schemas.insights import PatternResponse
from app.services.constraint_solver import (
    ConstraintSolver, FixedBlockData, TaskRequirement,
    PRIORITY_CORE, PRIORITY_NORMAL, PRIORITY_BONUS,
    generate_exam_tasks, generate_fitness_tasks
)
from app.services.llm_service import (
    build_schedule_prompt, call_llm, build_fallback_enrichment
)
from app.services import insights_service
from app.config import settings

logger = logging.getLogger(__name__)

# Maps priority int to label
PRIORITY_LABELS = {
    PRIORITY_CORE:   "Core",
    PRIORITY_NORMAL: "Normal",
    PRIORITY_BONUS:  "Bonus",
}


async def generate_schedule(
    user: User,
    data: GenerateScheduleRequest,
    db: AsyncSession,
) -> ScheduleResponse:
    """
    Generate a schedule for a given date.
    Fix #3 — race-safe: if concurrent request already created it, return that.
    """
    target_date = (
        date.fromisoformat(data.target_date)
        if data.target_date
        else date.today()
    )

    # Return existing schedule if already generated
    existing = await _get_existing_schedule(user.id, target_date, db)
    if existing:
        return await _build_schedule_response(existing, db)

    # Load required profiles
    behavioural = await _get_behavioural_profile(user.id, db)
    if not behavioural:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete your behavioural profile before generating a schedule.",
        )

    goal = await _get_active_goal(user.id, db)
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Create a goal before generating a schedule.",
        )

    active_patterns, trajectory = await insights_service.get_live_schedule_context(
        user=user,
        goal=goal,
        db=db,
        target_date=target_date,
    )

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

    # Build solver — Fix #1 handled inside ConstraintSolver.__init__
    solver = ConstraintSolver(
        fixed_blocks=solver_blocks,
        peak_energy_start=str(behavioural.peak_energy_start or "09:00"),
        peak_energy_end=str(behavioural.peak_energy_end or "13:00"),
        wake_time=str(behavioural.wake_time),
        sleep_time=str(behavioural.sleep_time),
        daily_commitment_hrs=float(behavioural.daily_commitment_hrs),
        heavy_days=behavioural.heavy_days or [],
        light_days=behavioural.light_days or [],
        chronotype=behavioural.chronotype,
    )

    task_requirements = _generate_task_requirements(
        goal,
        behavioural,
        active_patterns,
    )

    solver_result = solver.solve(
        target_date=target_date,
        task_requirements=task_requirements,
        day_type=data.day_type or "standard",
    )

    # Fix #4 — await async LLM
    enrichment = None
    prompt = None
    if data.use_llm:
        days_until_deadline = (goal.target_date - target_date).days
        prompt = build_schedule_prompt(
            solver_result=solver_result,
            goal_title=goal.title,
            goal_type=goal.goal_type,
            goal_metadata=goal.goal_metadata or {},
            chronotype=behavioural.chronotype,
            self_reported_failure=behavioural.self_reported_failure,
            days_until_deadline=days_until_deadline,
            active_patterns=active_patterns,
            trajectory=trajectory,
        )
        preferred_model = getattr(getattr(user, "user_settings", None), "preferred_model", "primary") or "primary"
        enrichment = await call_llm(prompt, settings.GROQ_API_KEY, preferred_model=preferred_model)

    if not enrichment:
        days_until_deadline = (goal.target_date - target_date).days
        enrichment = build_fallback_enrichment(
            solver_result,
            goal.title,
            days_until_deadline,
            active_patterns=active_patterns,
            trajectory=trajectory,
        )
    enrichment = _sanitize_enrichment(enrichment, solver_result)

    # Fix #3 — race-safe save
    try:
        schedule = await _save_schedule(
            user_id=user.id,
            goal_id=goal.id,
            target_date=target_date,
            solver_result=solver_result,
            enrichment=enrichment,
            generation_prompt=prompt,
            db=db,
        )
    except IntegrityError:
        # Another request created this schedule concurrently
        await db.rollback()
        existing = await _get_existing_schedule(user.id, target_date, db)
        if existing:
            return await _build_schedule_response(existing, db)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Schedule creation conflict. Please retry.",
        )

    return await _build_schedule_response(schedule, db)


async def get_today_schedule(user: User, db: AsyncSession) -> ScheduleResponse:
    today    = get_user_today(getattr(user, "timezone", "Asia/Kolkata"))
    existing = await _get_existing_schedule(user.id, today, db)
    if existing:
        return await _build_schedule_response(existing, db)
    return await generate_schedule(
        user,
        GenerateScheduleRequest(target_date=today.isoformat()),
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
        today      = date.today()
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


async def _get_active_goal(
    user_id: uuid.UUID, db: AsyncSession
) -> Optional[Goal]:
    result = await db.execute(
        select(Goal).where(
            and_(
                Goal.user_id    == user_id,
                Goal.status     == "active",
                Goal.deleted_at.is_(None),
            )
        )
    )
    return result.scalar_one_or_none()


async def _get_fixed_blocks_for_date(
    user_id: uuid.UUID, target_date: date, db: AsyncSession
) -> List[FixedBlock]:
    python_weekday = target_date.weekday()
    day_of_week    = (python_weekday + 2) % 7 or 7

    # Fix #10 — filter by day at DB level, date range in Python (ARRAY contains)
    from sqlalchemy import and_, or_
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
            # In production this would go to structured logging
            logger.warning("fixed_block_overlap_detected", extra={"block_1": t1, "block_2": t2})


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
    goal_id: uuid.UUID,
    target_date: date,
    solver_result,
    enrichment: dict,
    generation_prompt: Optional[str],
    db: AsyncSession,
) -> Schedule:
    """Save schedule + scheduled tasks + parked tasks."""
    schedule = Schedule(
        user_id=user_id,
        goal_id=goal_id,
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

    # Save scheduled tasks
    for solver_task in solver_result.scheduled_tasks:
        description = task_descriptions.get(solver_task.title, solver_task.description)
        task = Task(
            schedule_id=schedule.id,
            user_id=user_id,
            goal_id=goal_id,
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
        )
        db.add(task)

    # Fix #7 — save unscheduled tasks as "deferred" (Parking Lot)
    for i, unscheduled_task in enumerate(solver_result.unscheduled_tasks):
        task = Task(
            schedule_id=None,   # not on any schedule — in parking lot
            user_id=user_id,
            goal_id=goal_id,
            title=unscheduled_task.title,
            description=None,
            task_type=unscheduled_task.task_type,
            scheduled_start=None,   # Fix #14 — no time for deferred tasks
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
    db: AsyncSession,
) -> ScheduleResponse:
    """Load schedule + tasks and build full response with parked tasks."""

    # Active tasks on this schedule
    result = await db.execute(
        select(Task).where(
            and_(
                Task.schedule_id == schedule.id,
                Task.task_status == "active",
                Task.deleted_at.is_(None),
            )
        ).order_by(Task.sequence_order)
    )
    tasks = result.scalars().all()

    # Fix #6 — only load parked tasks created today or not yet scheduled
    # This prevents accumulating the entire history of parked tasks
    result_parked = await db.execute(
        select(Task).where(
            and_(
                Task.user_id     == schedule.user_id,
                Task.goal_id     == schedule.goal_id,
                Task.task_status.in_(["deferred", "parked"]),
                Task.deleted_at.is_(None),
                # Only tasks created on the same day as this schedule
                Task.created_at >= schedule.created_at - timedelta(hours=1),
            )
        ).order_by(Task.priority, Task.sequence_order)
    )
    parked_tasks = result_parked.scalars().all()

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

    goal = await _get_active_goal(user.id, db)
    if goal:
        patterns, trajectory = await insights_service.get_live_schedule_context(
            user=user,
            goal=goal,
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
