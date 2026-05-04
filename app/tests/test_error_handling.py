"""
test_error_handling.py — 7 tests verifying global error handling, 404/405/422
responses, and that errors always return JSON (never HTML).

Targets the global exception handler in app/main.py and FastAPI's built-in
validation error responses.
"""


import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestNotFound:
    """Unknown endpoints should return 404 JSON."""

    async def test_404_unknown_endpoint(self, async_client: AsyncClient):
        resp = await async_client.get("/api/v1/this-does-not-exist")
        assert resp.status_code == 404
        body = resp.json()
        assert "detail" in body

    async def test_404_response_is_json(self, async_client: AsyncClient):
        resp = await async_client.get("/api/v1/nonexistent-resource")
        assert "application/json" in resp.headers.get("content-type", "")


class TestMethodNotAllowed:
    """Using the wrong HTTP method should return 405."""

    async def test_405_wrong_method(self, async_client: AsyncClient):
        # /api/v1/auth/register is POST-only
        resp = await async_client.get("/api/v1/auth/register")
        assert resp.status_code == 405


class TestValidationErrors:
    """Malformed requests should return 422 with structured JSON."""

    async def test_422_malformed_json(self, async_client: AsyncClient):
        resp = await async_client.post(
            "/api/v1/auth/register",
            content=b"{invalid json}",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 422

    async def test_422_response_has_detail(self, async_client: AsyncClient):
        resp = await async_client.post("/api/v1/auth/register", json={})
        assert resp.status_code == 422
        body = resp.json()
        assert "detail" in body


class TestAuthErrors:
    """Unauthenticated / forbidden requests."""

    async def test_unauthenticated_returns_401_or_403(self, async_client: AsyncClient):
        """Protected endpoint without token → 401 or 403."""
        resp = await async_client.get("/api/v1/users/me")
        assert resp.status_code in (401, 403)

    async def test_error_responses_are_json(self, async_client: AsyncClient):
        """Even error responses should be well-formed JSON, not HTML."""
        resp = await async_client.get("/api/v1/users/me")
        content_type = resp.headers.get("content-type", "")
        assert "application/json" in content_type
        # Should parse as JSON without error
        body = resp.json()
        assert isinstance(body, dict)
