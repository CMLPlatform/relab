"""Seed the database with sample data for testing purposes."""

import argparse
from functools import partial

from anyio import run

from app.core.logging import setup_logging
from scripts.seed.dummy_seed.products import logger, normalize_unit
from scripts.seed.dummy_seed.runner import async_main

setup_logging()

__all__ = ["async_main", "logger", "main", "normalize_unit"]


def main() -> None:
    """Run the async main function."""
    parser = argparse.ArgumentParser(description="Seed the database with dummy data.")
    parser.add_argument("--reset", action="store_true", help="Reset the database before seeding.")
    parser.add_argument(
        "--dry-run", action="store_true", help="Seed data but rollback the transaction instead of committing."
    )
    args = parser.parse_args()

    run(partial(async_main, reset=args.reset, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
