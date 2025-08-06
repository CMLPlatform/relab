#!/usr/bin/env python3

"""Check if the database is empty to determine if seeding is required.

database_is_empty inspects all tables to check if they contain any data. If all tables are empty,
it returns True, indicating that seeding is required. Otherwise, it returns False.

Usage:
    Run this script directly to print 1 if the database is empty, or 0 if it is not.
"""

import sys
from typing import Any

from app.core.config import settings
from sqlalchemy import CursorResult, Engine, Inspector, MetaData, Select, Table, inspect, select
from sqlmodel import create_engine

sync_engine: Engine = create_engine(settings.sync_database_url, echo=settings.debug)


inspector: Inspector = inspect(sync_engine)
metadata = MetaData()


def database_is_empty(ignore_tables: set[str] | None = None) -> bool:
    """Check if the database is empty by inspecting all tables, ignoring the alembic_version table."""
    # Ignore the alembic_version table by default
    if ignore_tables is None:
        ignore_tables = {"alembic_version"}

    tables: list[str] = inspector.get_table_names()
    if not tables:
        # No tables exist
        return True
    metadata.reflect(bind=sync_engine)
    with sync_engine.connect() as conn:
        for table_name in tables:
            if table_name in ignore_tables:
                continue  # Skip ignored tables
            table: Table = metadata.tables[table_name]
            query: Select[Any] = select(table).limit(1)
            result: CursorResult[Any] = conn.execute(query)
            if result.fetchone():
                # Found data in this table
                return False
    # All tables are empty
    return True


if __name__ == "__main__":
    if database_is_empty(ignore_tables={"alembic_version"}):
        # Database is empty, exit with code 0
        sys.exit(0)
    else:
        # Database has data, exit with code 1
        sys.exit(1)
