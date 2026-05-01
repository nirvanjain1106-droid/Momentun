"""
Session safety utilities for SQLAlchemy 2.0 async sessions.

P1#4 Fix: safe_expunge() cascades through loaded relationships to prevent
identity map pollution after SAVEPOINT rollbacks.
"""

from typing import Any

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession


def safe_expunge(session: AsyncSession, obj: Any) -> None:
    """Expunge object + all loaded relationships to prevent session pollution.

    After a SAVEPOINT rollback, the failed object remains in the session's
    identity map. Calling session.expunge(obj) removes it, but eagerly-loaded
    relationships (e.g., task.task_logs) remain attached. This causes
    ``InvalidRequestError: Object is already attached`` on the next flush().

    This function walks all loaded relationships and expunges them too.

    If the session is strictly request-scoped (FastAPI `yield` dependency),
    ``session.expunge_all()`` is an acceptable but less surgical alternative.
    """
    if obj not in session:
        return

    session.expunge(obj)

    mapper = inspect(type(obj))
    for rel in mapper.relationships:
        val = getattr(obj, rel.key, None)
        if val is None:
            continue
        if isinstance(val, list):
            for item in val:
                if item in session:
                    session.expunge(item)
        elif val in session:
            session.expunge(val)
