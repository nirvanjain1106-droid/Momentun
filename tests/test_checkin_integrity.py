import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.schemas.checkin import EveningReviewRequest, MorningCheckinRequest, TaskCompletionUpdate
from app.services import checkin_service


class _FakeDB:
    def add(self, _obj):
        return None

    async def flush(self):
        return None


@pytest.mark.asyncio
async def test_morning_checkin_updates_existing_log_schedule_id(monkeypatch):
    user = SimpleNamespace(id=uuid.uuid4(), name="Test User", timezone="Asia/Kolkata")
    old_schedule = SimpleNamespace(id=uuid.uuid4(), day_type="standard", deleted_at=None)
    new_schedule = SimpleNamespace(id=uuid.uuid4(), day_type="recovery", deleted_at=None)
    existing_log = SimpleNamespace(
        id=uuid.uuid4(),
        log_date=date(2026, 4, 14),
        schedule_id=old_schedule.id,
        morning_checkin_at=None,
        morning_energy=None,
        yesterday_rating=None,
        surprise_event=None,
        surprise_note=None,
    )

    monkeypatch.setattr(checkin_service, "get_user_today", lambda _tz: date(2026, 4, 14))
    monkeypatch.setattr(checkin_service, "_get_daily_log", _async_return(existing_log))
    monkeypatch.setattr(
        checkin_service,
        "_get_todays_schedule",
        _sequence_async([old_schedule, new_schedule]),
    )
    monkeypatch.setattr(checkin_service, "generate_schedule", _async_return(None))
    monkeypatch.setattr(
        checkin_service.insights_service,
        "get_patterns",
        _async_raise(HTTPException(status_code=404, detail="skip")),
    )

    data = MorningCheckinRequest(
        morning_energy="exhausted",
        yesterday_rating="rough",
        surprise_event="none",
    )
    await checkin_service.morning_checkin(user, data, _FakeDB())
    assert existing_log.schedule_id == new_schedule.id


@pytest.mark.asyncio
async def test_evening_review_rejects_unknown_or_missing_tasks(monkeypatch):
    user = SimpleNamespace(id=uuid.uuid4(), name="Test User", timezone="Asia/Kolkata")
    log = SimpleNamespace(
        id=uuid.uuid4(),
        log_date=date(2026, 4, 14),
        evening_review_at=None,
        tasks_scheduled=None,
        tasks_completed=None,
        completion_rate=None,
        mood_score=None,
        evening_note=None,
        actual_day_type=None,
    )
    schedule = SimpleNamespace(id=uuid.uuid4(), day_type="standard")
    scheduled_task = SimpleNamespace(id=uuid.uuid4(), user_id=user.id)
    unknown_task_id = uuid.uuid4()

    monkeypatch.setattr(checkin_service, "get_user_today", lambda _tz: date(2026, 4, 14))
    monkeypatch.setattr(checkin_service, "_get_daily_log", _async_return(log))
    monkeypatch.setattr(checkin_service, "_get_todays_schedule", _async_return(schedule))
    monkeypatch.setattr(
        checkin_service,
        "_get_active_tasks_for_schedule",
        _async_return([scheduled_task]),
    )

    data = EveningReviewRequest(
        task_completions=[
            TaskCompletionUpdate(task_id=unknown_task_id, status="completed")
        ],
        mood_score=3,
    )

    with pytest.raises(HTTPException) as exc:
        await checkin_service.evening_review(user, data, _FakeDB())

    assert exc.value.status_code == 422


def _async_return(value):
    async def _inner(*_args, **_kwargs):
        return value

    return _inner


def _sequence_async(values):
    state = {"idx": 0}

    async def _inner(*_args, **_kwargs):
        idx = state["idx"]
        state["idx"] += 1
        return values[idx]

    return _inner


def _async_raise(exc):
    async def _inner(*_args, **_kwargs):
        raise exc

    return _inner
