"""
Structured application exception hierarchy.

All business-logic errors should raise one of these instead of bare
HTTPException, so the global handlers in main.py can produce a
consistent JSON envelope:

    {
      "error": {
        "code": "NOT_FOUND",
        "message": "Task not found",
        "details": {"resource": "Task", "id": "abc123"}
      }
    }
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class AppException(Exception):
    """Base application exception — caught by the global handler in main.py."""

    def __init__(
        self,
        message: str,
        code: str,
        status_code: int = 400,
        details: dict | None = None,
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)


class NotFoundError(AppException):
    """Resource lookup returned nothing."""

    def __init__(self, resource: str, id: str):
        super().__init__(
            message=f"{resource} not found",
            code="NOT_FOUND",
            status_code=404,
            details={"resource": resource, "id": id},
        )


class UnauthorizedError(AppException):
    """Authentication required or token invalid."""

    def __init__(self, reason: str = "Invalid or expired token"):
        super().__init__(
            message="Authentication required",
            code="UNAUTHORIZED",
            status_code=401,
            details={"reason": reason},
        )


class ForbiddenError(AppException):
    """Authenticated but not authorized for this action."""

    def __init__(self, reason: str = "Access denied"):
        super().__init__(
            message="Access denied",
            code="FORBIDDEN",
            status_code=403,
            details={"reason": reason},
        )


class ValidationError(AppException):
    """Business-rule validation failure (not pydantic schema validation)."""

    def __init__(self, field: str, message: str):
        super().__init__(
            message=f"Validation failed: {message}",
            code="VALIDATION_ERROR",
            status_code=422,
            details={"field": field},
        )


class ConflictError(AppException):
    """Duplicate or conflicting resource state."""

    def __init__(self, resource: str, message: str = "Already exists"):
        super().__init__(
            message=message,
            code="CONFLICT",
            status_code=409,
            details={"resource": resource},
        )


class RateLimitError(AppException):
    """Client exceeded rate limit."""

    def __init__(self, retry_after: int = 60):
        super().__init__(
            message="Too many requests",
            code="RATE_LIMITED",
            status_code=429,
            details={"retry_after_seconds": retry_after},
        )
