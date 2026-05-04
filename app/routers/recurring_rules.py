import uuid

from fastapi import APIRouter, Request
from sqlalchemy import select
from fastapi import HTTPException, status

from app.config import settings
from app.core.rate_limit import limiter
from app.core.dependencies import CurrentUserComplete, DB
from app.models.goal import RecurringTaskRule
from app.schemas.recurring_rule import (
    RecurringRuleCreate,
    RecurringRuleUpdate,
    RecurringRuleOut,
)
from app.services.recurring_task_service import (
    create_recurring_rule,
    update_recurring_rule,
)

router = APIRouter(prefix="/recurring-rules", tags=["recurring-rules"])


@router.post(
    "",
    response_model=RecurringRuleOut,
    summary="Create a recurring task rule",
    description="Create a new recurring task rule. Validates max_per_day ≤ 1 (§9c).",
    status_code=201,
)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
async def create_rule(
    request: Request,
    data: RecurringRuleCreate,
    current_user: CurrentUserComplete,
    db: DB,
) -> RecurringRuleOut:
    return await create_recurring_rule(data, current_user.id, db)


@router.get(
    "",
    response_model=list[RecurringRuleOut],
    summary="List recurring task rules",
    description="Returns all recurring task rules for the current user.",
)
async def list_rules(
    current_user: CurrentUserComplete,
    db: DB,
) -> list[RecurringRuleOut]:
    result = await db.execute(
        select(RecurringTaskRule).where(
            RecurringTaskRule.user_id == current_user.id,
        )
    )
    rules = result.scalars().all()
    return [RecurringRuleOut.model_validate(r) for r in rules]


@router.get(
    "/{rule_id}",
    response_model=RecurringRuleOut,
    summary="Get a recurring task rule",
    description="Returns a single recurring task rule by ID.",
)
async def get_rule(
    rule_id: uuid.UUID,
    current_user: CurrentUserComplete,
    db: DB,
) -> RecurringRuleOut:
    result = await db.execute(
        select(RecurringTaskRule).where(
            RecurringTaskRule.id == rule_id,
            RecurringTaskRule.user_id == current_user.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return RecurringRuleOut.model_validate(rule)


@router.patch(
    "/{rule_id}",
    response_model=RecurringRuleOut,
    summary="Update a recurring task rule",
    description="Partially update a recurring task rule. Only provided fields are updated.",
)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
async def update_rule(
    request: Request,
    rule_id: uuid.UUID,
    data: RecurringRuleUpdate,
    current_user: CurrentUserComplete,
    db: DB,
) -> RecurringRuleOut:
    result = await db.execute(
        select(RecurringTaskRule).where(
            RecurringTaskRule.id == rule_id,
            RecurringTaskRule.user_id == current_user.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return await update_recurring_rule(rule, data, db)


@router.delete(
    "/{rule_id}",
    response_model=RecurringRuleOut,
    summary="Soft-delete a recurring task rule",
    description="Sets the rule's is_active flag to False.",
)
async def delete_rule(
    rule_id: uuid.UUID,
    current_user: CurrentUserComplete,
    db: DB,
) -> RecurringRuleOut:
    result = await db.execute(
        select(RecurringTaskRule).where(
            RecurringTaskRule.id == rule_id,
            RecurringTaskRule.user_id == current_user.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    rule.is_active = False
    await db.flush()
    return RecurringRuleOut.model_validate(rule)
