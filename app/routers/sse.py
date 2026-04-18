from fastapi import APIRouter, Request, Depends
from fastapi.responses import StreamingResponse
from app.core.dependencies import get_current_user_from_cookie
from app.services.event_bus import event_bus
from app.models.user import User
import json
import logging

router = APIRouter(prefix="/sse", tags=["Real-Time"])
logger = logging.getLogger(__name__)

@router.get("/events")
async def sse_events(
    request: Request,
    user: User = Depends(get_current_user_from_cookie),
):
    async def event_generator():
        async for event in event_bus.subscribe(str(user.id)):
            if await request.is_disconnected():
                break
            try:
                data_str = json.dumps(event.get("data", {}), default=str)
            except Exception as exc:
                logger.error("sse_serialise_error", extra={"error": str(exc)})
                continue
            yield f"event: {event['event']}\ndata: {data_str}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
