import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User, UserBehaviouralProfile
from app.services.auth_service import hash_password

async def seed_e2e_user():
    async with AsyncSessionLocal() as db:
        # Check if test user exists
        stmt = select(User).where(User.email == "test@example.com")
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if user:
            print("E2E test user already exists.")
            return

        # Create new user
        new_user = User(
            name="E2E Tester",
            email="test@example.com",
            password_hash=hash_password("password123"),
            user_type="student",
            onboarding_complete=True,
            onboarding_step=5
        )
        db.add(new_user)
        await db.flush()

        # Add behavioral profile (required for insights)
        profile = UserBehaviouralProfile(
            user_id=new_user.id,
            wake_time="07:00",
            sleep_time="23:00",
            chronotype="early_bird",
            daily_commitment_hrs=4.0,
            max_focus_duration_mins=45
        )
        db.add(profile)
        await db.commit()
        print("E2E test user created successfully.")

if __name__ == "__main__":
    asyncio.run(seed_e2e_user())
