#!/usr/bin/env python3

"""Standalone script to clean up unreferenced files in storage."""

import argparse
import logging
import sys
from functools import partial

from anyio import run

from app.api.file_storage.services.cleanup import cleanup_unreferenced_files, report_orphaned_media
from app.core.config import Environment, settings
from app.core.database import async_session_context, close_async_engine
from app.core.logging import setup_logging

# Configure logging
setup_logging()
logger = logging.getLogger(__name__)

_PROD_CONFIRMATION = "yes-delete-prod-files"


async def async_main(*, force: bool = False) -> None:
    """Run the cleanup process."""
    try:
        logger.info("Starting file cleanup...")
        logger.info("Environment: %s", settings.environment)
        logger.info("Database: %s", settings.database.host)
        logger.info("File storage path: %s", settings.file_storage_path)
        logger.info("Image storage path: %s", settings.image_storage_path)

        async with async_session_context() as session:
            # Note: we use not force as the dry_run argument
            await cleanup_unreferenced_files(session, dry_run=not force)
            await report_orphaned_media(session)
    finally:
        await close_async_engine()


def _confirm_prod_deletion() -> bool:
    """Prompt the user to confirm destructive deletion in production."""
    print(  # noqa: T201
        f"\nWARNING: You are about to PERMANENTLY DELETE files in PRODUCTION\n"
        f"   Database: {settings.database.host}\n"
        f"   File storage: {settings.file_storage_path}\n"
        f"\nType '{_PROD_CONFIRMATION}' to confirm: ",
        end="",
        flush=True,
    )
    return input().strip() == _PROD_CONFIRMATION


def main() -> None:
    """Run the async main function."""
    parser = argparse.ArgumentParser(description="Clean up unreferenced files in storage.")
    parser.add_argument(
        "--force", action="store_true", help="Actually delete the files. Without this flag, it performs a dry run."
    )
    args = parser.parse_args()

    if args.force and settings.environment == Environment.PROD and not _confirm_prod_deletion():
        logger.info("Confirmation not received, aborting.")
        sys.exit(0)

    run(partial(async_main, force=args.force))


if __name__ == "__main__":
    main()
