import re

with open('old_schedule_service.py', 'r', encoding='utf-8') as f:
    text = f.read()

# Let's replace the generate_schedule function with orchestrator + internal
orchestrator_code = """
def _build_lock_key(user_id: uuid.UUID, target_date: date) -> int:
    hash_str = f"regen_lock:{user_id}:{target_date.isoformat()}"
    import hashlib
    digest = hashlib.sha256(hash_str.encode()).digest()
    import struct
    val = struct.unpack(">q", digest[:8])[0]
    return val

import contextlib
from sqlalchemy import func
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

from app.database import engine

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
            # Wait for it
            import time, asyncio
            start = time.time()
            from app.config import settings
            WAIT_WINDOW_SECS = getattr(settings, "SCHEDULE_REGEN_LOCK_TIMEOUT", 20.0)
            while time.time() - start < WAIT_WINDOW_SECS:
                await asyncio.sleep(2.0)
                fresh = await _get_existing_schedule(user.id, target_date, db)
                if fresh and (not fresh.is_stale or fresh.generation_version > version_at_entry):
                    res = await _build_schedule_response(fresh, user.id, db)
                    res.schedule_status = "ready"
                    return res
            if existing: 
                res = await _build_schedule_response(existing, user.id, db)
                res.schedule_status = "stale_fallback"
                return res
            from fastapi import HTTPException
            raise HTTPException(status_code=503, detail="Service busy generating schedule")

async def _generate_schedule_internal(
    user: User,
    data: GenerateScheduleRequest,
    db: AsyncSession,
    target_date: date,
    existing: Optional[Schedule] = None
) -> ScheduleResponse:
"""
# We preserve the original generate_schedule body, but inside _generate_schedule_internal
new_text = text

# First replace generate_schedule( with _generate_schedule_internal body
start_idx = new_text.find("async def generate_schedule(")
end_idx = new_text.find("async def get_today_schedule(")

old_func_code = new_text[start_idx:end_idx]

# We need to strip the signature of old generate_schedule
lines = old_func_code.split('\n')
in_sig = True
body_lines = []
for line in lines:
    if in_sig:
        if line.strip().startswith('target_date ='):
            in_sig = False
            body_lines.append(line)
    else:
        body_lines.append(line)

new_func_code = '\n'.join(body_lines)

# Remove the old existing checks since we moved them to orchestrator
new_func_code = re.sub(
    r"existing = await _get_existing_schedule.*?return await _build_schedule_response.*?\\n.*?\\n",
    "",
    new_func_code,
    flags=re.DOTALL | re.MULTILINE
)
# remove the lock
new_func_code = re.sub(
    r"# 1\. Acquire row-level lock.*?# 2\. Re-check.*?return await _build_schedule_response.*?\\n.*?\\n",
    "",
    new_func_code,
    flags=re.DOTALL | re.MULTILINE
)

llm_part = """
    # V8 background LLM enrichment  
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
        # Background task instead of blocking!
        from app.services.goal_service import enrich_schedule_with_llm
        from app.config import settings
        import asyncio
        asyncio.create_task(
            enrich_schedule_with_llm(
                schedule_id=schedule.id,
                generation_version=schedule.generation_version,
                prompt=prompt,
                groq_api_key=getattr(settings, "GROQ_API_KEY", "")
            )
        )
        enrichment_status = "generating"
    else:
        prompt = None
        enrichment = None
        enrichment_status = "ready"
"""

save_mod = """
    # Race-safe save using a savepoint to avoid rolling back the entire session
    try:
        async with db.begin_nested():
            schedule = await _save_schedule(
                user_id=user.id,
                target_date=target_date,
                solver_result=solver_result,
                enrichment=None, # will be filled in background
                generation_prompt=prompt,
                solver_latency_ms=latency_ms,
                db=db,
            )
            # If we bumped version or refreshed it, ensure it's not stale
            schedule.is_stale = False
            schedule.generation_version = (existing.generation_version + 1) if existing else 1
            await db.flush()
    except IntegrityError:
        # Another request created this schedule concurrently
        existing = await _get_existing_schedule(user.id, target_date, db)
        if existing:
            return await _build_schedule_response(existing, user.id, db)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Schedule creation conflict. Please retry.",
        )

    res = await _build_schedule_response(schedule, user.id, db)
    res.schedule_status = enrichment_status
    return res
"""

idx_enrich = new_func_code.find("    enrichment = None")
if idx_enrich != -1:
    new_func_code = new_func_code[:idx_enrich] + "\n    schedule = None # placeholder to be assigned in try block\n" + save_mod + "\n" + llm_part

final_orchestrator = orchestrator_code + new_func_code + "\n\n"
new_text = new_text[:start_idx] + final_orchestrator + new_text[end_idx:]

# Also replace generate_schedule with generate_schedule_orchestrator in the endpoints
# wait, the endpoint is in routers, not here. But in get_today_schedule it may call generate_schedule
new_text = new_text.replace("await generate_schedule(", "await generate_schedule_orchestrator(")

with open('app/services/schedule_service.py', 'w', encoding='utf-8') as f:
    f.write(new_text)
print('Patched successfully.')
