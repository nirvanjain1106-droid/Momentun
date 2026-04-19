
with open("app/services/schedule_service.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
in_remove_block = False

new_code = """
def _build_lock_key(user_id: uuid.UUID, target_date: date) -> int:
    hash_str = f"regen_lock:{user_id}:{target_date.isoformat()}"
    digest = hashlib.sha256(hash_str.encode()).digest()
    import struct
    val = struct.unpack(">q", digest[:8])[0]
    return val

@contextlib.asynccontextmanager
async def _pinned_advisory_lock(db_engine, key: int):
    async with db_engine.connect() as conn:
        logger.info(f"Attempting advisory lock {key}")
        result = await conn.execute(select(func.pg_try_advisory_lock(key)))
        acquired = result.scalar()
        if not acquired:
            logger.info(f"Failed to acquire advisory lock {key}")
            yield False
            return
            
        logger.info(f"Acquired advisory lock {key}")
        try:
            yield True
        finally:
            await conn.execute(select(func.pg_advisory_unlock(key)))
            logger.info(f"Released advisory lock {key}")

async def generate_schedule_orchestrator(
    user: User,
    db: AsyncSession,
    target_date: date,
    day_type: str = "standard",
    use_llm: bool = True,
    force_regenerate: bool = False,
) -> ScheduleResponse:
    existing = await _get_existing_schedule(user.id, target_date, db)
    
    if existing and not existing.is_stale and not force_regenerate:
        res = await _build_schedule_response(existing, user.id, db)
        res.schedule_status = "ready"
        return res
    
    version_at_entry = existing.generation_version if existing else 0
    if existing and force_regenerate and not existing.is_stale:
        existing.is_stale = True
        await db.commit()
    else:
        await db.commit()
        
    lock_key = _build_lock_key(user.id, target_date)
    from app.database import engine
    from app.services.solver.constraint_solver import SolverInput
    
    async with _pinned_advisory_lock(engine, lock_key) as acquired:
        if acquired:
            result = await db.execute(
                select(Schedule).where(
                    Schedule.user_id == user.id,
                    Schedule.schedule_date == target_date,
                    Schedule.deleted_at.is_(None)
                ).execution_options(populate_existing=True)
            )
            existing = result.scalar_one_or_none()
            
            if existing and not force_regenerate and not existing.is_stale and existing.generation_version > version_at_entry:
                res = await _build_schedule_response(existing, user.id, db)
                res.schedule_status = "ready"
                return res
                
            try:
                behavioural = await db.execute(
                    select(UserBehaviouralProfile).where(UserBehaviouralProfile.user_id == user.id)
                )
                b = behavioural.scalar_one_or_none()
                if not b:
                    raise HTTPException(status_code=400, detail="Behavioural profile not found")
                
                logger.info(f"Running constraint solver for {user.id} on {target_date}")
                
                active_goals = await db.execute(
                    select(Goal).where(
                        Goal.user_id == user.id,
                        Goal.status == "active",
                        Goal.deleted_at.is_(None)
                    )
                )
                active_goal_ids = [g.id for g in active_goals.scalars().all()]
                
                active_reqs_qs = await db.execute(
                    select(Task).where(
                        Task.user_id == user.id,
                        Task.task_status.in_(["active", "deferred", "parked"]),
                        Task.deleted_at.is_(None),
                        or_(
                            Task.goal_id.in_(active_goal_ids),
                            Task.goal_id.is_(None)
                        )
                    )
                )
                domain_tasks = active_reqs_qs.scalars().all()
                target_tasks = []
                for t in domain_tasks:
                   target_tasks.append(
                       TaskRequirement(
                           id=t.id,
                           title=t.title,
                           task_type=t.task_type,
                           priority_label=t.priority_label,
                           duration_mins=t.duration_mins,
                           energy_required=t.energy_required,
                           is_mvp_task=t.is_mvp_task,
                           task_status=t.task_status,
                           schedule_id=t.schedule_id,
                           goal_id=t.goal_id,
                           goal_rank=0
                       )
                   )
                
                adjusted_commitment = b.daily_commitment_hrs
                if day_type == "recovery":
                    adjusted_commitment = max(1.0, adjusted_commitment * 0.5)
                elif day_type in ("stretch", "compressed"):
                    adjusted_commitment = min(12.0, adjusted_commitment * 1.5)
                    
                inp = SolverInput(
                    target_date=target_date,
                    tasks=target_tasks,
                    day_type=day_type,
                    wake_time=str(b.wake_time),
                    sleep_time=str(b.sleep_time),
                    daily_commitment_hrs=adjusted_commitment,
                    heavy_days=b.heavy_days or [],
                    light_days=b.light_days or [],
                    chronotype=b.chronotype,
                )
                solver = await build_solver_for_user(user.id, target_date, db)
                solver.daily_commitment_hrs = adjusted_commitment
                import asyncio
                out = await asyncio.to_thread(solver.generate_schedule, inp)
                
                async with db.begin():
                    if existing:
                        replaceable_qs = await db.execute(
                            select(Task)
                            .outerjoin(TaskLog, TaskLog.task_id == Task.id)
                            .where(
                                Task.schedule_id == existing.id,
                                Task.task_status.in_(["active", "deferred"]),
                                Task.deleted_at.is_(None),
                                TaskLog.id.is_(None)
                            )
                        )
                        for t in replaceable_qs.scalars().all():
                            await db.delete(t)
                            
                        logged_qs = await db.execute(
                            select(Task)
                            .join(TaskLog, TaskLog.task_id == Task.id)
                            .where(
                                Task.schedule_id == existing.id,
                                Task.task_status.in_(["active", "deferred"]),
                                Task.deleted_at.is_(None)
                            )
                        )
                        for t in logged_qs.scalars().all():
                            t.deleted_at = func.now()
                            t.previous_status = t.task_status
                            t.task_status = "expired"

                    if not existing:
                        schedule = Schedule(
                            user_id=user.id,
                            schedule_date=target_date,
                            day_type=day_type,
                            day_capacity_hrs=out.day_capacity_hrs,
                            total_study_mins=out.total_study_mins,
                            total_tasks=out.metrics_total_tasks,
                            day_type_reason=out.day_type_reason,
                            strategy_note=out.strategy_note,
                            is_stale=False,
                            generation_version=1,
                            solver_latency_ms=0
                        )
                        db.add(schedule)
                        await db.flush()
                        existing = schedule
                    else:
                        existing.is_stale = False
                        existing.generation_version += 1
                        existing.day_type = day_type
                        existing.day_capacity_hrs = out.day_capacity_hrs
                        existing.total_study_mins = out.total_study_mins
                        existing.total_tasks = out.metrics_total_tasks
                        existing.day_type_reason = out.day_type_reason
                        existing.strategy_note = out.strategy_note
                    
                    for st in out.scheduled_tasks:
                        db.add(Task(
                            user_id=user.id,
                            schedule_id=existing.id,
                            goal_id=st.goal_id,
                            title=st.title,
                            task_type=st.task_type,
                            task_status=st.task_status,
                            scheduled_start=st.scheduled_start,
                            scheduled_end=st.scheduled_end,
                            duration_mins=st.duration_mins,
                            energy_required=st.energy_required,
                            priority=st.priority,
                            priority_label=st.priority_label,
                            is_mvp_task=st.is_mvp_task,
                            sequence_order=st.sequence_order,
                            slot_reasons=st.slot_reasons,
                        ))
                    for dt in out.deferred_tasks:
                        db.add(Task(
                            user_id=user.id,
                            schedule_id=existing.id,
                            goal_id=dt.goal_id,
                            title=dt.title,
                            task_type=dt.task_type,
                            task_status=dt.task_status,
                            duration_mins=dt.duration_mins,
                            energy_required=dt.energy_required,
                            priority=dt.priority,
                            priority_label=dt.priority_label,
                            is_mvp_task=dt.is_mvp_task,
                            sequence_order=999
                        ))
                    
                if use_llm and settings.OPENAI_API_KEY:
                    prompt_instructions = out.strategy_note or "Apply standard enrichment"
                    import asyncio
                    asyncio.create_task(
                        enrich_schedule_with_llm(
                            schedule_id=existing.id,
                            generation_version=existing.generation_version,
                            prompt=prompt_instructions
                        )
                    )
                    
                await db.refresh(existing)
                res = await _build_schedule_response(existing, user.id, db)
                res.schedule_status = "ready"
                return res
            except Exception as e:
                logger.error(f"Solver failed: {e}")
                raise HTTPException(status_code=500, detail="Failed to run logic solver.")
        else:
            start = time.time()
            WAIT_WINDOW_SECS = getattr(settings, "SCHEDULE_REGEN_LOCK_TIMEOUT", 20.0)
            POLL_INTERVAL_SECS = 2.0
            
            while time.time() - start < WAIT_WINDOW_SECS:
                import asyncio
                await asyncio.sleep(POLL_INTERVAL_SECS)
                result = await db.execute(
                    select(Schedule).where(
                        Schedule.user_id == user.id,
                        Schedule.schedule_date == target_date,
                        Schedule.deleted_at.is_(None)
                    ).execution_options(populate_existing=True)
                )
                fresh = result.scalar_one_or_none()
                if fresh and (not fresh.is_stale or fresh.generation_version > version_at_entry):
                    res = await _build_schedule_response(fresh, user.id, db)
                    res.schedule_status = "ready"
                    return res
                    
            if existing: 
                res = await _build_schedule_response(existing, user.id, db)
                res.schedule_status = "stale_fallback"
                return res
                
            raise HTTPException(status_code=503, detail="Service busy generating schedule")

"""

remove_start = False

for line in lines:
    if line.startswith("import asyncio"):
        new_lines.append("import asyncio\nimport contextlib\n")
        continue

    if "Goal, FixedBlock, Schedule, Task, WeeklyPlan, DailyLog" in line:
        new_lines.append(line.replace("DailyLog", "DailyLog, TaskLog"))
        continue
        
    if "from sqlalchemy.ext.asyncio import AsyncSession" in line:
        new_lines.append("from sqlalchemy.ext.asyncio import AsyncSession\nfrom app.database import engine\n")
        continue

    if line.startswith("async def generate_schedule("):
        remove_start = True
        new_lines.append(new_code)
        continue
        
    if remove_start and line.startswith("async def _get_existing_schedule("):
        remove_start = False

    if not remove_start:
        new_lines.append(line)

final_lines = []
in_save_schedule = False
for line in new_lines:
    if line.startswith("async def _save_schedule("):
        in_save_schedule = True
        continue
    if in_save_schedule and line.startswith("async def "):
        in_save_schedule = False
    
    if not in_save_schedule:
        final_lines.append(line)
        
with open("app/services/schedule_service.py", "w", encoding="utf-8") as f:
    f.writelines(final_lines)

print("Patch applied to app/services/schedule_service.py")
