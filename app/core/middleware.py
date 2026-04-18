import uuid
from contextvars import ContextVar
from starlette.types import ASGIApp, Scope, Receive, Send
from starlette.datastructures import MutableHeaders

# Context variable accessible from any coroutine in the same request
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIDMiddleware:
    """
    Generates a unique X-Request-ID for every request using pure ASGI.
    Avoids BaseHTTPMiddleware loop issues in async tests.
    """
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        headers = MutableHeaders(scope=scope)
        request_id = headers.get("x-request-id") or str(uuid.uuid4())
        
        # Propagation to logging context
        token = request_id_ctx.set(request_id)
        
        # Compatibility with FastAPI request.state
        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["request_id"] = request_id

        async def send_wrapper(message: dict):
            if message["type"] == "http.response.start":
                resp_headers = MutableHeaders(scope=message)
                resp_headers["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            request_id_ctx.reset(token)
