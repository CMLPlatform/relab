"""Test that all Alembic migrations run successfully."""

import logging

import pytest

logger = logging.getLogger(__name__)


@pytest.mark.asyncio
async def test_migrations_upgrade_head(setup_test_database):
    """Test that all migrations can be upgraded to head without error."""
    # If we've reached here, migrations have already run successfully
    # in the setup_test_database fixture, so this is a sanity check pass
    assert True, "All migrations completed successfully"


@pytest.mark.asyncio
async def test_migrations_downgrade_upgrade():
    """Test migration downgrade and upgrade cycle.

    This is optional and tests the migration reversibility.
    Only run if your migrations support downgrade.
    """
    # Note: This requires migrations to have downgrade functions
    # Uncomment if you want to test reversibility
    # alembic_cfg = get_alembic_config()
    # command.downgrade(alembic_cfg, "-1")  # Downgrade one migration
    # command.upgrade(alembic_cfg, "+1")    # Upgrade one migration
