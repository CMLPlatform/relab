"""Shared helpers for auth blocklist resources and Redis set caches."""

from typing import TYPE_CHECKING, cast

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Iterable
    from pathlib import Path

    from redis.asyncio import Redis


def load_blocklist_lines(path: Path, normalize: Callable[[str], str]) -> set[str]:
    """Load non-comment blocklist lines from a committed fallback resource."""
    return load_blocklist_text(path.read_text(encoding="utf-8"), normalize)


def load_blocklist_text(raw_text: str, normalize: Callable[[str], str]) -> set[str]:
    """Load non-comment blocklist lines from raw text."""
    return {
        normalized
        for line in raw_text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
        if (normalized := normalize(line.strip()))
    }


async def redis_set_contains(redis: Redis, key: str, member: str) -> bool:
    """Return whether a Redis set contains a member."""
    # Not app.core.redis.redis_bool: core.redis -> core.runtime -> auth services -> here
    # would be an import cycle.
    return bool(await cast("Awaitable[int]", redis.sismember(key, member)))


async def redis_set_contains_any(redis: Redis, key: str, members: Iterable[str]) -> bool:
    """Return whether a Redis set contains any supplied member."""
    for member in members:
        if await redis_set_contains(redis, key, member):
            return True
    return False


async def replace_redis_set(redis: Redis, key: str, members: Iterable[str]) -> None:
    """Replace a Redis set with the supplied members."""
    member_set = set(members)
    pipe = redis.pipeline()
    pipe.delete(key)
    if member_set:
        pipe.sadd(key, *member_set)
    await pipe.execute()
