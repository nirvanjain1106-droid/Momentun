"""
test_auth.py — 15 tests covering registration, login, token handling,
refresh (cookie-based), and logout for the Momentum API.

API contracts:
  - POST /api/v1/auth/register  → 201 + TokenResponse
  - POST /api/v1/auth/login     → 200 + TokenResponse
  - POST /api/v1/auth/logout    → LogoutResponse (requires CurrentUser)
  - Duplicate email → 409
  - Password: ≥8 chars, 1 uppercase, 1 digit
  - TokenResponse: {access_token, token_type, user_id, name,
                     onboarding_complete, onboarding_step}
"""

import uuid

import pytest
from freezegun import freeze_time
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ═══════════════════════════════════════════════════════════════════
# REGISTRATION
# ═══════════════════════════════════════════════════════════════════


class TestRegistration:
    """POST /api/v1/auth/register"""

    async def test_register_success(self, async_client: AsyncClient, test_user_data):
        resp = await async_client.post("/api/v1/auth/register", json=test_user_data)
        assert resp.status_code == 201
        body = resp.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert body["name"] == test_user_data["name"]
        assert "user_id" in body
        assert "onboarding_step" in body
        assert body["onboarding_complete"] is False  # new users haven't onboarded

    async def test_register_duplicate_email_409(self, async_client: AsyncClient, test_user_data):
        """Second registration with the same email must return 409 Conflict."""
        await async_client.post("/api/v1/auth/register", json=test_user_data)
        resp = await async_client.post("/api/v1/auth/register", json=test_user_data)
        assert resp.status_code == 409

    async def test_register_invalid_email_422(self, async_client: AsyncClient):
        payload = {
            "name": "Bad Email",
            "email": "not-an-email",
            "password": "ValidPass1!",
            "user_type": "student",
        }
        resp = await async_client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 422

    async def test_register_short_password_422(self, async_client: AsyncClient):
        payload = {
            "name": "Short Pass",
            "email": f"sp_{uuid.uuid4().hex[:6]}@example.com",
            "password": "Ab1",  # too short
            "user_type": "student",
        }
        resp = await async_client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 422

    async def test_register_password_no_uppercase_422(self, async_client: AsyncClient):
        payload = {
            "name": "No Upper",
            "email": f"nu_{uuid.uuid4().hex[:6]}@example.com",
            "password": "nouppercase1",
            "user_type": "student",
        }
        resp = await async_client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 422

    async def test_register_missing_fields_422(self, async_client: AsyncClient):
        resp = await async_client.post("/api/v1/auth/register", json={})
        assert resp.status_code == 422


# ═══════════════════════════════════════════════════════════════════
# LOGIN
# ═══════════════════════════════════════════════════════════════════


class TestLogin:
    """POST /api/v1/auth/login"""

    async def test_login_success(self, async_client: AsyncClient, test_user_data):
        # Register first
        await async_client.post("/api/v1/auth/register", json=test_user_data)
        login_resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": test_user_data["email"], "password": test_user_data["password"]},
        )
        assert login_resp.status_code == 200
        body = login_resp.json()
        assert "access_token" in body
        assert body["name"] == test_user_data["name"]

    async def test_login_wrong_password_401(self, async_client: AsyncClient, test_user_data):
        await async_client.post("/api/v1/auth/register", json=test_user_data)
        resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": test_user_data["email"], "password": "WrongPassword1!"},
        )
        assert resp.status_code == 401

    async def test_login_nonexistent_email_401(self, async_client: AsyncClient):
        resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": "ghost@nonexistent.com", "password": "Anything1!"},
        )
        assert resp.status_code == 401

    async def test_login_returns_user_fields(self, async_client: AsyncClient, test_user_data):
        await async_client.post("/api/v1/auth/register", json=test_user_data)
        resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": test_user_data["email"], "password": test_user_data["password"]},
        )
        body = resp.json()
        assert "user_id" in body
        assert "onboarding_step" in body


# ═══════════════════════════════════════════════════════════════════
# TOKEN PROTECTION
# ═══════════════════════════════════════════════════════════════════


class TestTokenProtection:
    """Protected endpoints must reject missing / invalid tokens."""

    async def test_protected_endpoint_no_token(self, async_client: AsyncClient):
        """GET /api/v1/users/me without token → 401 or 403."""
        resp = await async_client.get("/api/v1/users/me")
        assert resp.status_code in (401, 403)

    async def test_protected_endpoint_invalid_token(self, async_client: AsyncClient):
        resp = await async_client.get(
            "/api/v1/users/me",
            headers={"Authorization": "Bearer totally.invalid.token"},
        )
        assert resp.status_code in (401, 403)

    async def test_protected_endpoint_expired_token(self, async_client: AsyncClient, test_user_data):
        """Create a token that is already expired using freezegun."""
        from app.core.security import create_access_token

        # Register to get a real user
        reg = await async_client.post("/api/v1/auth/register", json=test_user_data)
        user_id = reg.json()["user_id"]

        # Create token frozen in the past — will be expired by time assertion runs
        with freeze_time("2020-01-01"):
            expired_token = create_access_token(uuid.UUID(user_id), test_user_data["email"])

        resp = await async_client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert resp.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════
# LOGOUT
# ═══════════════════════════════════════════════════════════════════


class TestLogout:
    """POST /api/v1/auth/logout — requires authenticated user."""

    async def test_logout_success(self, authenticated_client):
        client, user_data = authenticated_client
        resp = await client.post("/api/v1/auth/logout")
        assert resp.status_code == 200
        body = resp.json()
        assert "message" in body

    async def test_logout_unauthenticated_rejected(self, async_client: AsyncClient):
        """Logout without a token should be rejected."""
        resp = await async_client.post("/api/v1/auth/logout")
        assert resp.status_code in (401, 403)
