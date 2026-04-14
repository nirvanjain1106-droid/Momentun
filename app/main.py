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
from app.routers import auth, onboarding, schedule, checkin, insights

configure_logging()
logger = logging.getLogger(__name__)

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

app.include_router(auth.router,       prefix="/api/v1")
app.include_router(onboarding.router, prefix="/api/v1")
app.include_router(schedule.router,   prefix="/api/v1")
app.include_router(checkin.router,    prefix="/api/v1")
app.include_router(insights.router,   prefix="/api/v1")


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
