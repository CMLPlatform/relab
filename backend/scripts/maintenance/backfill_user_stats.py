#!/usr/bin/env python3

"""Backfill user statistics in the stats_cache for all users.

Run with: python -m scripts.maintenance.backfill_user_stats
"""

import asyncio
import logging

from sqlalchemy import select

from app.api.auth.models import User
from app.api.auth.services.stats import recompute_user_stats
from app.core.database import async_session_context, close_async_engine
from app.core.logging import setup_logging

# Configure logging
setup_logging()
logger = logging.getLogger(__name__)


async def backfill_stats() -> int:
    """Iterate through all users and recompute their stats_cache."""
    logger.info("Starting backfill of user statistics...")

    async with async_session_context() as session:
        # Get all user IDs
        stmt = select(User.id)
        result = await session.execute(stmt)
        user_ids = [row[0] for row in result.all()]

        logger.info("Found %d users to process.", len(user_ids))

        processed = 0
        for user_id in user_ids:
            try:
                await recompute_user_stats(session, user_id)
                # Commit after each user to ensure progress is saved
                await session.commit()
                processed += 1
                if processed % 10 == 0:
                    logger.info("Processed %d/%d users...", processed, len(user_ids))
            except Exception:
                logger.exception("Failed to recompute stats for user %s", user_id)
                await session.rollback()

    logger.info("Backfill complete. Processed %d users.", processed)
    await close_async_engine()
    return 0


def main() -> None:
    """Run the backfill script."""
    raise SystemExit(asyncio.run(backfill_stats()))


if __name__ == "__main__":
    main()
