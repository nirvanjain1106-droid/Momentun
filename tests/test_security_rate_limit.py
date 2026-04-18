import pytest
from httpx import AsyncClient
from app.core.rate_limit import limiter

# Pytest marker requires us to register 'security' in pytest.ini
pytestmark = pytest.mark.security

@pytest.mark.asyncio
async def test_auth_rate_limited_after_threshold(async_client: AsyncClient, redis_client, mocker):
    # Ensure a stable IP address for the limiter key function in test environment
    mocker.patch("app.core.rate_limit.get_remote_address", return_value="127.0.0.1")
    # Clear rate limits
    await redis_client.flushdb()

    payload = {
        "email": "ratelimit@example.com",
        "password": "Password123!"
    }
    
    # Enable limiter for this specific test
    limiter.enabled = True
    
    # Send multiple login requests (RATE_LIMIT_AUTH is 10/minute)
    responses = []
    for _ in range(15):
        resp = await async_client.post("/api/v1/auth/login", json=payload)
        responses.append(resp.status_code)
        
    assert 429 in responses, f"Auth endpoint was not rate-limited. Got status codes: {responses}"


@pytest.mark.asyncio
async def test_llm_rate_limited_after_threshold(
    async_client: AsyncClient, 
    setup_test_user, 
    redis_client,
    mocker
):
    # Ensure a stable IP address for the limiter key function
    mocker.patch("app.core.rate_limit.get_remote_address", return_value="127.0.0.1")
    await redis_client.flushdb()
    user, token = setup_test_user
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "target_date": "2030-01-01",
        "use_llm": True
    }
    
    # Enable limiter for this specific test
    limiter.enabled = True

    # LLM endpoints usually have strict limits, e.g., 3/hour.
    responses = []
    for _ in range(10):
        resp = await async_client.post("/api/v1/schedule/generate", json=payload, headers=headers)
        responses.append(resp.status_code)
        
    assert 429 in responses, f"LLM schedule generation was not rate-limited. Got status codes: {responses}"
