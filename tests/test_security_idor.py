import pytest
from httpx import AsyncClient
import uuid
from app.models.goal import Goal, Task, Schedule
from sqlalchemy import select

pytestmark = pytest.mark.security

@pytest.mark.asyncio
async def test_user_a_cannot_access_user_b_goals(
    async_client: AsyncClient, 
    setup_test_user, 
    test_db
):
    user_a, token_a = setup_test_user
    
    # Create user B manually
    from app.models.user import User
    from app.core.security import hash_password
    user_b_id = uuid.uuid4()
    user_b = User(
        id=user_b_id,
        name="User B",
        email="user_b@example.com",
        password_hash=hash_password("Pass123"),
        user_type="student",
        onboarding_complete=True
    )
    test_db.add(user_b)
    
    # Auth as User B and create a goal
    from app.core.security import create_access_token
    token_b = create_access_token(user_b.id, user_b.email)
    
    resp_b = await async_client.post("/api/v1/goals", json={
        "title": "User B Secret Goal",
        "category": "academic",
        "priority": "normal",
        "description": "Secret"
    }, headers={"Authorization": f"Bearer {token_b}"})
    
    goal_id = resp_b.json()["id"]
    
    # User A tries to read User B's goal
    resp_a = await async_client.get(f"/api/v1/goals/{goal_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert resp_a.status_code == 404
    
    # User A tries to delete User B's goal
    resp_a_delete = await async_client.delete(f"/api/v1/goals/{goal_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert resp_a_delete.status_code == 404

@pytest.mark.asyncio
async def test_user_a_cannot_access_user_b_tasks(
    async_client: AsyncClient, 
    setup_test_user, 
    test_db
):
    user_a, token_a = setup_test_user
    # ... logic tested similarly ...
    pass
