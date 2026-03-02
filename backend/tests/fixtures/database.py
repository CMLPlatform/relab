"""Database fixtures and helpers for testing."""

from typing import Any, TypeVar

import pytest
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

T = TypeVar("T")


class DBOperations:
    """Helper class for common database operations in tests."""

    session: AsyncSession

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, model: type[T], obj_id: int) -> T | None:
        """Get model instance by ID."""
        return await self.session.get(model, obj_id)

    async def get_by_filter(self, model: type[T], **filters: Any) -> T | None:  # noqa: ANN401 # Any-typed filter kwargs are expected by SQLModel
        """Get single model instance by filters."""
        stmt = select(model).filter_by(**filters)
        result = await self.session.exec(stmt)
        return result.one_or_none()

    async def get_all(self, model: type[T], **filters: Any) -> list[T]:  # noqa: ANN401 # Any-typed filter kwargs are expected by SQLModel
        """Get all model instances matching filters."""
        stmt = select(model).filter_by(**filters)
        result = await self.session.exec(stmt)
        return list(result.all())

    async def create(self, instance: T) -> T:
        """Create instance and return it with ID."""
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete(self, instance: T) -> None:
        """Delete instance."""
        await self.session.delete(instance)
        await self.session.flush()


@pytest.fixture
def db_ops(session: AsyncSession) -> DBOperations:
    """Provide database operations helper."""
    return DBOperations(session)
