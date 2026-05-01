import secrets
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME:    str = "Momentum"
    APP_VERSION: str = "1.0.0"
    APP_ENV:     str = "development"

    POSTGRES_USER:     str = "momentum_user"
    POSTGRES_PASSWORD: str = "momentum_pass"
    POSTGRES_DB:       str = "momentum_db"
    POSTGRES_HOST:     str = "localhost"
    POSTGRES_PORT:     int = 5432
    DATABASE_URL: str | None = None
    DATABASE_URL_SYNC: str | None = None

    # Auth
    SECRET_KEY:                  str = ""
    ALGORITHM:                   str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS:   int = 7

    # Fix #1  — OPENROUTER_API_KEY declared here
    # Fix #16 — all LLM keys go through settings, not os.getenv()
    OPENROUTER_API_KEY: str = ""
    GROQ_API_KEY:       str = ""

    # Rate limiting
    RATE_LIMIT_STORAGE_URL: str = "memory://"
    RATE_LIMIT_DEFAULT: str = "120/minute"
    RATE_LIMIT_AUTH: str = "10/minute"
    RATE_LIMIT_SCHEDULE: str = "10/minute"
    RATE_LIMIT_LLM: str = "3/hour"  # Strict limit for LLM-triggering endpoints
    SCHEDULE_REGEN_LOCK_TIMEOUT: int = 60

    # CORS
    ALLOWED_ORIGIN_REGEX: str = r"^https://momentum(-[a-z0-9]+)*\.vercel\.app$|^http://(localhost|127\.0\.0\.1):(5173|4173|3000|8080)$"

    # Email / SMTP
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@momentum-app.local"
    SMTP_USE_TLS: bool = True
    EMAIL_VERIFICATION_EXPIRE_HOURS: int = 24
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30
    FRONTEND_URL: str = "http://localhost:3000"

    # Monitoring
    SENTRY_DSN: str = ""

    # Encryption (Sprint 6 V17)
    ENCRYPTION_ACTIVE: bool = False
    ENCRYPTION_MIN_VERSION: int = 17
    CODE_VERSION: int = 17
    ENCRYPTION_KEYS: list[str] = ["default_key_needs_to_be_replaced_in_prod"]
    ACTIVE_KEY_VERSION: int = 0
    CRON_MAINTENANCE_MODE: bool = False
    DL_ABORT_THRESHOLD: int = 50

    # D59: Rescue mission threshold — goals below this completion % are candidates.
    # Externalized for product tuning without redeployment (12-factor compliant).
    rescue_threshold_pct: float = 30.0

    @model_validator(mode="after")
    def enforce_secret_key(self) -> "Settings":
        if self.APP_ENV == "production" and not self.SECRET_KEY:
            raise ValueError(
                "SECRET_KEY must be set in production. "
                "Set the SECRET_KEY environment variable."
            )
        if self.SECRET_KEY and len(self.SECRET_KEY) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        if not self.SECRET_KEY:
            object.__setattr__(self, "SECRET_KEY", secrets.token_urlsafe(48))

        if not self.DATABASE_URL:
            object.__setattr__(
                self,
                "DATABASE_URL",
                (
                    f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                    f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
                ),
            )
        if not self.DATABASE_URL_SYNC:
            object.__setattr__(
                self,
                "DATABASE_URL_SYNC",
                (
                    f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                    f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
                ),
            )
            
        # I21: Comprehensive key validation at startup
        if not self.ENCRYPTION_KEYS:
            raise ValueError("ENCRYPTION_KEYS must not be empty")
        if self.ACTIVE_KEY_VERSION < 0:
            raise ValueError(
                f"ACTIVE_KEY_VERSION must be >= 0, got {self.ACTIVE_KEY_VERSION}"
            )
        if self.ACTIVE_KEY_VERSION >= len(self.ENCRYPTION_KEYS):
            raise ValueError(
                f"ACTIVE_KEY_VERSION={self.ACTIVE_KEY_VERSION} >= "
                f"len(ENCRYPTION_KEYS)={len(self.ENCRYPTION_KEYS)}"
            )
        for i, k in enumerate(self.ENCRYPTION_KEYS):
            if not k:
                raise ValueError(f"ENCRYPTION_KEYS[{i}] is empty")
                
        return self

    # Fix #15 — Pydantic v2 SettingsConfigDict (replaces inner Config class)
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
