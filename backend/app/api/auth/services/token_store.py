"""Redis-backed helpers for short-lived auth token state."""

from __future__ import annotations

import hashlib
import json
import secrets
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable

    from redis.asyncio import Redis


def token_fingerprint(token: str) -> str:
    """Return a stable non-secret fingerprint for auth-token storage keys."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_key(key_prefix: str, token: str) -> str:
    """Return the Redis key for a token under ``key_prefix``."""
    return f"{key_prefix}:{token_fingerprint(token)}"


def new_token(token_bytes: int) -> str:
    """Generate a URL-safe bearer token."""
    return secrets.token_urlsafe(token_bytes)


def encode_token_metadata(payload: dict[str, object]) -> str:
    """Encode token metadata as compact JSON."""
    return json.dumps(payload, separators=(",", ":"))


def decode_token_metadata[ErrorT: Exception](
    raw_value: bytes | str | None,
    *,
    error_cls: Callable[[], ErrorT],
) -> dict[str, object]:
    """Decode token metadata or raise the caller's public auth error."""
    if raw_value is None:
        raise error_cls()
    try:
        payload = json.loads(raw_value.decode("utf-8") if isinstance(raw_value, bytes) else raw_value)
    except (TypeError, json.JSONDecodeError) as err:
        raise error_cls() from err
    if not isinstance(payload, dict):
        raise error_cls()
    return dict(payload)


async def store_token_metadata(
    redis: Redis,
    *,
    key_prefix: str,
    token: str,
    payload: dict[str, object],
    ttl_seconds: int,
) -> str:
    """Store metadata for an existing token and return its Redis key."""
    key = token_key(key_prefix, token)
    await redis.setex(key, ttl_seconds, encode_token_metadata(payload))
    return key


async def store_new_token(
    redis: Redis,
    *,
    key_prefix: str,
    payload: dict[str, object],
    ttl_seconds: int,
    token_bytes: int,
) -> str:
    """Generate a token, store metadata for it, and return the raw token."""
    token = new_token(token_bytes)
    await store_token_metadata(
        redis,
        key_prefix=key_prefix,
        token=token,
        payload=payload,
        ttl_seconds=ttl_seconds,
    )
    return token


async def read_token_metadata[ErrorT: Exception](
    redis: Redis,
    *,
    key_prefix: str,
    token: str,
    error_cls: Callable[[], ErrorT],
    consume: bool = False,
) -> dict[str, object]:
    """Read token metadata, optionally consuming it atomically with GETDEL."""
    key = token_key(key_prefix, token)
    raw_value = await redis.getdel(key) if consume else await redis.get(key)
    return decode_token_metadata(raw_value, error_cls=error_cls)
