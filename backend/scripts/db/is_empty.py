#!/usr/bin/env python3

"""Check whether the database is empty.

The shell-facing contract uses exit codes instead of parsing printed text:
- 0: database is empty
- 10: database contains data

By default the CLI also prints a short human-readable message. Pass ``--quiet``
when using it from shell scripts that only care about the exit status.
"""

import argparse
from typing import TYPE_CHECKING

from sqlalchemy import CursorResult, Inspector, MetaData, Select, Table, inspect, select

from scripts.db.sync import sync_engine

if TYPE_CHECKING:
    from collections.abc import Sequence
    from typing import Any

EXIT_EMPTY = 0
EXIT_NOT_EMPTY = 10

def database_is_empty(ignore_tables: set[str] | None = None) -> bool:
    """Check if the database is empty by inspecting all tables, ignoring the alembic_version table."""
    # Ignore the alembic_version table by default
    if ignore_tables is None:
        ignore_tables = {"alembic_version"}

    inspector: Inspector = inspect(sync_engine)
    metadata = MetaData()

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


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress text output and communicate the result only via exit code.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    """Return a shell-friendly exit code for the database emptiness check."""
    args = parse_args(argv)
    is_empty = database_is_empty(ignore_tables={"alembic_version", "user"})

    if not args.quiet:
        print("Database is empty." if is_empty else "Database contains data.")  # noqa: T201 # We want this output for human users when not in quiet mode.

    return EXIT_EMPTY if is_empty else EXIT_NOT_EMPTY


if __name__ == "__main__":
    raise SystemExit(main())
