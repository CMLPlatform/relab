"""Database fixtures and helpers for testing."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select


class DBOperations:
    """Helper class for common database operations in tests."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, model, obj_id: int):
        """Get model instance by ID."""
        return await self.session.get(model, obj_id)

    async def get_by_filter(self, model, **filters):
        """Get single model instance by filters."""
        stmt = select(model).filter_by(**filters)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all(self, model, **filters):
        """Get all model instances matching filters."""
        stmt = select(model).filter_by(**filters)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create(self, instance):
        """Create instance and return it with ID."""
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete(self, instance):
        """Delete instance."""
        await self.session.delete(instance)
        await self.session.flush()


@pytest.fixture
def db_ops(session: AsyncSession) -> DBOperations:
    """Provide database operations helper."""
    return DBOperations(session)
