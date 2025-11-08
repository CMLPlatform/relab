"""Utilities for validating email addresses."""

import asyncio
import contextlib
import logging

from fastapi import Request
from fastapi_mail.email_utils import DefaultChecker
from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)

# Custom source for disposable domains
DISPOSABLE_DOMAINS_URL = "https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt"


class EmailChecker:
    """Email checker that manages disposable domain validation."""

    def __init__(self, redis_client: Redis | None) -> None:
        """Initialize email checker with Redis client.

        Args:
            redis_client: Redis client instance to use for caching
        """
        self.redis_client = redis_client
        self.checker: DefaultChecker | None = None
        self._refresh_task: asyncio.Task | None = None

    async def initialize(self) -> None:
        """Initialize the disposable email checker.

        Should be called during application startup.
        """
        try:
            if self.redis_client is None:
                self.checker = DefaultChecker(source=DISPOSABLE_DOMAINS_URL)
                logger.info("Disposable email checker initialized without Redis")
            else:
                self.checker = DefaultChecker(
                    source=DISPOSABLE_DOMAINS_URL,
                    db_provider="redis",
                    redis_client=self.redis_client,
            )
                await self.checker.init_redis()
                logger.info("Disposable email checker initialized with Redis")

            # Fetch initial domains
            await self._refresh_domains()

            # Start periodic refresh task
            self._refresh_task = asyncio.create_task(self._periodic_refresh())

        except (RuntimeError, ValueError, ConnectionError, OSError, RedisError) as e:
            logger.warning("Failed to initialize disposable email checker: %s", e)
            self.checker = None

    async def _refresh_domains(self) -> None:
        """Refresh the list of disposable email domains from the source."""
        if self.checker is None:
            logger.warning("Email checker not initialized, cannot refresh domains")
            return
        try:
            await self.checker.fetch_temp_email_domains()
            logger.info("Disposable email domains refreshed successfully")
        except (RuntimeError, ValueError, ConnectionError, OSError, RedisError):
            logger.exception("Failed to refresh disposable email domains:")

    async def _periodic_refresh(self) -> None:
        """Periodically refresh disposable domains every 24 hours."""
        while True:
            try:
                await asyncio.sleep(60 * 60 * 24)  # 24 hours
                await self._refresh_domains()
            except asyncio.CancelledError:
                logger.info("Periodic domain refresh task cancelled")
                break
            except (RuntimeError, ValueError, ConnectionError, OSError, RedisError):
                logger.exception("Error in periodic domain refresh:")

    async def close(self) -> None:
        """Close the email checker and cleanup resources.

        Should be called during application shutdown.
        """
        # Cancel periodic refresh task
        if self._refresh_task is not None:
            self._refresh_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._refresh_task

        # Close checker connections if initialized
        if self.checker is not None and self.redis_client is not None:
            logger.info("Closing email checker Redis connections")
            try:
                await self.checker.close_connections()
                logger.info("Email checker closed successfully")
            except (RuntimeError, ValueError, ConnectionError, OSError, RedisError) as e:
                logger.warning("Error closing email checker: %s", e)
            finally:
                self.checker = None

    async def is_disposable(self, email: str) -> bool:
        """Check if email domain is disposable.

        Args:
            email: Email address to check

        Returns:
            bool: True if email is from a disposable domain, False otherwise
        """
        if self.checker is None:
            logger.warning("Email checker not initialized, allowing registration")
            return False
        try:
            return await self.checker.is_disposable(email)
        except (RuntimeError, ValueError, ConnectionError, OSError, RedisError):
            logger.exception("Failed to check if email is disposable: %s. Allowing registration.", email)
            # If check fails, allow registration (fail open)
            return False


def get_email_checker_dependency(request: Request) -> EmailChecker | None:
    """FastAPI dependency to get EmailChecker from app state.

    Args:
        request: FastAPI request object

    Returns:
        EmailChecker instance or None if not initialized

    Usage:
        @app.get("/example")
        async def example(email_checker: EmailChecker | None = Depends(get_email_checker_dependency)):
            if email_checker:
                await email_checker.is_disposable("test@example.com")
    """
    return request.app.state.email_checker
