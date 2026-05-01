"""
Schedule Service — V8 (Advisory Lock Architecture) + Sprint 7 Hardening

Portfolio ownership: schedules are user-day scoped (no goal_id on Schedule).
Tasks still belong to individual goals via task.goal_id.

Concurrency: PostgreSQL advisory locks keyed by (user_id, target_date).
- Cross-day cleanup: expire active tasks from past schedules
- Horizon Line: uses scheduled_end in user timezone with grace window
- Stale contract: is_stale flag triggers re-generation via advisory lock
- Parked tasks: filtered by active goal IDs, not bare user_id
- Background LLM enrichment with generation_version guard

Sprint 7 additions:
- Recurring task integration via get_recurring_requirements() (§6/§11)
- SAVEPOINT dedup for recurring tasks with safe_expunge() (P0#1, P1#4)
- Hardened _parse_time() with DST-safe fold=0 (§7, P1#5)
- Prometheus instrumentation with low-cardinality labels (P2#7)
"""

import asyncio
import contextlib
import hashlib
import hmac
import logging
import struct
import time
from datetime import date, datetime, timedelta, timezone, time as time_type
from typing import Optional, List
import uuid
from zoneinfo import ZoneInfo

from app.config import settings

from app.core.timezone import get_user_today
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
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
    PRIORITY_LABELS, HORIZON_GRACE_MINS,
)
from app.database import engine
from app.services.llm_service import (
    build_schedule_prompt, call_llm, build_fallback_enrichment
)
from app.services import insights_service
from app.services import goal_service
from app.services.recurring_task_service import get_recurring_requirements
logger = logging.getLogger(__name__)


def _parse_time(value) -> time_type:
    """I38/D56: Type-safe time parsing with malformed string protection.

    Returns a naive time object. Callers MUST explicitly localize via
    ZoneInfo before combining with a date. See I46.
    """
    if value is None:
        raise ValueError("Cannot parse None as time")
    if isinstance(value, time_type):
        return value
    if isinstance(value, datetime):
        return value.time()
    if isinstance(value, str):
        parts = value.split(":")[:2]
        if len(parts) != 2:
            raise ValueError(f"Invalid time format: {value!r}")
        try:
            h, m = int(parts[0]), int(parts[1])
        except ValueError:
            raise ValueError(f"Invalid time component in {value!r}")
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError(f"Time out of range: {value!r}")
        return time_type(h, m)
    raise TypeError(f"Unsupported time type: {type(value)}")


def get_localized_reminder_time(target_date: date, time_val: str | time_type, user_timezone: str) -> datetime:
    """I46: Convert a naive scheduled time into a DST-safe UTC datetime for reminders.
    
    Safe across DST fall-back (fold=0 prevents ambiguous duplicates).
    """
    naive_t = _parse_time(time_val)
    user_tz = ZoneInfo(user_timezone)
    local_dt = datetime.combine(target_date, naive_t, tzinfo=user_tz)
    local_dt = local_dt.replace(fold=0)       # I46 / DST ambiguity
    return local_dt.astimezone(timezone.utc)

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



def _build_lock_key(user_id: uuid.UUID, target_date: date) -> int:
    hash_str = f"regen_lock:{user_id}:{target_date.isoformat()}"
    digest = hashlib.sha256(hash_str.encode()).digest()
    val = struct.unpack(">q", digest[:8])[0]
    return val


