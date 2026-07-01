"""Refresh token service for managing long-lived authentication tokens.

Redis is required for refresh-token storage so auth fails closed when token
state is unavailable.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from pydantic import UUID4

from app.api.auth.config import settings
from app.api.auth.exceptions import RefreshTokenInvalidError, RefreshTokenRevokedError
from app.api.auth.services.token_store import (
    new_token,
    read_token_metadata,
    store_token_metadata,
    token_fingerprint,
    token_key,
)
from app.core.constants import HOUR
from app.core.redis import redis_int, redis_str_set

if TYPE_CHECKING:
    from redis.asyncio import Redis


_USER_TOKENS_KEY_PREFIX = "auth:rt:user:"
_REFRESH_TOKEN_KEY_PREFIX = "auth:rt"  # noqa: S105 - Redis key prefix, not a secret.
_REFRESH_TOKEN_BLACKLIST_KEY_PREFIX = "auth:rt_blacklist"  # noqa: S105 - Redis key prefix, not a secret.
_REFRESH_TOKEN_BYTES = 48
_REFRESH_TOKEN_MIN_LENGTH = 32
_REFRESH_TOKEN_PATTERN = re.compile(rf"^[A-Za-z0-9_-]{{{_REFRESH_TOKEN_MIN_LENGTH},}}$")


def _refresh_token_key_from_fingerprint(fingerprint: str) -> str:
    return f"{_REFRESH_TOKEN_KEY_PREFIX}:{fingerprint}"


def _blacklist_key_from_fingerprint(fingerprint: str) -> str:
    return f"{_REFRESH_TOKEN_BLACKLIST_KEY_PREFIX}:{fingerprint}"


def _refresh_token_key(token: str) -> str:
    return token_key(_REFRESH_TOKEN_KEY_PREFIX, token)


def _blacklist_key(token: str) -> str:
    return token_key(_REFRESH_TOKEN_BLACKLIST_KEY_PREFIX, token)


def _user_tokens_key(user_id: UUID | UUID4 | str) -> str:
    return f"{_USER_TOKENS_KEY_PREFIX}{user_id}"


def _refresh_token_ttl_seconds() -> int:
    return settings.refresh_token_expire_days * 86_400


def _absolute_session_ttl_seconds() -> int:
    return settings.refresh_session_absolute_expire_days * 86_400


def _validate_refresh_token_shape(token: str) -> None:
    if not _REFRESH_TOKEN_PATTERN.fullmatch(token):
        raise RefreshTokenInvalidError


@dataclass(frozen=True, slots=True)
class RefreshTokenMetadata:
    """Validated refresh-token metadata persisted in Redis."""

    user_id: UUID
    absolute_expires_at: int

    @classmethod
    def new(cls, user_id: UUID, *, absolute_expires_at: int | None = None) -> RefreshTokenMetadata:
        """Build metadata for a new refresh token or a rotation."""
        return cls(
            user_id=user_id,
            absolute_expires_at=absolute_expires_at or int(time.time()) + _absolute_session_ttl_seconds(),
        )

    @classmethod
    def from_payload(cls, payload: dict[str, object]) -> RefreshTokenMetadata:
        """Validate Redis payload data as refresh-token metadata."""
        try:
            return cls(
                user_id=UUID(str(payload["user_id"])),
                absolute_expires_at=int(payload["absolute_expires_at"]),
            )
        except (KeyError, TypeError, ValueError) as err:
            raise RefreshTokenInvalidError from err

    def to_payload(self) -> dict[str, str | int]:
        """Serialize metadata for Redis JSON storage."""
        return {
            "user_id": str(self.user_id),
            "absolute_expires_at": self.absolute_expires_at,
        }

    def ttl_seconds(self) -> int:
        """Return the Redis TTL constrained by sliding and absolute expiry."""
        remaining_absolute_ttl = self.absolute_expires_at - int(time.time())
        return min(_refresh_token_ttl_seconds(), remaining_absolute_ttl)


async def _load_active_token_metadata(redis: Redis, token: str) -> RefreshTokenMetadata:
    _validate_refresh_token_shape(token)

    if await redis.exists(_blacklist_key(token)):
        raise RefreshTokenRevokedError
    metadata = RefreshTokenMetadata.from_payload(
        await read_token_metadata(
            redis,
            key_prefix=_REFRESH_TOKEN_KEY_PREFIX,
            token=token,
            error_cls=RefreshTokenInvalidError,
        )
    )

    if metadata.absolute_expires_at <= int(time.time()):
        await blacklist_token(redis, token)
        raise RefreshTokenInvalidError
    return metadata


async def _blacklist_fingerprint(redis: Redis, fingerprint: str, ttl_seconds: int, *, value: str = "1") -> None:
    # value carries the owning user_id when known, so a replayed (already-rotated)
    # token can be traced back to its session family for reuse detection.
    await redis.setex(_blacklist_key_from_fingerprint(fingerprint), ttl_seconds, value)


def _blacklist_user_id(raw: bytes | str) -> UUID | None:
    """Recover the user_id stored in a blacklist entry, if any."""
    value = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)
    try:
        return UUID(value)
    except ValueError:
        return None


async def create_refresh_token(
    redis: Redis,
    user_id: UUID4,
    *,
    absolute_expires_at: int | None = None,
) -> str:
    """Create a new refresh token.

    Args:
        redis: Redis client
        user_id: User's UUID
        absolute_expires_at: Existing absolute session expiry timestamp to preserve during rotation

    Returns:
        Refresh token string
    """
    token = new_token(_REFRESH_TOKEN_BYTES)
    metadata = RefreshTokenMetadata.new(
        user_id,
        absolute_expires_at=absolute_expires_at,
    )
    ttl = metadata.ttl_seconds()
    if ttl <= 0:
        raise RefreshTokenInvalidError

    fingerprint = token_fingerprint(token)
    user_tokens_key = _user_tokens_key(user_id)
    await store_token_metadata(
        redis,
        key_prefix=_REFRESH_TOKEN_KEY_PREFIX,
        token=token,
        payload=metadata.to_payload(),
        ttl_seconds=ttl,
    )
    await redis_int(redis.sadd(user_tokens_key, fingerprint))
    await redis.expire(user_tokens_key, ttl)
    return token


async def verify_refresh_token(
    redis: Redis,
    token: str,
) -> UUID:
    """Verify a refresh token and return the user ID.

    Args:
        redis: Redis client
        token: Refresh token to verify

    Returns:
        UUID of the user

    Raises:
        RefreshTokenError: If token is invalid, expired, or blacklisted
    """
    metadata = await _load_active_token_metadata(redis, token)
    return metadata.user_id


async def blacklist_token(
    redis: Redis,
    token: str,
    ttl_seconds: int | None = None,
) -> None:
    """Blacklist a refresh token and delete it.

    Args:
        redis: Redis client
        token: Refresh token to blacklist
        ttl_seconds: TTL for blacklist entry (if None, uses remaining token TTL)
    """
    metadata_key = _refresh_token_key(token)
    if ttl_seconds is None:
        ttl_seconds = int(await redis.ttl(metadata_key))
        if ttl_seconds <= 0:
            ttl_seconds = HOUR

    try:
        metadata = RefreshTokenMetadata.from_payload(
            await read_token_metadata(
                redis,
                key_prefix=_REFRESH_TOKEN_KEY_PREFIX,
                token=token,
                error_cls=RefreshTokenInvalidError,
                consume=True,
            )
        )
    except RefreshTokenInvalidError:
        metadata = None

    fingerprint = token_fingerprint(token)
    await _blacklist_fingerprint(
        redis,
        fingerprint,
        ttl_seconds,
        value=str(metadata.user_id) if metadata else "1",
    )

    if metadata:
        user_tokens_key = _user_tokens_key(metadata.user_id)
        await redis_int(redis.srem(user_tokens_key, fingerprint))


async def revoke_all_user_tokens(
    redis: Redis,
    user_id: UUID4,
) -> None:
    """Revoke all active refresh tokens for a user.

    Args:
        redis: Redis client
        user_id: User's UUID
    """
    user_tokens_key = _user_tokens_key(user_id)
    tokens = await redis_str_set(redis.smembers(user_tokens_key))
    for stored_token_id in tokens:
        stored_token_key = _refresh_token_key_from_fingerprint(stored_token_id)
        ttl_seconds = await redis.ttl(stored_token_key)
        if ttl_seconds <= 0:
            ttl_seconds = HOUR
        await _blacklist_fingerprint(redis, stored_token_id, ttl_seconds, value=str(user_id))
        await redis.delete(stored_token_key)
    await redis.delete(user_tokens_key)


async def rotate_refresh_token(
    redis: Redis,
    old_token: str,
) -> str:
    """Rotate a refresh token (create new, blacklist old).

    Args:
        redis: Redis client
        old_token: Old refresh token

    Returns:
        New refresh token

    Raises:
        RefreshTokenError: If old token is invalid or being replayed
    """
    _validate_refresh_token_shape(old_token)

    # Reuse detection: an old token that is already blacklisted is being replayed
    # (it was rotated or revoked before). Treat it as a stolen-token signal and
    # revoke the whole session family, then reject.
    blacklisted = await redis.get(_blacklist_key(old_token))
    if blacklisted is not None:
        user_id = _blacklist_user_id(blacklisted)
        if user_id is not None:
            await revoke_all_user_tokens(redis, user_id)
        raise RefreshTokenRevokedError

    # Atomically consume the old token's metadata so two concurrent rotations of
    # the same token cannot both succeed: only the GETDEL winner gets the payload.
    metadata = RefreshTokenMetadata.from_payload(
        await read_token_metadata(
            redis,
            key_prefix=_REFRESH_TOKEN_KEY_PREFIX,
            token=old_token,
            error_cls=RefreshTokenInvalidError,
            consume=True,
        )
    )

    fingerprint = token_fingerprint(old_token)
    blacklist_ttl = max(metadata.absolute_expires_at - int(time.time()), HOUR)
    await _blacklist_fingerprint(redis, fingerprint, blacklist_ttl, value=str(metadata.user_id))
    await redis_int(redis.srem(_user_tokens_key(metadata.user_id), fingerprint))

    if metadata.absolute_expires_at <= int(time.time()):
        raise RefreshTokenInvalidError

    return await create_refresh_token(
        redis,
        metadata.user_id,
        absolute_expires_at=metadata.absolute_expires_at,
    )
