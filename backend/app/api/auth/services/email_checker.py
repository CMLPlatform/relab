"""Disposable-email validation service for auth flows."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from httpx import HTTPError
from redis.exceptions import RedisError

from app.api.auth.services.blocklist_store import (
    load_blocklist_lines,
    load_blocklist_text,
    redis_set_contains,
    replace_redis_set,
)
from app.api.auth.services.email_identity import canonical_email_domain
from app.core.background_tasks import PeriodicBackgroundTask
from app.core.clients.http import create_http_client
from app.core.config import Environment, settings
from app.core.env import BACKEND_DIR

if TYPE_CHECKING:
    from pathlib import Path

    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

DISPOSABLE_DOMAINS_URL = "https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt"
DISPOSABLE_DOMAINS_FALLBACK_PATH = BACKEND_DIR / "app" / "api" / "auth" / "resources" / "disposable_email_domains.txt"
REDIS_DISPOSABLE_DOMAINS_KEY = "auth:blocklists:email:disposable"

_RECOVERABLE_ERRORS = (RuntimeError, ValueError, ConnectionError, OSError, RedisError, HTTPError)


def load_local_disposable_domains(path: Path = DISPOSABLE_DOMAINS_FALLBACK_PATH) -> set[str]:
    """Load the committed fallback list of disposable email domains."""
    return load_blocklist_lines(path, str.lower)


class EmailChecker(PeriodicBackgroundTask):
    """Disposable-email blocker with optional Redis-backed domain storage."""

    def __init__(self, redis_client: Redis | None) -> None:
        super().__init__(interval_seconds=60 * 60 * 24)
        self.redis_client = redis_client
        self._domains: set[str] = set()
        self._initialized = False

    async def initialize(self) -> None:
        """Seed domains and start the periodic refresh loop."""
        try:
            await self._seed_domains()
            self._initialized = True
            await super().initialize()
        except _RECOVERABLE_ERRORS as e:
            logger.warning("Failed to initialize disposable email checker: %s", e)

    async def run_once(self) -> None:
        """Refresh disposable domains (called periodically by the base class loop)."""
        try:
            domains = await self._fetch_remote_domains()
            await self._store_domains(domains)
            logger.info("Disposable email domains refreshed successfully")
        except _RECOVERABLE_ERRORS:
            logger.exception("Failed to refresh disposable email domains:")

    async def close(self) -> None:
        """Cancel the background loop."""
        await super().close()
        self._initialized = False

    async def is_disposable(self, email: str) -> bool:
        """Check if an email's domain is disposable. Fails open on errors."""
        if not self._initialized:
            logger.warning("Email checker not initialized, allowing registration")
            return False
        try:
            domain = canonical_email_domain(email)
            if self.redis_client is not None:
                return await redis_set_contains(self.redis_client, REDIS_DISPOSABLE_DOMAINS_KEY, domain)
        except _RECOVERABLE_ERRORS:
            logger.exception("Failed to check if email is disposable. Allowing registration.")
            return False
        else:
            return domain in self._domains

    async def _seed_domains(self) -> None:
        """Seed from the committed fallback file, skipping if Redis already has data."""
        domains = load_local_disposable_domains()
        if self.redis_client is None:
            self._domains = domains
            logger.info("Loaded %d disposable domains from local fallback (in-memory)", len(domains))
            return

        if await self.redis_client.exists(REDIS_DISPOSABLE_DOMAINS_KEY):
            logger.info("Disposable domains already cached in Redis, skipping seed")
            return

        await self._store_domains(domains)
        logger.info("Seeded Redis with %d disposable domains from local fallback", len(domains))

    async def _store_domains(self, domains: set[str]) -> None:
        """Replace the stored domain set (in-memory or Redis)."""
        if self.redis_client is None:
            self._domains = domains
            return

        await replace_redis_set(self.redis_client, REDIS_DISPOSABLE_DOMAINS_KEY, domains)

    async def _fetch_remote_domains(self) -> set[str]:
        """Fetch the latest disposable domain list from the remote source."""
        async with create_http_client() as client:
            response = await client.get(DISPOSABLE_DOMAINS_URL, timeout=10.0)
            response.raise_for_status()
        return load_blocklist_text(response.text, str.lower)


async def init_email_checker(redis: Redis | None) -> EmailChecker | None:
    """Initialize the EmailChecker instance."""
    if settings.environment in (Environment.DEV, Environment.TESTING):
        return None
    try:
        checker = EmailChecker(redis)
        await checker.initialize()
    except (RuntimeError, ValueError, ConnectionError) as e:
        logger.warning("Failed to initialize email checker: %s", e)
        return None
    else:
        return checker
