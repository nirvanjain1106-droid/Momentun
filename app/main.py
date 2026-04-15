import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler

from app.config import settings
from app.database import get_db
from app.core.logging import configure_logging
from app.core.rate_limit import limiter
from app.core.middleware import RequestIDMiddleware
from app.routers import auth, onboarding, schedule, checkin, insights, goals, tasks, users

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


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Momentum API — AI-powered adaptive scheduling that learns "
        "your behaviour patterns and adjusts your daily plan automatically."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Middleware (order matters — outermost first) ─────────────
app.add_middleware(RequestIDMiddleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS_LIST,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Prometheus Metrics (auto-instrumentation) ────────────────
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


@app.get("/", include_in_schema=False)
async def root():
    return JSONResponse(content={
        "app":     settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status":  "running",
        "docs":    "/docs",
    })


@app.get("/health", include_in_schema=False)
async def health_check():
    """
    Fix #18 — real health check that verifies DB connectivity.
    Returns 503 if DB is unreachable instead of always returning healthy.
    """
    try:
        async for db in get_db():
            await db.execute(text("SELECT 1"))
        return JSONResponse(content={"status": "healthy", "db": "connected"})
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "db": "unreachable"},
        )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled_exception", extra={"path": str(request.url.path)})
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
