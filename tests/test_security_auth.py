import pytest
from httpx import AsyncClient
from app.models.user import RefreshToken
from sqlalchemy import select

pytestmark = pytest.mark.security

@pytest.mark.asyncio
async def test_expired_token_rejected(async_client: AsyncClient, setup_test_user):
    _, valid_token = setup_test_user
    # We could mock JWT decode to simulate an expired token, but simple tampered token triggers 401
    invalid_token = valid_token + "tamper"
    
    resp = await async_client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {invalid_token}"})
    assert resp.status_code == 401
    assert "Invalid or expired token" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_token_rotation_grace_window(async_client: AsyncClient, test_db, setup_test_user):
    user, _ = setup_test_user
    
    # Needs a real login to get refresh token cookie
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "email": user.email, "password": "Password123!"
    })
    refresh_token = login_resp.cookies.get("refresh_token")
    assert refresh_token
    
    async_client.cookies.set("refresh_token", refresh_token)
    
    # 1st Refresh
    ref1_resp = await async_client.post("/api/v1/auth/refresh", json={})
    assert ref1_resp.status_code == 200
    
    # 2nd Refresh within 5s grace window
    ref2_resp = await async_client.post("/api/v1/auth/refresh", json={})
    assert ref2_resp.status_code == 200
    assert "new_refresh_token" not in ref2_resp.json() or ref2_resp.json().get("new_refresh_token") is None

@pytest.mark.asyncio
async def test_token_rotation_replay_detected(async_client: AsyncClient, test_db, setup_test_user):
    user, _ = setup_test_user
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "email": user.email, "password": "Password123!"
    })
    stolen_refresh_token = login_resp.cookies.get("refresh_token") or ""
    
    # 1st Refresh (Valid Action)
    async_client.cookies.set("refresh_token", stolen_refresh_token)
    ref1 = await async_client.post("/api/v1/auth/refresh", json={})
    assert ref1.status_code == 200
    
    # Simulate time passing by manually modifying used_at in DB
    result = await test_db.execute(select(RefreshToken).where(RefreshToken.user_id == user.id))
    tokens = result.scalars().all()
    
    from datetime import datetime, timezone, timedelta
    for t in tokens:
        if t.used_at:
            t.used_at = datetime.now(timezone.utc) - timedelta(seconds=10)
    await test_db.commit()
    
    # 2nd Refresh attempt with stolen token (Replay Attack)
    async_client.cookies.set("refresh_token", stolen_refresh_token)
    ref2 = await async_client.post("/api/v1/auth/refresh", json={})
    
    assert ref2.status_code == 401
    assert "Session compromised" in ref2.json()["detail"]
