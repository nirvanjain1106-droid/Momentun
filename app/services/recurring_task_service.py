"""
Recurring Task Service — Sprint 7

Core logic for materializing recurring rules into TaskRequirements for the solver.

P0#1 Fix: Uses bulk NOT EXISTS (single round-trip) instead of N+1 per-rule
SELECT to prevent asyncpg pool exhaustion under concurrent load.

§6 Spec: get_recurring_requirements() returns a list of TaskRequirements that
the solver treats identically to ad-hoc task requirements.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date
from typing import List

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goal import RecurringTaskRule, Task
from app.services.constraint_solver import TaskRequirement
from app.metrics import recurring_dedup_total

logger = logging.getLogger(__name__)


async def _get_active_rules(
    user_id: uuid.UUID,
    weekday: int,
    db: AsyncSession,
) -> List[RecurringTaskRule]:
    """Fetch active rules whose days_of_week includes the target weekday.

    Uses PostgreSQL ``@>`` array containment:
    ``ARRAY[weekday] <@ days_of_week`` checks if the weekday is in the array.
    """
    result = await db.execute(
        select(RecurringTaskRule).where(
            and_(
                RecurringTaskRule.user_id == user_id,
                RecurringTaskRule.is_active.is_(True),
                RecurringTaskRule.days_of_week.any(weekday),
            )
        )
    )
    return list(result.scalars().all())


async def get_recurring_requirements(
    user_id: uuid.UUID,
    target_date: date,
    db: AsyncSession,
) -> List[TaskRequirement]:
    """Convert active recurring rules into TaskRequirements for the solver.

    P0#1 FIX: Bulk dedup check — a single SELECT replaces the N+1 per-rule
    loop that would saturate asyncpg connection pools at scale.

    At 50 active rules/user × 100 concurrent users, the old N+1 pattern
    fires 5,000 sequential SELECTs → P99 latency spikes to 2-4s → 504s.
    The bulk pattern reduces this to O(1) DB round-trips.

    Dedup Strategy (two-layer):
      1. Pre-check: Bulk ``SELECT (recurring_rule_id, source_date)`` to skip
         rules that already have tasks for this date. (This function.)
      2. Index-only: ``uq_task_per_rule_per_date`` catches races in
         ``_save_schedule()`` via SAVEPOINT + IntegrityError handling.
    """
    iso_weekday = target_date.weekday()  # 0=Mon..6=Sun
    rules = await _get_active_rules(user_id, iso_weekday, db)
    if not rules:
        return []

    rule_ids = [r.id for r in rules]

    # P0#1: Single round-trip dedup check — O(1) instead of O(N)
    existing_pairs = await db.execute(
        select(Task.recurring_rule_id, Task.source_date).where(
            and_(
                Task.recurring_rule_id.in_(rule_ids),
                Task.source_date == target_date,
                Task.deleted_at.is_(None),
            )
        )
    )
    existing_set = {(str(r), d) for r, d in existing_pairs.all()}

    requirements: List[TaskRequirement] = []
    for rule in rules:
        if (str(rule.id), target_date) in existing_set:
            recurring_dedup_total.labels(outcome="precheck_hit").inc()
            logger.debug(
                "Recurring rule %s already has task for %s (precheck)",
                rule.id, target_date,
            )
            continue

        requirements.append(TaskRequirement(
            title=rule.title,
            task_type=rule.task_type,
            duration_mins=rule.duration_mins,
            energy_required="medium",  # Default; v2 may add per-rule energy
            priority=rule.priority,
            goal_id=str(rule.goal_id),
            recurring_rule_id=str(rule.id),
            source_date=target_date,
        ))

    logger.info(
        "Recurring requirements for user %s date %s: %d rules, %d new tasks",
        user_id, target_date, len(rules), len(requirements),
    )
    return requirements
