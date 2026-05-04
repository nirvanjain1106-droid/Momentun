import uuid
from datetime import date
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.models.goal import RecurringTaskRule, Task
from app.schemas.recurring_rule import RecurringRuleCreate, RecurringRuleUpdate, RecurringRuleOut
from app.services.constraint_solver import TaskRequirement


def _validate_max_per_day(max_per_day: int) -> None:
    """P2 fix — §9c: max_per_day > 1 is not supported in v1."""
    if max_per_day > 1:
        raise HTTPException(
            status_code=422,
            detail=(
                "max_per_day > 1 is not supported in v1. "
                "The unique index uq_task_per_rule_per_date enforces one "
                "task per rule per date. See decision D55."
            ),
        )


async def create_recurring_rule(
    data: RecurringRuleCreate, user_id: uuid.UUID, db: AsyncSession
) -> RecurringRuleOut:
    """Create a recurring task rule with max_per_day validation (§9c)."""
    _validate_max_per_day(data.max_per_day)
    rule = RecurringTaskRule(user_id=user_id, **data.model_dump())
    db.add(rule)
    await db.flush()
    return RecurringRuleOut.model_validate(rule)


async def update_recurring_rule(
    rule: RecurringTaskRule, data: RecurringRuleUpdate, db: AsyncSession
) -> RecurringRuleOut:
    """Update a recurring task rule with max_per_day validation (§9c)."""
    if data.max_per_day is not None:
        _validate_max_per_day(data.max_per_day)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    await db.flush()
    return RecurringRuleOut.model_validate(rule)


async def _get_active_rules(
    user_id: uuid.UUID, iso_weekday: int, db: AsyncSession
) -> list[RecurringTaskRule]:
    """Fetch active recurring rules applicable to the given weekday."""
    result = await db.execute(
        select(RecurringTaskRule).where(
            and_(
                RecurringTaskRule.user_id == user_id,
                RecurringTaskRule.is_active.is_(True),
                # I44: days_of_week uses Python weekday() — 0=Mon, 6=Sun
                RecurringTaskRule.days_of_week.contains([iso_weekday]),
            )
        )
    )
    return list(result.scalars().all())


async def get_recurring_requirements(
    user_id: uuid.UUID, target_date: date, db: AsyncSession
) -> list[TaskRequirement]:
    """I35/I43: Convert active recurring rules to TaskRequirements.

    Pre-check dedup via NOT EXISTS query (bulk check on DB side).
    No counter reservation — index-only dedup at persistence time (D54).
    """
    iso_weekday = target_date.weekday()  # I44: Python weekday, not ISO 1-7
    rules = await _get_active_rules(user_id, iso_weekday, db)

    requirements = []
    for rule in rules:
        # I43: Pre-check idempotency — avoids creating a TaskRequirement
        # that will immediately fail at persistence (reduces solver noise).
        existing = await db.execute(
            select(Task.id).where(
                and_(
                    Task.recurring_rule_id == rule.id,
                    Task.source_date == target_date,
                    Task.deleted_at.is_(None),
                )
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            from app.core.metrics import recurring_dedup_precheck_hit
            recurring_dedup_precheck_hit.labels(user_id=str(user_id)).inc()
            continue

        requirements.append(TaskRequirement(
            title=rule.title,
            task_type=rule.task_type,
            duration_mins=rule.duration_mins,
            energy_required="medium",
            priority=rule.priority,
            goal_id=str(rule.goal_id),
            # I41: recurring_rule_id — NOT source_rule_id
            recurring_rule_id=str(rule.id),
            source_date=target_date,
        ))

    return requirements
