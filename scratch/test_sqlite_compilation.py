import asyncio
from sqlalchemy import Column, Integer
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.ext.compiler import compiles
import sys

# Hooks for SQLite
@compiles(ARRAY, 'sqlite')
def compile_array(element, compiler, **kw):
    return "JSON"

@compiles(JSONB, 'sqlite')
def compile_jsonb(element, compiler, **kw):
    return "JSON"

Base = declarative_base()

class TestModel(Base):
    __tablename__ = "test_table"
    id = Column(Integer, primary_key=True)
    my_uuid = Column(UUID(as_uuid=True))
    my_array = Column(ARRAY(Integer))
    my_jsonb = Column(JSONB)

async def main():
    try:
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("Success! Table created in SQLite.")
        sys.exit(0)
    except Exception as e:
        print(f"Failed: {e}")
        sys.exit(1)

asyncio.run(main())
