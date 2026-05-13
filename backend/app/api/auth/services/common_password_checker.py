"""Common-password validation service for auth flows."""

from __future__ import annotations

import logging
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from typing import TYPE_CHECKING

from redis.exceptions import RedisError

from app.api.auth.services.blocklist_store import load_blocklist_lines, redis_set_contains_any, replace_redis_set
from app.core.env import BACKEND_DIR

if TYPE_CHECKING:
    from pathlib import Path

    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

COMMON_PASSWORDS_SOURCE_COMMIT = "2f5028ca9d95c9cd1a159c4f6e6f255f5a59d06d"
COMMON_PASSWORDS_SOURCE_URL = (
    "https://raw.githubusercontent.com/danielmiessler/SecLists/"
    f"{COMMON_PASSWORDS_SOURCE_COMMIT}/Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt"
)
COMMON_PASSWORDS_FALLBACK_PATH = BACKEND_DIR / "app" / "api" / "auth" / "resources" / "common_passwords_3000.txt"
COMMON_PASSWORDS_TARGET_COUNT = 3000
REDIS_COMMON_PASSWORDS_KEY = "auth:blocklists:password:common"

_RECOVERABLE_ERRORS = (RuntimeError, ValueError, ConnectionError, OSError, RedisError)
_EXACT_PREFIX = "exact:"
_COMPACT_PREFIX = "compact:"


@dataclass(frozen=True, slots=True)
class _CommonPasswordBlocklist:
    """Normalized common-password entries used for local fallback checks."""

    members: frozenset[str]
    entry_count: int

    def matches(self, password: str) -> bool:
        """Return whether a password matches the exact or compact common-password list."""
        return bool(_common_password_members(password) & self.members)


def normalize_common_password(value: str) -> str:
    """Normalize common-password values for policy comparisons."""
    return unicodedata.normalize("NFC", value).casefold()


def _compact_common_password(value: str) -> str:
    """Remove separators from a normalized common password."""
    return "".join(char for char in value if char.isalnum())


def _common_password_members(password: str) -> frozenset[str]:
    """Return Redis set members for a normalized common password."""
    normalized = normalize_common_password(password)
    members = {f"{_EXACT_PREFIX}{normalized}"}
    if compact := _compact_common_password(normalized):
        members.add(f"{_COMPACT_PREFIX}{compact}")
    return frozenset(members)


def _common_password_blocklist(entries: set[str]) -> _CommonPasswordBlocklist:
    return _CommonPasswordBlocklist(
        members=frozenset(member for entry in entries for member in _common_password_members(entry)),
        entry_count=len(entries),
    )


@lru_cache(maxsize=1)
def load_local_common_passwords(path: Path = COMMON_PASSWORDS_FALLBACK_PATH) -> _CommonPasswordBlocklist:
    """Load the committed fallback list of common passwords."""
    entries = load_blocklist_lines(path, normalize_common_password)
    passwords = _common_password_blocklist(entries)
    if passwords.entry_count < COMMON_PASSWORDS_TARGET_COUNT and path == COMMON_PASSWORDS_FALLBACK_PATH:
        msg = (
            f"Common-password fallback has {passwords.entry_count} entries, "
            f"expected at least {COMMON_PASSWORDS_TARGET_COUNT}"
        )
        raise ValueError(msg)
    return passwords


class CommonPasswordChecker:
    """Common-password blocker with optional Redis-backed set storage."""

    def __init__(self, redis_client: Redis | None) -> None:
        self.redis_client = redis_client
        self._passwords: _CommonPasswordBlocklist | None = None
        self._initialized = False

    async def initialize(self) -> None:
        """Seed the checker from the committed fallback file."""
        self._passwords = load_local_common_passwords()
        self._initialized = True
        if self.redis_client is None:
            logger.info("Loaded %d common passwords from local fallback (in-memory)", self._passwords.entry_count)
            return

        try:
            await self._store_passwords(self._passwords)
            logger.info("Seeded Redis with %d common passwords from local fallback", self._passwords.entry_count)
        except _RECOVERABLE_ERRORS:
            logger.exception("Failed to seed common-password Redis cache; using local fallback")

    async def matches(self, password: str) -> bool:
        """Return whether a password matches the ASVS common-password list."""
        passwords = self._passwords or load_local_common_passwords()
        if not self._initialized:
            logger.warning("Common-password checker not initialized; using local fallback")

        members = _common_password_members(password)
        if self.redis_client is not None and self._initialized:
            try:
                return await redis_set_contains_any(self.redis_client, REDIS_COMMON_PASSWORDS_KEY, members)
            except _RECOVERABLE_ERRORS:
                logger.exception("Failed to check common password in Redis; using local fallback")
        return passwords.matches(password)

    async def _store_passwords(self, passwords: _CommonPasswordBlocklist) -> None:
        """Replace the Redis password sets."""
        if self.redis_client is None:
            return

        await replace_redis_set(
            self.redis_client,
            REDIS_COMMON_PASSWORDS_KEY,
            passwords.members,
        )


async def init_common_password_checker(redis: Redis | None) -> CommonPasswordChecker | None:
    """Initialize the CommonPasswordChecker instance."""
    try:
        checker = CommonPasswordChecker(redis)
        await checker.initialize()
    except _RECOVERABLE_ERRORS as e:
        logger.warning("Failed to initialize common-password checker: %s", e)
        return None
    else:
        return checker
