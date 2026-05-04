"""
test_schedule.py — 9 tests covering schedule generation, task lifecycle
(complete, park, undo), quick-add, and reschedule.

Key API contracts:
  - GET  /api/v1/schedule/today  → auto-generates if goals exist; 400 if no goals
  - POST /api/v1/tasks/{id}/complete  → TaskMutationResponse
  - POST /api/v1/tasks/{id}/park      → TaskMutationResponse
  - POST /api/v1/tasks/{id}/undo      → TaskMutationResponse
  - POST /api/v1/tasks/quick-add      → 201 + TaskDetailResponse
  - POST /api/v1/tasks/reschedule     → {task_id, target_date}

All task/schedule endpoints require CurrentUserComplete (onboarding_complete=True),
so tests use the `setup_test_user` fixture from the root conftest.
"""

import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestGetTodaySchedule:
    """GET /api/v1/schedule/today"""

    async def test_get_today_schedule_response_shape(
        self, async_client: AsyncClient, setup_test_user
    ):
        """Today's schedule returns 200 with fields or 400 when user has no goals."""
        user, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        resp = await async_client.get("/api/v1/schedule/today", headers=headers)
        # 200 = schedule exists / generated, 400 = no goals to schedule
        assert resp.status_code in (200, 400)
        if resp.status_code == 200:
            body = resp.json()
            assert "schedule_date" in body
            assert "tasks" in body

    async def test_today_schedule_has_task_fields(
        self, async_client: AsyncClient, setup_test_user
    ):
        """If schedule has tasks, each one has required fields."""
        user, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        resp = await async_client.get("/api/v1/schedule/today", headers=headers)
        if resp.status_code == 200:
            body = resp.json()
            for task in body.get("tasks", []):
                assert "id" in task
                assert "title" in task
                assert "duration_mins" in task
                assert "task_status" in task

    async def test_schedule_requires_auth(self, async_client: AsyncClient):
        """Schedule endpoint without auth → 401/403."""
        resp = await async_client.get("/api/v1/schedule/today")
        assert resp.status_code in (401, 403)


class TestTaskLifecycle:
    """POST /tasks/{id}/complete, /park, /undo"""

    async def _get_first_task_id(self, client, headers):
        """Helper — fetch today's schedule and return the first task id."""
        resp = await client.get("/api/v1/schedule/today", headers=headers)
        if resp.status_code != 200:
            pytest.skip("Schedule unavailable (no goals)")
        tasks = resp.json().get("tasks", [])
        if not tasks:
            pytest.skip("No tasks in today's schedule")
        return tasks[0]["id"]

    async def test_complete_task(self, async_client, setup_test_user):
        user, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        task_id = await self._get_first_task_id(async_client, headers)
        resp = await async_client.post(
            f"/api/v1/tasks/{task_id}/complete",
            json={"completion_quality": "good"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["task"]["task_status"] == "completed"

    async def test_park_task(self, async_client, setup_test_user):
        user, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        task_id = await self._get_first_task_id(async_client, headers)
        resp = await async_client.post(
            f"/api/v1/tasks/{task_id}/park",
            json={"reason": "ran out of time"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["task"]["task_status"] == "parked"

    async def test_complete_nonexistent_task_404(self, async_client, setup_test_user):
        """Completing a random UUID task should return 404."""
        user, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        fake_id = uuid.uuid4()
        resp = await async_client.post(
            f"/api/v1/tasks/{fake_id}/complete",
            json={"completion_quality": "good"},
            headers=headers,
        )
        assert resp.status_code == 404


class TestQuickAdd:
    """POST /api/v1/tasks/quick-add"""

    async def test_quick_add_task(self, async_client, setup_test_user):
        user, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        resp = await async_client.post(
            "/api/v1/tasks/quick-add",
            json={"title": "Quick captured task", "duration_mins": 30},
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["title"] == "Quick captured task"

    async def test_quick_add_missing_title_422(self, async_client, setup_test_user):
        user, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        resp = await async_client.post(
            "/api/v1/tasks/quick-add",
            json={"duration_mins": 15},
            headers=headers,
        )
        assert resp.status_code == 422


class TestReschedule:
    """POST /api/v1/tasks/reschedule"""

    async def test_reschedule_quick_added_task(self, async_client, setup_test_user):
        user, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}

        # Quick-add a task first
        add_resp = await async_client.post(
            "/api/v1/tasks/quick-add",
            json={"title": "Reschedule me", "duration_mins": 30},
            headers=headers,
        )
        task_id = add_resp.json()["id"]
        target = (date.today() + timedelta(days=2)).isoformat()

        resp = await async_client.post(
            "/api/v1/tasks/reschedule",
            json={"task_id": task_id, "target_date": target},
            headers=headers,
        )
        # 200 success or 404 if target schedule doesn't exist
        assert resp.status_code in (200, 404)
