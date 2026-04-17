"""API endpoint tests using FastAPI TestClient."""

import os
# Ensure a valid SECRET_KEY for test imports
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-characters-long!!")

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app



# ── Root & Health ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_root_returns_app_info(async_client):
    resp = await async_client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "running"
    assert "app" in data
    assert "version" in data


@pytest.mark.asyncio
async def test_health_endpoint_exists(async_client):
    # Will return 503 if no DB, but should not 404
    resp = await async_client.get("/health")
    assert resp.status_code in (200, 503)


# ── Auth — Registration ─────────────────────────────────────


@pytest.mark.asyncio
async def test_register_missing_fields(async_client):
    resp = await async_client.post("/api/v1/auth/register", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_invalid_email(async_client):
    resp = await async_client.post("/api/v1/auth/register", json={
        "name": "Test User",
        "email": "not-an-email",
        "password": "Secure123",
        "user_type": "student",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_weak_password(async_client):
    resp = await async_client.post("/api/v1/auth/register", json={
        "name": "Test User",
        "email": "test@example.com",
        "password": "weak",
        "user_type": "student",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_invalid_user_type(async_client):
    resp = await async_client.post("/api/v1/auth/register", json={
        "name": "Test User",
        "email": "test@example.com",
        "password": "Secure123",
        "user_type": "admin",
    })
    assert resp.status_code == 422


# ── Auth — Login ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_missing_fields(async_client):
    resp = await async_client.post("/api/v1/auth/login", json={})
    assert resp.status_code == 422


# ── Protected routes return 401 ──────────────────────────────


@pytest.mark.asyncio
async def test_protected_route_no_token(async_client):
    endpoints = [
        ("GET", "/api/v1/onboarding/status"),
        ("GET", "/api/v1/schedule/today"),
        ("GET", "/api/v1/insights/patterns"),
        ("GET", "/api/v1/goals/active"),
    ]
    for method, path in endpoints:
        if method == "GET":
            resp = await async_client.get(path)
        else:
            resp = await async_client.post(path)
        assert resp.status_code in (401, 403, 422), f"{method} {path} returned {resp.status_code}"


# ── Password Reset ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_password_reset_request_invalid_email(async_client):
    resp = await async_client.post("/api/v1/auth/password-reset/request", json={
        "email": "not-an-email",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_password_reset_confirm_missing_fields(async_client):
    resp = await async_client.post("/api/v1/auth/password-reset/confirm", json={})
    assert resp.status_code == 422


# ── Logout needs auth ───────────────────────────────────────


@pytest.mark.asyncio
async def test_logout_requires_auth(async_client):
    resp = await async_client.post("/api/v1/auth/logout")
    assert resp.status_code in (401, 403)


# ── Request ID header ───────────────────────────────────────


@pytest.mark.asyncio
async def test_request_id_header_returned(async_client):
    resp = await async_client.get("/")
    assert "x-request-id" in resp.headers


@pytest.mark.asyncio
async def test_custom_request_id_echoed(async_client):
    custom_id = "my-custom-request-id-12345"
    resp = await async_client.get("/", headers={"X-Request-ID": custom_id})
    assert resp.headers.get("x-request-id") == custom_id
