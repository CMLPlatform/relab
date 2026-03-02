"""Clear cache entries in Redis by namespace.

This script can be used to clear cache for specific namespaces.
Run with: python scripts/clear_cache.py [namespace]

Available namespaces:
- background-data (default): All background data GET endpoints
- docs: OpenAPI documentation endpoints
"""

import asyncio
import logging
import sys

from app.core.cache import clear_cache_namespace, init_fastapi_cache
from app.core.config import CacheNamespace
from app.core.logging import setup_logging
from app.core.redis import close_redis, init_redis

# Configure logging for standalone script execution
setup_logging()
logger = logging.getLogger(__name__)


async def clear_cache(namespace: CacheNamespace) -> int:
    """Clear all cache entries for the specified namespace.

    Args:
        namespace: Cache namespace to clear

    Returns:
        Exit code (0 for success, 1 for failure)
    """
    redis_client = await init_redis()
    if redis_client is None:
        logger.warning("Redis unavailable; cache not cleared.")
        return 1

    init_fastapi_cache(redis_client)
    await clear_cache_namespace(namespace)
    await close_redis(redis_client)

    logger.info("Successfully cleared cache namespace: %s", namespace)
    return 0


def main() -> None:
    """Run the cache clearing script."""
    # Parse namespace from command line argument, default to background-data
    namespace_arg = sys.argv[1] if len(sys.argv) > 1 else CacheNamespace.BACKGROUND_DATA

    # Validate namespace
    try:
        namespace = CacheNamespace(namespace_arg)
    except ValueError:
        valid_namespaces = ", ".join([ns.value for ns in CacheNamespace])
        logger.exception("Invalid namespace '%s'. Valid namespaces: %s", namespace_arg, valid_namespaces)
        raise SystemExit(1) from None

    logger.info("Clearing cache namespace: %s", namespace)
    # Run the async function
    raise SystemExit(asyncio.run(clear_cache(namespace)))


if __name__ == "__main__":
    main()
