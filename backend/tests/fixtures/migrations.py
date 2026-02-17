"""Database migration testing fixtures.

Utilities for testing Alembic migrations, schema changes, and database evolution.
"""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from app.core.config import settings
from sqlalchemy import Engine, create_engine, inspect, text


class MigrationHelper:
    """Helper class for testing database migrations."""

    def __init__(self, alembic_cfg: Config):
        """Initialize migration helper with Alembic config."""
        self.alembic_cfg = alembic_cfg
        self.sync_engine: Engine = create_engine(
            settings.sync_database_url,
            isolation_level="AUTOCOMMIT",
        )

    def upgrade(self, revision: str = "head") -> None:
        """Upgrade database to specific revision.

        Args:
            revision: Target revision (default: 'head' - latest)
        """
        command.upgrade(self.alembic_cfg, revision)

    def downgrade(self, revision: str) -> None:
        """Downgrade database to specific revision.

        Args:
            revision: Target revision to downgrade to
        """
        command.downgrade(self.alembic_cfg, revision)

    def current_revision(self) -> str:
        """Get current database revision."""
        with self.sync_engine.connect() as connection:
            result = connection.execute(
                text("SELECT version_num FROM alembic_version ORDER BY version_num DESC LIMIT 1")
            )
            row = result.first()
            return row[0] if row else None

    def table_exists(self, table_name: str) -> bool:
        """Check if table exists in database.

        Args:
            table_name: Name of the table to check

        Returns:
            True if table exists, False otherwise
        """
        with self.sync_engine.connect() as connection:
            inspector = inspect(connection)
            return table_name in inspector.get_table_names()

    def column_exists(self, table_name: str, column_name: str) -> bool:
        """Check if column exists in table.

        Args:
            table_name: Table to check
            column_name: Column to look for

        Returns:
            True if column exists, False otherwise
        """
        with self.sync_engine.connect() as connection:
            inspector = inspect(connection)
            if not self.table_exists(table_name):
                return False
            columns = [col["name"] for col in inspector.get_columns(table_name)]
            return column_name in columns

    def get_table_columns(self, table_name: str) -> list[str]:
        """Get list of column names for a table.

        Args:
            table_name: Table to inspect

        Returns:
            List of column names
        """
        with self.sync_engine.connect() as connection:
            inspector = inspect(connection)
            if not self.table_exists(table_name):
                return []
            return [col["name"] for col in inspector.get_columns(table_name)]

    def get_table_constraints(self, table_name: str) -> dict:
        """Get constraints for a table (primary key, unique, foreign keys, checks).

        Args:
            table_name: Table to inspect

        Returns:
            Dictionary with constraint information
        """
        with self.sync_engine.connect() as connection:
            inspector = inspect(connection)
            return {
                "pk": inspector.get_pk_constraint(table_name),
                "unique": inspector.get_unique_constraints(table_name),
                "fk": inspector.get_foreign_keys(table_name),
                "checks": inspector.get_check_constraints(table_name),
            }

    def execute_sql(self, sql: str) -> list:
        """Execute arbitrary SQL and return results.

        Args:
            sql: SQL statement to execute

        Returns:
            List of result rows
        """
        with self.sync_engine.connect() as connection:
            result = connection.execute(text(sql))
            return result.fetchall()


@pytest.fixture
def alembic_config() -> Config:
    """Provide Alembic configuration for migration tests.

    Returns:
        Configured Alembic Config object
    """
    config = Config()
    project_root: Path = Path(__file__).parents[2]  # Navigate to backend/
    config.set_main_option("script_location", str(project_root / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.sync_database_url)
    return config


@pytest.fixture
def migration_helper(alembic_config: Config) -> MigrationHelper:
    """Provide migration testing helper.

    Returns:
        MigrationHelper instance for testing migrations
    """
    return MigrationHelper(alembic_config)
