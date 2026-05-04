import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from slowapi.errors import RateLimitExceeded

from slowapi import _rate_limit_exceeded_handler

from app.config import settings
from app.database import get_db
from app.core.logging import configure_logging
from app.core.rate_limit import limiter
from app.core.middleware import RequestIDMiddleware, SecurityHeadersMiddleware, RequestSizeLimitMiddleware
from app.routers import auth, onboarding, schedule, checkin, insights, goals, tasks, users, sse, health
from app.routers.health import _cache_column_check
from app.routers.recurring_rules import router as recurring_router
from app.routers.notifications import router as notification_router
from app.routers.milestones import router as milestone_router
from app.services.event_bus import event_bus

configure_logging()
logger = logging.getLogger(__name__)

# ── Sentry SDK (opt-in via SENTRY_DSN env var) ────────────────
if settings.SENTRY_DSN:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            traces_sample_rate=0.1,
            environment=settings.APP_ENV,
            send_default_pii=False,
        )
        logger.info("sentry_initialized")
    except Exception:
        logger.warning("sentry_init_failed — continuing without Sentry")


async def _sse_cleanup_loop():
    while True:
        await asyncio.sleep(60)
        event_bus.cleanup_stale()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await _cache_column_check()
    cleanup_task = asyncio.create_task(_sse_cleanup_loop())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Momentum API — AI-powered adaptive scheduling that learns "
        "your behaviour patterns and adjusts your daily plan automatically."
    ),
    docs_url="/docs" if settings.APP_ENV != "production" else None,
    redoc_url="/redoc" if settings.APP_ENV != "production" else None,
    lifespan=lifespan,
)

# ── Middleware (order matters — outermost first) ─────────────
app.add_middleware(RequestIDMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# SlowAPIMiddleware removed — it extends BaseHTTPMiddleware which causes
# RuntimeError in async tests. The exception handler above is sufficient.

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=settings.ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Authorization",
        "Content-Language",
        "Content-Type",
        "X-Request-ID",
        "Idempotency-Key",
    ],
)

# ── Prometheus Metrics (auto-instrumentation) ────────────────
if settings.APP_ENV != "testing":
    try:
        from prometheus_fastapi_instrumentator import Instrumentator
        Instrumentator(
            should_group_status_codes=True,
            should_ignore_untemplated=True,
            excluded_handlers=["/health", "/metrics", "/"],
        ).instrument(app).expose(app, endpoint="/metrics")
        logger.info("prometheus_metrics_enabled at /metrics")
    except ImportError:
        logger.warning("prometheus-fastapi-instrumentator not installed — metrics disabled")


# ── Routers ──────────────────────────────────────────────────
app.include_router(auth.router,       prefix="/api/v1")
app.include_router(onboarding.router, prefix="/api/v1")
app.include_router(schedule.router,   prefix="/api/v1")
app.include_router(checkin.router,    prefix="/api/v1")
app.include_router(insights.router,   prefix="/api/v1")
app.include_router(goals.router,      prefix="/api/v1")
app.include_router(tasks.router,      prefix="/api/v1")
app.include_router(users.router,      prefix="/api/v1")
app.include_router(sse.router,        prefix="/api/v1")
app.include_router(health.router)
app.include_router(recurring_router,     prefix="/api/v1", tags=["recurring-rules"])
app.include_router(notification_router,  prefix="/api/v1", tags=["notifications"])
app.include_router(milestone_router,     prefix="/api/v1", tags=["milestones"])


@app.get("/", include_in_schema=False)
async def root():
    return JSONResponse(content={
        "app":     settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status":  "running",
        "docs":    "/docs",
    })


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Global 500 handler that manually injects CORS headers.

    Starlette's CORSMiddleware only processes responses that flow through
    its normal response path. When an unhandled exception is caught by an
    @app.exception_handler, the response is constructed *after* the CORS
    middleware has already passed control, so CORS headers are never attached.

    Fix: manually read the Origin header from the request and, if it matches
    our allowed origin pattern, inject Access-Control-* headers directly on
    the 500 response so the browser doesn't block it.
    """
    import re
    logger.exception("unhandled_exception", extra={"path": str(request.url.path)})

    headers: dict[str, str] = {}
    origin = request.headers.get("origin", "")
    if origin and re.match(settings.ALLOWED_ORIGIN_REGEX, origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )
