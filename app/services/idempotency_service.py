from datetime import datetime, timedelta
from typing import Optional, Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.idempotency import IdempotencyStore

class IdempotencyService:
    @staticmethod
    async def get_cached_response(session: AsyncSession, key: str) -> Optional[IdempotencyStore]:
        """
        Check if an idempotency key exists and is not expired.
        """
        stmt = select(IdempotencyStore).where(
            IdempotencyStore.idempotency_key == key,
            IdempotencyStore.expires_at > datetime.utcnow()
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
        
    @staticmethod
    async def save_response(
        session: AsyncSession,
        key: str,
        endpoint: str,
        response_body: Dict[str, Any],
        status_code: int = 200,
        ttl_hours: int = 24
    ) -> IdempotencyStore:
        """
        Save the endpoint response for a specific idempotency key.
        """
        # Expiration logic
        expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
        
        record = IdempotencyStore(
            idempotency_key=key,
            endpoint=endpoint,
            response_body=response_body,
            status_code=status_code,
            expires_at=expires_at
        )
        session.add(record)
        # Assuming the caller invokes session.commit()
        return record
        
    @staticmethod
    async def cleanup_expired(session: AsyncSession):
        """
        Periodically run to clean up expired idempotency keys to manage table growth
        """
        stmt = delete(IdempotencyStore).where(IdempotencyStore.expires_at <= datetime.utcnow())
        await session.execute(stmt)
        # Assuming the caller invokes session.commit()
