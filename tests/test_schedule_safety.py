from app.schemas.schedule import TaskResponse


def test_task_response_allows_nullable_times():
    task = TaskResponse(
        id="57eff0a8-d6f1-4308-9d5f-99f943e8e5f9",
        title="Deferred task",
        description=None,
        task_type="admin",
        scheduled_start=None,
        scheduled_end=None,
        duration_mins=30,
        energy_required="low",
        priority=2,
        priority_label="Normal",
        is_mvp_task=False,
        sequence_order=1,
        task_status="deferred",
    )
    assert task.scheduled_start is None
    assert task.scheduled_end is None
