import json
import logging
import sys

from app.config import settings


class JSONFormatter(logging.Formatter):
    """Structured JSON log formatter for production."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)
        # Merge any extra fields
        for key in ("user_id", "path", "method", "status_code", "target_date",
                     "block_1", "block_2", "error"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)
        return json.dumps(log_entry, default=str)


def configure_logging() -> None:
    """
    Configure structured logging.
    - Production: JSON format, INFO level
    - Development: human-readable format, DEBUG level
    """
    root = logging.getLogger()

    # Clear existing handlers to avoid duplicate logs
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if settings.APP_ENV == "production":
        handler.setFormatter(JSONFormatter())
        root.setLevel(logging.INFO)
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-8s %(name)s [%(request_id)s] %(message)s",
                defaults={"request_id": "-"},
            )
        )
        root.setLevel(logging.DEBUG)

    root.addHandler(handler)

    # Quieten noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
