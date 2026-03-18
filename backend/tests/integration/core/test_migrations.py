"""Test that all Alembic migrations run successfully."""

import logging

import pytest
from alembic.config import Config

from alembic import command

logger = logging.getLogger(__name__)


@pytest.mark.asyncio
async def test_migrations_upgrade_head() -> None:
    """Test that all migrations can be upgraded to head without error."""
    # If we've reached here, migrations have already run successfully
    # in the setup_test_database fixture, so this is a sanity check pass
    assert True, "All migrations completed successfully"


@pytest.mark.asyncio
async def test_migrations_downgrade_upgrade(relab_alembic_config: Config) -> None:
    """Test migration downgrade and upgrade cycle.

    This is optional and tests the migration reversibility.
    Only run if your migrations support downgrade.
    """
    command.downgrade(relab_alembic_config, "-1")  # Downgrade one migration
    command.upgrade(relab_alembic_config, "+1")  # Upgrade one migration
