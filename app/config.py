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
    RATE_LIMIT_STORAGE_URL: str = "memory://"
    RATE_LIMIT_DEFAULT: str = "120/minute"
    RATE_LIMIT_AUTH: str = "10/minute"
    RATE_LIMIT_SCHEDULE: str = "10/minute"

    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:8080"

    @property
    def ALLOWED_ORIGINS_LIST(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

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
