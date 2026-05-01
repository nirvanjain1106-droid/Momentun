from fastapi import APIRouter
from app.core.dependencies import CurrentUserComplete, DB

router = APIRouter(prefix="/milestones", tags=["milestones"])


@router.get("")
async def list_milestones(
    current_user: CurrentUserComplete,
    db: DB,
):
    """Placeholder — Sprint 7 work in progress."""
    return []
