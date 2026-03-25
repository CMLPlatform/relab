"""Shared persistence helpers for SQLModel CRUD operations."""

from typing import Protocol

from sqlmodel.ext.asyncio.session import AsyncSession


class SupportsModelDump(Protocol):
    """Schema protocol for SQLModel update payloads."""

    def model_dump(
        self,
        *,
        exclude_unset: bool = False,
        exclude: set[str] | None = None,
    ) -> dict[str, object]:
        """Return payload values for persistence."""
        ...


class SupportsSQLModelUpdate(Protocol):
    """Model protocol for SQLModel update operations."""

    def sqlmodel_update(self, obj: dict[str, object]) -> None:
        """Apply a partial update to a SQLModel instance."""
        ...


async def commit_and_refresh[ModelT](
    db: AsyncSession,
    db_model: ModelT,
    *,
    add_before_commit: bool = True,
) -> ModelT:
    """Commit the current transaction and refresh one model instance."""
    if add_before_commit:
        db.add(db_model)
    await db.commit()
    await db.refresh(db_model)
    return db_model


async def update_and_commit[ModelT: SupportsSQLModelUpdate](
    db: AsyncSession,
    db_model: ModelT,
    payload: SupportsModelDump,
) -> ModelT:
    """Apply a partial update and persist the result."""
    db_model.sqlmodel_update(payload.model_dump(exclude_unset=True))
    return await commit_and_refresh(db, db_model)


async def delete_and_commit(db: AsyncSession, db_model: object) -> None:
    """Delete one model instance and commit the transaction."""
    await db.delete(db_model)
    await db.commit()
