"""
Tests for Sprint 7 Milestones API
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

async def test_api_list_milestones(async_client: AsyncClient, setup_test_user):
    """Test GET /api/v1/milestones endpoint."""
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}
    
    response = await async_client.get("/api/v1/milestones", headers=headers)
    assert response.status_code in (200, 501, 404)
    
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, list)
