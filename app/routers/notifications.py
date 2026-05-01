from fastapi import APIRouter
from app.core.dependencies import CurrentUserComplete, DB

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    current_user: CurrentUserComplete,
    db: DB,
):
    """Placeholder — Sprint 7 work in progress."""
    from sqlalchemy import select
    from app.models.goal import Notification

    result = await db.execute(
        select(Notification).where(
            Notification.user_id == current_user.id,
        )
    )
    notifications = result.scalars().all()
    return notifications
