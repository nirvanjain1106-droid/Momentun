import uuid
from types import SimpleNamespace

import pytest

from app.schemas.schedule import ScheduleResponse
from app.services import schedule_service


class _FakeDB:
    pass


@pytest.mark.asyncio
async def test_week_generation_calls_daily_generation_sequentially(monkeypatch):
    user = SimpleNamespace(id=uuid.uuid4())
    db = _FakeDB()
    calls = []

    weekly_plan = SimpleNamespace(week_theme="Theme", strategy_note="Note")

    monkeypatch.setattr(
        schedule_service,
        "_get_or_create_weekly_plan",
        _async_return(weekly_plan),
    )

    async def fake_generate(user_arg, request_arg, db_arg):
        calls.append((request_arg.target_date, db_arg))
        return ScheduleResponse(
            id=uuid.uuid4(),
            user_id=user_arg.id,
            schedule_date=request_arg.target_date,
            day_type="standard",
            day_type_reason=None,
            strategy_note=None,
            tasks=[],
            parked_tasks=[],
            total_tasks=0,
            total_study_mins=0,
            day_capacity_hrs=0.0,
        )

    monkeypatch.setattr(schedule_service, "generate_schedule", fake_generate)

    response = await schedule_service.get_week_schedule(user, db, "2026-04-13")
    assert response.days_generated == 7
    assert len(calls) == 7
    assert all(call_db is db for _, call_db in calls)


def _async_return(value):
    async def _inner(*_args, **_kwargs):
        return value

    return _inner
