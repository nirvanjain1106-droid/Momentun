import uuid
from contextvars import ContextVar
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# Context variable accessible from any coroutine in the same request
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Generates a unique X-Request-ID for every request.
    Stores it in a ContextVar so loggers can include it automatically.
    Returns it in the response headers for client-side correlation.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        rid = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request_id_ctx.set(rid)
        request.state.request_id = rid

        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response
