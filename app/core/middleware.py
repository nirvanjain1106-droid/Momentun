import uuid
from contextvars import ContextVar
from starlette.types import ASGIApp, Scope, Receive, Send
from starlette.datastructures import MutableHeaders
from starlette.responses import Response

# Context variable accessible from any coroutine in the same request
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")

# ── Maximum request body size (10 MB) ────────────────────────
MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024  # 10 MB


class SecurityHeadersMiddleware:
    """
    Injects OWASP-recommended security headers on every HTTP response.
    Uses pure ASGI — no BaseHTTPMiddleware to avoid async issues.
    """

    HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "0",  # Modern browsers: CSP replaces this
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none';",
        "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    }

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_wrapper(message: dict):
            if message["type"] == "http.response.start":
                resp_headers = MutableHeaders(scope=message)
                for key, value in self.HEADERS.items():
                    resp_headers[key] = value
            await send(message)

        await self.app(scope, receive, send_wrapper)


class RequestSizeLimitMiddleware:
    """
    Rejects requests whose Content-Length exceeds MAX_REQUEST_BODY_BYTES.
    Returns 413 Payload Too Large. Pure ASGI — safe for async tests.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_REQUEST_BODY_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        # Check Content-Length header if present
        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.max_bytes:
                    response = Response(
                        content='{"detail":"Request body too large (max 10 MB)"}',
                        status_code=413,
                        media_type="application/json",
                    )
                    await response(scope, receive, send)
                    return
            except ValueError:
                pass

        await self.app(scope, receive, send)


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
