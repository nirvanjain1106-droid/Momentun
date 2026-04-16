from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class IdempotencyStore(Base):
    __tablename__ = "idempotency_store"

    # UUID provided by the client's Idempotency-Key header is used as the primary key
    idempotency_key: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)
    
    # Store the endpoint path as extra safety checks (optional, but good practice)
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # The JSON payload that was the result of the mutation
    response_body: Mapped[dict] = mapped_column(JSONB, nullable=False)
    
    # Status code, natively assuming 200 for successful completion caching, 
    # but good generically.
    status_code: Mapped[int] = mapped_column(default=200, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
