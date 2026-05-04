"""
test_users.py — 7 tests covering user profile CRUD and password change.

Endpoints:
  - GET    /api/v1/users/me        → UserProfileResponse
  - PATCH  /api/v1/users/me        → UserProfileResponse
  - POST   /api/v1/users/me/change-password → MessageResponse

Note: CurrentUser is sufficient for /users/me (no onboarding gate).
"""


import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestGetProfile:
    """GET /api/v1/users/me"""

    async def test_get_profile_success(self, authenticated_client):
        client, user_data = authenticated_client
        resp = await client.get("/api/v1/users/me")
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == user_data["name"]
        assert "email" in body

    async def test_get_profile_no_password_leak(self, authenticated_client):
        """The response must never contain a password or hash field."""
        client, _ = authenticated_client
        resp = await client.get("/api/v1/users/me")
        body = resp.json()
        assert "password" not in body
        assert "password_hash" not in body
        assert "hashed_password" not in body


class TestUpdateProfile:
    """PATCH /api/v1/users/me"""

    async def test_update_name(self, authenticated_client):
        client, _ = authenticated_client
        resp = await client.patch(
            "/api/v1/users/me",
            json={"name": "Updated Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    async def test_update_preserves_email(self, authenticated_client):
        """Updating name should not change the email."""
        client, user_data = authenticated_client
        original_email = user_data.get("email") or (await client.get("/api/v1/users/me")).json()["email"]
        await client.patch("/api/v1/users/me", json={"name": "New Name"})
        resp = await client.get("/api/v1/users/me")
        assert resp.json()["email"] == original_email


class TestChangePassword:
    """POST /api/v1/users/me/change-password"""

    async def test_change_password_success(self, async_client: AsyncClient, test_user_data):
        # Register
        reg = await async_client.post("/api/v1/auth/register", json=test_user_data)
        assert reg.status_code == 201
        token = reg.json()["access_token"]

        # Change password
        resp = await async_client.post(
            "/api/v1/users/me/change-password",
            json={
                "current_password": test_user_data["password"],
                "new_password": "NewPassword1!",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

        # Old password should now fail login
        login_old = await async_client.post(
            "/api/v1/auth/login",
            json={"email": test_user_data["email"], "password": test_user_data["password"]},
        )
        assert login_old.status_code == 401

    async def test_change_password_wrong_current(self, authenticated_client):
        client, _ = authenticated_client
        resp = await client.post(
            "/api/v1/users/me/change-password",
            json={
                "current_password": "WrongCurrent1!",
                "new_password": "NewPassword1!",
            },
        )
        assert resp.status_code in (400, 401, 403)

    async def test_change_password_unauthenticated(self, async_client: AsyncClient):
        """Changing password without a token should be rejected."""
        resp = await async_client.post(
            "/api/v1/users/me/change-password",
            json={
                "current_password": "OldPass1!",
                "new_password": "NewPass1!",
            },
        )
        assert resp.status_code in (401, 403)
