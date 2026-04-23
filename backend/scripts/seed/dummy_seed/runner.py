"""Execution helpers for dummy-data seeding."""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from anyio.to_thread import run_sync
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.database import async_engine, async_session_context, close_async_engine

from .background import seed_categories, seed_materials, seed_product_types, seed_taxonomies
from .images import seed_images
from .products import seed_products
from .users import seed_users

logger = logging.getLogger(__name__)


class DryRunAsyncSession(AsyncSession):
    """AsyncSession that flushes instead of committing for dry runs."""

    async def commit(self) -> None:
        """Override commit to flush instead for dry run mode."""
        await self.flush()


async def reset_db() -> None:
    """Reset the database using Alembic."""
    logger.info("Resetting database with Alembic...")

    def run_alembic_reset() -> None:
        project_root = Path(__file__).resolve().parents[3]
        alembic_cfg = Config(toml_file=str(project_root / "pyproject.toml"))
        command.downgrade(alembic_cfg, "base")
        command.upgrade(alembic_cfg, "head")

    await run_sync(run_alembic_reset)
    logger.info("Database reset successfully.")


async def run_seed_steps(session: AsyncSession) -> None:
    """Run all dummy-data seed steps against an existing session."""
    user_map = await seed_users(session)
    taxonomy_map = await seed_taxonomies(session)
    category_map = await seed_categories(session, taxonomy_map)
    material_map = await seed_materials(session, category_map)
    product_type_map = await seed_product_types(session, category_map)
    product_id_map = await seed_products(session, product_type_map, material_map, user_map)
    await seed_images(session, product_id_map)


async def async_main(*, reset: bool = False, dry_run: bool = False) -> None:
    """Seed the database with sample data."""
    try:
        if dry_run and reset:
            logger.warning("Dry run requested; skipping reset to avoid destructive changes.")
            reset = False

        if reset:
            await reset_db()

        if dry_run:
            dry_run_factory = async_sessionmaker(async_engine, class_=DryRunAsyncSession, expire_on_commit=False)
            async with dry_run_factory() as session:
                await run_seed_steps(session)
                await session.rollback()
                logger.info("Dry run complete; all changes rolled back.")
            return

        async with async_session_context() as session:
            await run_seed_steps(session)
            logger.info("Database seeded with test data.")
    finally:
        await close_async_engine()