@contextlib.asynccontextmanager
async def _pinned_advisory_lock(db_engine, key: int):
    """Acquire a PostgreSQL session-level advisory lock on a dedicated session.

    Uses async_sessionmaker to create a fresh session on its own connection,
    keeping the advisory lock independent of the caller's request session.

    Design note: session-level locks (pg_try_advisory_lock) are intentional.
    The lock must survive across transaction boundaries because the schedule
    write happens on the caller's `db` session (separate transaction). The
    transaction-scoped variant (pg_try_advisory_xact_lock) would release
    when *this* session's transaction ends — before `db` commits — allowing
    a second worker to acquire the lock prematurely.

    Crash recovery: if the worker crashes before the finally block, the lock
    leaks until the connection is recycled by the pool (idle timeout or
    overflow eviction). pool_pre_ping does NOT release leaked locks — it
    only detects broken TCP connections.
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker as _asm

    _factory = _asm(bind=db_engine, expire_on_commit=False)
    # Manual session lifecycle: close immediately on non-acquisition
    # so the loser's 20s polling loop doesn't hold an idle connection.
    _session_ctx = _factory()
    lock_session = await _session_ctx.__aenter__()
    try:
        logger.info(f"Attempting advisory lock {key}")
        result = await lock_session.execute(select(func.pg_try_advisory_lock(key)))
        acquired = result.scalar()
    except Exception:
        await _session_ctx.__aexit__(None, None, None)
        raise

    if not acquired:
        logger.info(f"Failed to acquire advisory lock {key}")
        await _session_ctx.__aexit__(None, None, None)  # free connection immediately
        yield False
        return

    logger.info(f"Acquired advisory lock {key}")
    try:
        yield True
    finally:
        try:
            await lock_session.execute(select(func.pg_advisory_unlock(key)))
            logger.info(f"Released advisory lock {key}")
        finally:
            await _session_ctx.__aexit__(None, None, None)


async def generate_schedule_orchestrator(
    user: User,
    data: GenerateScheduleRequest,
    db: AsyncSession,
) -> ScheduleResponse:
    target_date = (
        date.fromisoformat(data.target_date)
        if data.target_date else get_user_today(user.timezone)
    )
    # The actual implementation of wrapped generation
    existing = await _get_existing_schedule(user.id, target_date, db)
    if existing and not existing.is_stale:
        res = await _build_schedule_response(existing, user.id, db)
        res.schedule_status = "ready"
        return res
        
    version_at_entry = existing.generation_version if existing else 0
    
    lock_key = _build_lock_key(user.id, target_date)
    async with _pinned_advisory_lock(engine, lock_key) as acquired:
        if acquired:
            # Check again now we have lock
            existing = await _get_existing_schedule(user.id, target_date, db)
            if existing and not existing.is_stale and existing.generation_version > version_at_entry:
                res = await _build_schedule_response(existing, user.id, db)
                res.schedule_status = "ready"
                return res
            
            # Actually run logic
            return await _generate_schedule_internal(user, data, db, target_date, existing)
        else:
            # Wait for winner to commit
            start = time.time()
            WAIT_WINDOW_SECS = getattr(settings, "SCHEDULE_REGEN_LOCK_TIMEOUT", 20.0)
            while time.time() - start < WAIT_WINDOW_SECS:
                await asyncio.sleep(2.0)
                fresh = await _get_existing_schedule(user.id, target_date, db)
                if fresh and not fresh.is_stale:
                    res = await _build_schedule_response(fresh, user.id, db)
                    res.schedule_status = "ready"
                    return res
            if existing:
                res = await _build_schedule_response(existing, user.id, db)
                res.schedule_status = "stale_fallback"
                return res
            raise HTTPException(
                status_code=status.HTTP_202_ACCEPTED,
                detail="Schedule is being generated. Retry in a moment.",
            )

async def _generate_schedule_internal(
    user: User,
    data: GenerateScheduleRequest,
    db: AsyncSession,
    target_date: date,
    existing: Optional[Schedule] = None,
) -> ScheduleResponse:
    """
    Core generation logic — called by the orchestrator after the advisory lock
    is acquired. Assumes caller already verified no fresh schedule exists.
    """
    # Capture user_id eagerly to avoid MissingGreenlet if session expires user
    user_id = user.id

    # Load required profiles
    behavioural = await _get_behavioural_profile(user_id, db)
    if not behavioural:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete your behavioural profile before generating a schedule.",
        )

    # Load health profile for solver capacity modifiers
    health_profile = await _get_health_profile(user_id, db)
    capacity_modifier = 1.0
    max_block_mins = 90  # noqa: F841 — will be used when solver supports block limits
    avoid_afternoon_peak = False  # noqa: F841 — will be used when solver supports afternoon guard

    if health_profile:
        if health_profile.has_chronic_fatigue:
            capacity_modifier *= 0.85
        if health_profile.sleep_quality == "poor":
            capacity_modifier *= 0.90
        elif health_profile.sleep_quality == "irregular":
            capacity_modifier *= 0.93
        if health_profile.average_sleep_hrs and float(health_profile.average_sleep_hrs) < 6:
            capacity_modifier *= 0.90
        if health_profile.has_focus_difficulty:
            max_block_mins = 30  # noqa: F841
        if health_profile.has_afternoon_crash:
            avoid_afternoon_peak = True  # noqa: F841

    # Multi-goal: fetch all active goals
    active_goals = await goal_service.get_active_goals(user_id, db)
    if not active_goals:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Create a goal before generating a schedule.",
        )

    # Build GoalTaskGroups for the two-pass allocator
    goal_task_groups: List[GoalTaskGroup] = []
    primary_goal = active_goals[0]  # Highest ranked for LLM/insights context
    active_patterns = []
    trajectory = None

    for goal in active_goals:
        patterns, traj = await insights_service.get_live_schedule_context(
            user=user,
            goal=goal,
            db=db,
            target_date=target_date,
        )
        # Keep patterns/trajectory from primary goal for LLM prompt
        if goal.id == primary_goal.id:
            active_patterns = patterns
            trajectory = traj

        task_requirements = _generate_task_requirements(
            goal,
            behavioural,
            patterns,
        )

        goal_task_groups.append(GoalTaskGroup(
            goal_id=str(goal.id),
            goal_rank=goal.priority_rank or 999,
            goal_title=goal.title,
            tasks=task_requirements,
        ))

    # --- Slice 3b: Recurring rules → solver (§11) ---
    import logging
    from app.services.recurring_task_service import get_recurring_requirements

    _logger = logging.getLogger(__name__)

    recurring_reqs = await get_recurring_requirements(user_id, target_date, db)

    for req in recurring_reqs:
        matching_group = next(
            (g for g in goal_task_groups if g.goal_id == req.goal_id), None
        )
        if matching_group:
            matching_group.tasks.append(req)
        else:
            # P1 FIX: Log orphaned rule instead of silent skip (§11)
            _logger.warning(
                "recurring_rule_orphaned",
                extra={
                    "rule_id": req.recurring_rule_id,
                    "goal_id": req.goal_id,
                },
            )
    # --- end Slice 3b ---

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

    start_time = time.perf_counter_ns()
    solver_result = solver.solve(
        target_date=target_date,
        goal_task_groups=goal_task_groups,
        day_type=data.day_type or "standard",
    )
    latency_ms = (time.perf_counter_ns() - start_time) // 1_000_000

    # Build LLM prompt before save (needed for generation_prompt column)
    prompt = None
    enrichment_status = "ready"
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
        enrichment_status = "generating"

    # Build fallback enrichment (used immediately; LLM enrichment overwrites later)
    enrichment = build_fallback_enrichment(
        solver_result, primary_goal.title,
        (primary_goal.target_date - target_date).days,
        active_patterns=active_patterns,
        trajectory=trajectory,
    )
    enrichment = _sanitize_enrichment(enrichment, solver_result)

    # Race-safe save using a savepoint
    try:
        async with db.begin_nested():
            # Soft-delete the old schedule so the partial unique index
            # (user_id, schedule_date) WHERE deleted_at IS NULL allows the INSERT
            if existing:
                existing.deleted_at = func.now()
                await db.flush()

            schedule = await _save_schedule(
                user_id=user_id,
                target_date=target_date,
                solver_result=solver_result,
                enrichment=enrichment,
                generation_prompt=prompt,
                solver_latency_ms=latency_ms,
                db=db,
            )
            schedule.is_stale = False
            schedule.generation_version = (
                (existing.generation_version + 1) if existing else 1
            )
            await db.flush()
    except IntegrityError:
        await db.rollback()
        existing = await _get_existing_schedule(user_id, target_date, db)
        if existing:
            return await _build_schedule_response(existing, user_id, db)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Schedule creation conflict. Please retry.",
        )

    # Fire background LLM enrichment (non-blocking)
    if data.use_llm and prompt:
        asyncio.create_task(
            enrich_schedule_with_llm(
                schedule_id=schedule.id,
                generation_version=schedule.generation_version,
                prompt=prompt,
                groq_api_key=getattr(settings, "GROQ_API_KEY", ""),
            )
        )

    res = await _build_schedule_response(schedule, user_id, db)
    res.schedule_status = enrichment_status
    return res


async def get_today_schedule(user: User, db: AsyncSession) -> ScheduleResponse:
    # Sick mode guard ΓÇö return paused response
    if user.paused_at is not None:
        from app.core.constants import BANKRUPTCY_INACTIVITY_DAYS
        return ScheduleResponse(
            id=uuid.uuid4(),
            user_id=user.id,
            schedule_date=get_user_today(user.timezone),
            day_type="paused",
            day_type_reason=f"Account paused: {user.paused_reason or 'rest mode'}",
            strategy_note="You're on a break. Rest up ΓÇö your goals will be here when you're ready.",
            tasks=[],
            parked_tasks=[],
            total_tasks=0,
            total_study_mins=0,
            day_capacity_hrs=0.0,
            recovery_mode=False,
            is_paused=True,
        )

    today = get_user_today(user.timezone)

    # ΓöÇΓöÇ Cross-day cleanup: expire active tasks from past schedules ΓöÇΓöÇ
    await _cross_day_cleanup(user.id, today, db)

    # Schedule bankruptcy detection ΓÇö check for missed days
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
        # Auto-park active tasks from past schedules only (not today or future)
        past_schedule_ids = select(Schedule.id).where(
            and_(
                Schedule.user_id == user.id,
                Schedule.schedule_date < today,
                Schedule.deleted_at.is_(None),
            )
        ).scalar_subquery()

        missed_tasks = await db.execute(
            select(Task).where(
                and_(
                    Task.user_id == user.id,
                    Task.task_status == "active",
                    Task.deleted_at.is_(None),
                    Task.schedule_id.in_(past_schedule_ids),
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
        # ΓöÇΓöÇ Apply Horizon Line (expire past tasks) ΓöÇΓöÇ
        await _apply_horizon_line(user.id, existing, user.timezone, db)

        # ── Stale contract: re-generate via orchestrator if stale ──
        if existing.is_stale:
            resp = await generate_schedule_orchestrator(
                user,
                GenerateScheduleRequest(target_date=today.isoformat(), use_llm=False),
                db,
            )
            resp.recovery_mode = recovery_mode
            return resp

        resp = await _build_schedule_response(existing, user.id, db)
        resp.recovery_mode = recovery_mode
        resp.is_stale = existing.is_stale
        return resp

    resp = await generate_schedule_orchestrator(
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
    return await generate_schedule_orchestrator(
        user,
        GenerateScheduleRequest(target_date=today.isoformat(), use_llm=False),
        db,
    )


# Semaphore caps concurrent day-generation to avoid pool exhaustion.
# After the fix below, each day uses 2 connections (day_db + lock_session).
# With pool_size=10 + max_overflow=20 = 30 max, limiting to 3 concurrent
# days uses at most 6 connections per week request, safe for ~4 concurrent
# week requests before pool pressure.
_WEEK_CONCURRENCY = asyncio.Semaphore(3)


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

    # Each day gets its own session to avoid concurrent mutation of a
    # shared AsyncSession (identity map, flush queue, transaction state).
    # Semaphore limits concurrency to prevent pool exhaustion.
    async def _generate_one(target: date) -> Optional[ScheduleResponse]:
        from app.database import AsyncSessionLocal
        async with _WEEK_CONCURRENCY:
            async with AsyncSessionLocal() as day_db:
                try:
                    result = await generate_schedule_orchestrator(
                        user,
                        GenerateScheduleRequest(target_date=target.isoformat(), use_llm=False),
                        day_db,
                    )
                    await day_db.commit()
                    return result
                except Exception:
                    await day_db.rollback()
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


# ΓöÇΓöÇ Private helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ


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
        tz = ZoneInfo(user_tz)
    except Exception:
        # Fall back to UTC — not None — to avoid using server-local time.
        # A user in Asia/Kolkata on a UTC server would otherwise have tasks
        # expire ~5.5 hours early/late.
        logger.warning("timezone_fallback_to_utc", extra={"user_tz": user_tz})
        tz = timezone.utc

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

    # Fix #10 ΓÇö filter by day at DB level, date range in Python (ARRAY contains)
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
    Fix #8 ΓÇö detect fixed block conflicts.
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
            # Overlap detected ΓÇö log it but continue
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
    solver_latency_ms: Optional[int] = None,
) -> Schedule:
    """Save schedule + scheduled tasks + parked tasks (portfolio-level, no goal_id).

    Sprint 7: Recurring tasks use SAVEPOINT-per-task dedup.
    On IntegrityError (uq_task_per_rule_per_date), the SAVEPOINT rolls back
    only that task, and safe_expunge() (P1#4) removes the failed object +
    all its loaded relationships from the identity map.
    """
    schedule = Schedule(
        user_id=user_id,
        schedule_date=target_date,
        day_type=solver_result.day_type,
        day_type_reason=enrichment.get("day_type_reason"),
        strategy_note=enrichment.get("strategy_note"),
        generated_by="ai",
        model_used="openrouter/qwen3.5" if settings.OPENROUTER_API_KEY else "groq/llama-3.3-70b",
        generation_prompt=generation_prompt,
        solver_latency_ms=solver_latency_ms,
    )
    db.add(schedule)
    await db.flush()

    task_descriptions = enrichment.get("task_descriptions", {})

    # Save scheduled tasks (including goal_id, goal_rank_snapshot, recurring provenance)
    for solver_task in solver_result.scheduled_tasks:
        description = task_descriptions.get(solver_task.title, solver_task.description)
        # Parse goal_id from solver's string UUID
        task_goal_id = uuid.UUID(solver_task.goal_id) if solver_task.goal_id else None
        # Sprint 7: Recurring task provenance (§4)
        rule_id = (
            uuid.UUID(solver_task.recurring_rule_id)
            if getattr(solver_task, 'recurring_rule_id', None)
            else None
        )
        src_date = getattr(solver_task, 'source_date', None)

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
            recurring_rule_id=rule_id,
            source_date=src_date,
        )

        # D54/D57: Index-only dedup — SAVEPOINT wraps the recurring insert
        if solver_task.recurring_rule_id:
            from sqlalchemy.exc import IntegrityError
            try:
                async with db.begin_nested():
                    db.add(task)
                    await db.flush()
            except IntegrityError:
                from app.core.metrics import recurring_dedup_index_blocked
                recurring_dedup_index_blocked.inc()
                db.expunge(task)
                logger.info(
                    "recurring_task_duplicate_blocked",
                    extra={
                        "rule_id": solver_task.recurring_rule_id,
                        "date": str(solver_task.source_date or ""),
                    },
                )
        else:
            db.add(task)

    # Save unscheduled tasks as "deferred" (Parking Lot)
    # D57: Deferred recurring tasks still consume the daily slot. The unique index
    # (recurring_rule_id, source_date) prevents re-creation regardless of
    # scheduled vs deferred status. If a recurring task is deferred, it will NOT
    # be re-generated for the same date — the deferred version IS the task.
    for i, unscheduled_task in enumerate(solver_result.unscheduled_tasks):
        task = Task(
            schedule_id=None,   # not on any schedule — in parking lot
            user_id=user_id,
            goal_id=uuid.UUID(unscheduled_task.goal_id) if unscheduled_task.goal_id else None,
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
            # I41: recurring_rule_id (not source_rule_id)
            recurring_rule_id=uuid.UUID(unscheduled_task.recurring_rule_id)
                if unscheduled_task.recurring_rule_id else None,
            source_date=unscheduled_task.source_date,
        )

        # D54/D57: Index-only dedup — SAVEPOINT wraps the recurring insert
        if unscheduled_task.recurring_rule_id:
            from sqlalchemy.exc import IntegrityError
            try:
                async with db.begin_nested():
                    db.add(task)
                    await db.flush()
            except IntegrityError:
                from app.core.metrics import recurring_dedup_index_blocked
                recurring_dedup_index_blocked.inc()
                db.expunge(task)
                logger.info(
                    "recurring_task_duplicate_blocked",
                    extra={
                        "rule_id": unscheduled_task.recurring_rule_id,
                        "date": str(unscheduled_task.source_date or ""),
                    },
                )
        else:
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
        solver_latency_ms=schedule.solver_latency_ms,
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


# ΓöÇΓöÇ Background LLM Enrichment (Fix #9 ΓÇö offloaded) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ


async def enrich_schedule_with_llm(
    schedule_id: uuid.UUID,
    prompt: str,
    groq_api_key: str,
    preferred_model: str = "primary",
    generation_version: Optional[int] = None,
) -> None:
    """
    Background task: call LLM and update schedule enrichment in DB.
    Called after the fast solver response is already returned to the client.
    """
    from app.database import AsyncSessionLocal

    try:
        # Cap total provider chain to 45s. Individual providers have their
        # own httpx timeouts (OpenRouter 30s, Groq 15s, Ollama 60s) but
        # sequential fallthrough can take up to 105s. This background task
        # holds a DB connection (below), so unbounded wait = pool exhaustion.
        try:
            enrichment = await asyncio.wait_for(
                call_llm(prompt, groq_api_key, preferred_model=preferred_model),
                timeout=45.0,
            )
        except asyncio.TimeoutError:
            logger.warning("llm_enrichment_timeout", extra={"schedule_id": str(schedule_id)})
            return
        if not enrichment:
            return

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Schedule).where(Schedule.id == schedule_id)
            )
            schedule = result.scalar_one_or_none()
            if not schedule:
                return
            # Skip if schedule was regenerated since our dispatch
            if generation_version is not None and schedule.generation_version != generation_version:
                logger.info("skipping_stale_enrichment", extra={
                    "schedule_id": str(schedule_id),
                    "expected_version": generation_version,
                    "current_version": schedule.generation_version,
                })
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
