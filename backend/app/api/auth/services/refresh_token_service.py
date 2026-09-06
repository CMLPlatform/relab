"""Refresh token service for managing long-lived authentication tokens.

Redis is required for refresh-token storage so auth fails closed when token
state is unavailable.
"""

import re
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, NoReturn
from uuid import UUID

from pydantic import UUID4

from app.api.auth.config import settings
from app.api.auth.exceptions import RefreshTokenInvalidError, RefreshTokenRevokedError
from app.api.auth.services.access_token_store import revoke_user_access_tokens
from app.api.auth.services.token_store import (
    new_token,
    read_token_metadata,
    store_token_metadata,
    token_fingerprint,
    token_key,
)
from app.api.common.audit import AuditAction, AuditContext, audit_event
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

# A blacklisted token replayed within this window of its rotation is a benign client retry
# (dropped rotation response); later replays are stolen-token reuse (RFC 9700 s4.14.2) and
# revoke the session family. Must exceed the app's DEFAULT_API_TIMEOUT_MS = 15s
# (app/src/services/api/request.ts), which retries the same token after a timeout.
# NOTE: sender-constrained refresh tokens (DPoP, RFC 9449) would let this drop to zero.
_REUSE_GRACE_SECONDS = 30

# Bounds the revocation sweep so a client rotating in a tight loop cannot keep it spinning.
_REVOKE_SWEEP_LIMIT = 3


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
        return min(settings.refresh_token_ttl_seconds, remaining_absolute_ttl)


async def _load_active_token_metadata(redis: Redis, token: str) -> RefreshTokenMetadata:
    _validate_refresh_token_shape(token)

    blacklisted = await redis.get(_blacklist_key(token))
    if blacklisted is not None:
        await _reject_replayed_token(redis, blacklisted)
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
    # value carries the owning user_id when known, so a replay can be traced to its session family.
    await redis.setex(_blacklist_key_from_fingerprint(fingerprint), ttl_seconds, value)


def _encode_blacklist_value(user_id: UUID) -> str:
    """Encode a blacklist entry: owning user_id plus the rotation timestamp."""
    return f"{user_id}:{int(time.time())}"


def _decode_blacklist_value(raw: bytes | str) -> tuple[UUID | None, int | None]:
    """Recover the user_id and rotation timestamp stored in a blacklist entry, if any."""
    value = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)
    user_part, _, ts_part = value.partition(":")
    try:
        user_id = UUID(user_part)
    except ValueError:
        return None, None
    try:
        rotated_at = int(ts_part)
    except ValueError:
        rotated_at = None
    return user_id, rotated_at


async def _reject_replayed_token(redis: Redis, blacklisted: bytes | str) -> NoReturn:
    """Handle a replay of an already-blacklisted refresh token, then reject it.

    A replay within ``_REUSE_GRACE_SECONDS`` of the token's rotation is a benign client
    retry: reject without revoking the family. A later replay is reuse and revokes every
    live token for the user. Every path that reads the blacklist must call this.
    """
    user_id, rotated_at = _decode_blacklist_value(blacklisted)
    just_rotated = rotated_at is not None and int(time.time()) - rotated_at <= _REUSE_GRACE_SECONDS
    if just_rotated:
        # A thief replaying inside the window looks like a benign retry, so audit it.
        audit_event(
            user_id,
            AuditAction.AUTHORIZATION_DENIED,
            "refresh_token",
            user_id,
            context=AuditContext(outcome="denied", reason="refresh_token_replay_within_grace"),
        )
    elif user_id is not None:
        await revoke_all_user_tokens(redis, user_id)
        audit_event(
            user_id,
            AuditAction.SESSIONS_REVOKED,
            "refresh_token",
            user_id,
            context=AuditContext(outcome="denied", reason="refresh_token_reuse_detected"),
        )
    raise RefreshTokenRevokedError


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
    # gt=True only ever extends the set's TTL, so a short-lived token near absolute expiry
    # cannot cut short live siblings. GT is a no-op on a key with no TTL yet, so the first
    # token falls back to nx=True.
    if not await redis_int(redis.expire(user_tokens_key, ttl, gt=True)):
        await redis.expire(user_tokens_key, ttl, nx=True)
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
        value=_encode_blacklist_value(metadata.user_id) if metadata else "1",
    )

    if metadata:
        user_tokens_key = _user_tokens_key(metadata.user_id)
        await redis_int(redis.srem(user_tokens_key, fingerprint))


async def revoke_all_user_tokens(
    redis: Redis,
    user_id: UUID4,
) -> None:
    """Revoke every active token for a user, refresh and access alike.

    Order matters: refresh state is purged first, so a concurrent rotation can no longer
    succeed and mint a fresh access token after the access epoch is stamped. Reversing
    these two leaves a racing refresh holding a token valid for its full lifetime.

    Args:
        redis: Redis client
        user_id: User's UUID
    """
    user_tokens_key = _user_tokens_key(user_id)
    # Read-then-delete is not atomic: a rotation landing in between adds a fingerprint
    # this pass never saw. Re-sweep until a pass finds nothing.
    for _ in range(_REVOKE_SWEEP_LIMIT):
        if not await _revoke_refresh_token_sweep(redis, user_id, user_tokens_key):
            break

    await revoke_user_access_tokens(redis, user_id)


async def _revoke_refresh_token_sweep(redis: Redis, user_id: UUID4, user_tokens_key: str) -> bool:
    """Blacklist and delete every refresh token currently in the user's set.

    Returns whether any token was found, so the caller can sweep again for tokens added
    while this pass ran.
    """
    fingerprints = sorted(await redis_str_set(redis.smembers(user_tokens_key)))
    if not fingerprints:
        await redis.delete(user_tokens_key)
        return False

    # Two pipelines instead of 3N round-trips.
    ttl_pipe = redis.pipeline()
    for fingerprint in fingerprints:
        ttl_pipe.ttl(_refresh_token_key_from_fingerprint(fingerprint))
    ttls = await ttl_pipe.execute()

    value = _encode_blacklist_value(user_id)
    write_pipe = redis.pipeline()
    for fingerprint, ttl_seconds in zip(fingerprints, ttls, strict=True):
        write_pipe.setex(_blacklist_key_from_fingerprint(fingerprint), ttl_seconds if ttl_seconds > 0 else HOUR, value)
        write_pipe.delete(_refresh_token_key_from_fingerprint(fingerprint))
    # SREM only what this pass handled; a fingerprint added by a concurrent rotation
    # must survive for the next sweep.
    write_pipe.srem(user_tokens_key, *fingerprints)
    await write_pipe.execute()
    return True


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

    # verify_refresh_token already checked the blacklist; re-check so a logout or
    # revoke-all landing in between still trips reuse detection.
    blacklisted = await redis.get(_blacklist_key(old_token))
    if blacklisted is not None:
        await _reject_replayed_token(redis, blacklisted)

    # GETDEL: only one of two concurrent rotations of the same token gets the payload.
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
    await _blacklist_fingerprint(redis, fingerprint, blacklist_ttl, value=_encode_blacklist_value(metadata.user_id))
    await redis_int(redis.srem(_user_tokens_key(metadata.user_id), fingerprint))

    if metadata.absolute_expires_at <= int(time.time()):
        raise RefreshTokenInvalidError

    return await create_refresh_token(
        redis,
        metadata.user_id,
        absolute_expires_at=metadata.absolute_expires_at,
    )
