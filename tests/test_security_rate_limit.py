import pytest
from httpx import AsyncClient
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

# Pytest marker requires us to register 'security' in pytest.ini
pytestmark = pytest.mark.security

@pytest.mark.asyncio
async def test_auth_rate_limited_after_threshold(async_client: AsyncClient, redis_client):
    # Clear rate limits
    await redis_client.flushdb()

    payload = {
        "email": "ratelimit@example.com",
        "password": "Password123!"
    }
    
    # Send 10 identical login requests (RATE_LIMIT_AUTH is typically 5/minute)
    responses = []
    for _ in range(10):
        resp = await async_client.post("/api/v1/auth/login", json=payload)
        responses.append(resp.status_code)
        
    assert 429 in responses, "Auth endpoint was not rate-limited"


@pytest.mark.asyncio
async def test_llm_rate_limited_after_threshold(
    async_client: AsyncClient, 
    setup_test_user, 
    redis_client
):
    await redis_client.flushdb()
    user, token = setup_test_user
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "target_date": "2030-01-01",
        "use_llm": True
    }
    
    # LLM endpoints usually have strict limits, e.g., 10/day or similar.
    # We will trigger enough to hit the 429
    responses = []
    for _ in range(25):
        resp = await async_client.post("/api/v1/schedule/generate", json=payload, headers=headers)
        responses.append(resp.status_code)
        
    assert 429 in responses, "LLM schedule generation was not rate-limited"
