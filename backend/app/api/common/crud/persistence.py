"""Shared persistence helpers for CRUD operations."""

from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession


class SupportsModelDump(Protocol):
    """Schema protocol for update payloads."""

    def model_dump(
        self,
        *,
        exclude_unset: bool = False,
        exclude: set[str] | None = None,
    ) -> dict[str, object]:
        """Return payload values for persistence."""


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


async def update_and_commit[ModelT](
    db: AsyncSession,
    db_model: ModelT,
    payload: SupportsModelDump,
) -> ModelT:
    """Apply a partial update and persist the result."""
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_model, key, value)
    return await commit_and_refresh(db, db_model)


async def delete_and_commit(db: AsyncSession, db_model: object) -> None:
    """Delete one model instance and commit the transaction."""
    await db.delete(db_model)
    await db.commit()
