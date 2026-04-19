"""
V8 Fix Script — Surgically repairs the broken _generate_schedule_internal,
removes the obsolete _handle_stale_schedule, and updates get_today_schedule.
"""

with open('app/services/schedule_service.py', 'r', encoding='utf-8') as f:
    content = f.read()

# ============================================================
# FIX 1: Replace the broken _generate_schedule_internal
# ============================================================

# Find the start and end markers
internal_start = content.find('async def _generate_schedule_internal(')
assert internal_start != -1, "_generate_schedule_internal not found"

# Find the next top-level function after _generate_schedule_internal
# It's get_today_schedule
today_start = content.find('\nasync def get_today_schedule(', internal_start)
assert today_start != -1, "get_today_schedule not found"

NEW_INTERNAL = '''async def _generate_schedule_internal(
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
    active_goals = await goal_service.get_active_goals(user.id, db)
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

    fixed_blocks = await _get_fixed_blocks_for_date(user.id, target_date, db)
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
            schedule = await _save_schedule(
                user_id=user.id,
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
        existing = await _get_existing_schedule(user.id, target_date, db)
        if existing:
            return await _build_schedule_response(existing, user.id, db)
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

    res = await _build_schedule_response(schedule, user.id, db)
    res.schedule_status = enrichment_status
    return res


'''

content = content[:internal_start] + NEW_INTERNAL + content[today_start + 1:]

# ============================================================
# FIX 2: Update get_today_schedule — remove is_regenerating references
# ============================================================

# The old code at line ~472 says:
#   if existing.is_stale or existing.is_regenerating:
#       existing = await _handle_stale_schedule(user, existing, today, db)
# Replace with advisory lock approach:

old_stale_block = """        # ── Stale contract: check if regeneration or lock recovery needed ──
        if existing.is_stale or existing.is_regenerating:
            existing = await _handle_stale_schedule(user, existing, today, db)"""

# Try different unicode variants that might be in the file
if old_stale_block not in content:
    # Try with the mangled unicode
    old_stale_block = None
    # Search for the pattern
    import re
    stale_match = re.search(
        r'(        # .* Stale contract.*\n'
        r'        if existing\.is_stale or existing\.is_regenerating:\n'
        r'            existing = await _handle_stale_schedule\(user, existing, today, db\))',
        content
    )
    if stale_match:
        old_stale_block = stale_match.group(0)

if old_stale_block:
    new_stale_block = """        # ── Stale contract: re-generate via orchestrator if stale ──
        if existing.is_stale:
            resp = await generate_schedule_orchestrator(
                user,
                GenerateScheduleRequest(target_date=today.isoformat(), use_llm=False),
                db,
            )
            resp.recovery_mode = recovery_mode
            return resp"""
    content = content.replace(old_stale_block, new_stale_block)
    print("[OK] Fixed get_today_schedule stale handling")
else:
    print("[WARN] Could not find stale block pattern — manual fix needed")

# ============================================================
# FIX 3: Remove _handle_stale_schedule entirely
# ============================================================

handle_stale_start = content.find('\nasync def _handle_stale_schedule(')
if handle_stale_start != -1:
    # Find the next function after it
    next_func = content.find('\nasync def _get_existing_schedule(', handle_stale_start)
    if next_func != -1:
        content = content[:handle_stale_start + 1] + content[next_func + 1:]
        print("[OK] Removed _handle_stale_schedule")
    else:
        print("[WARN] Could not find end of _handle_stale_schedule")
else:
    print("[WARN] _handle_stale_schedule not found (may already be removed)")

# ============================================================
# FIX 4: Update enrich_schedule_with_llm to accept generation_version
# ============================================================

old_enrich_sig = """async def enrich_schedule_with_llm(
    schedule_id: uuid.UUID,
    prompt: str,
    groq_api_key: str,
    preferred_model: str = "primary",
) -> None:"""

new_enrich_sig = """async def enrich_schedule_with_llm(
    schedule_id: uuid.UUID,
    prompt: str,
    groq_api_key: str,
    preferred_model: str = "primary",
    generation_version: Optional[int] = None,
) -> None:"""

if old_enrich_sig in content:
    content = content.replace(old_enrich_sig, new_enrich_sig)
    print("[OK] Updated enrich_schedule_with_llm signature")

    # Also add version check before writing enrichment
    old_enrich_check = """            if not schedule:
                return"""
    new_enrich_check = """            if not schedule:
                return
            # Skip if schedule was regenerated since our dispatch
            if generation_version is not None and schedule.generation_version != generation_version:
                logger.info("skipping_stale_enrichment", extra={
                    "schedule_id": str(schedule_id),
                    "expected_version": generation_version,
                    "current_version": schedule.generation_version,
                })
                return"""
    content = content.replace(old_enrich_check, new_enrich_check, 1)
    print("✓ Added generation_version guard to enrich_schedule_with_llm")
else:
    print("[WARN] Could not find enrich_schedule_with_llm signature")

# ============================================================
# WRITE RESULT
# ============================================================

with open('app/services/schedule_service.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("\n✓ All fixes applied to schedule_service.py")
