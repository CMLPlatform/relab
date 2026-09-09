"""Database migration testing fixtures.

Utilities for testing Alembic migrations, schema changes, and database evolution.
"""

from typing import TYPE_CHECKING

import pytest
from alembic import command
from pydantic import PostgresDsn
from sqlalchemy import Engine, create_engine, inspect, text

if TYPE_CHECKING:
    from alembic.config import Config


class MigrationHelper:
    """Helper class for testing database migrations."""

    def __init__(self, alembic_cfg: Config):
        """Initialize migration helper with Alembic config."""
        self.alembic_cfg = alembic_cfg
        # Derive engine URL from the alembic config (already xdist-worker-aware)
        url = self.alembic_cfg.get_main_option("sqlalchemy.url")
        if not url:
            msg = "Alembic config must have 'sqlalchemy.url' set for migration testing."
            raise ValueError(msg)
        PostgresDsn(url)  # Validate URL format
        self.sync_engine: Engine = create_engine(url, isolation_level="AUTOCOMMIT")

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

    def current_revision(self) -> str | None:
        """Get current database revision."""
        with self.sync_engine.connect() as connection:
            result = connection.execute(
                text("SELECT version_num FROM alembic_version ORDER BY version_num DESC LIMIT 1")
            )
            row = result.first()
            return str(row[0]) if row else None

    def text_column_lengths(self) -> dict[tuple[str, str], int | None]:
        """Map every public text column to its declared max length.

        A downgrade that restores the tables but not the column types leaves the schema
        subtly different from a fresh build; comparing this before and after a round-trip
        is what catches it.
        """
        with self.sync_engine.connect() as connection:
            rows = connection.execute(
                text(
                    "SELECT table_name, column_name, character_maximum_length "
                    "FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND data_type IN ('character varying', 'character')"
                )
            )
            return {(str(row[0]), str(row[1])): row[2] for row in rows}

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
        """Check if column exists in table."""
        with self.sync_engine.connect() as connection:
            inspector = inspect(connection)
            if table_name not in inspector.get_table_names():
                return False
            return column_name in [col["name"] for col in inspector.get_columns(table_name)]

    def get_table_columns(self, table_name: str) -> list[str]:
        """Get list of column names for a table."""
        with self.sync_engine.connect() as connection:
            inspector = inspect(connection)
            if table_name not in inspector.get_table_names():
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
            return list(result.fetchall()) if result.returns_rows else []


@pytest.fixture
def migration_helper(relab_alembic_config: Config) -> MigrationHelper:
    """Provide migration testing helper.

    Returns:
        MigrationHelper instance for testing migrations
    """
    return MigrationHelper(relab_alembic_config)
