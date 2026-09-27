"""Revocable opaque access tokens.

fastapi-users' :class:`RedisStrategy` stores no issue time, so a global revocation
(log out all devices, password reset, deactivation, refresh-token reuse) cannot reach
already-issued access tokens (ASVS V7.4.1, V7.4.2).

Each token is stamped with its issue time and refused when issued before the user's
revocation epoch. The epoch lives in Redis, not the user row: losing Redis loses the
tokens too (fail closed), and the refresh-reuse path can revoke without a DB session.
"""

import json
import secrets
import time
from typing import TYPE_CHECKING, Any

from fastapi import Request
from fastapi.security.utils import get_authorization_scheme_param
from fastapi_users import exceptions, models
from fastapi_users.authentication.strategy.redis import RedisStrategy
from pydantic import UUID4

from app.api.auth.config import settings as auth_settings
from app.core.http_headers import AUTH_COOKIE_NAME
from app.core.runtime import get_connection_services

if TYPE_CHECKING:
    from fastapi_users.manager import BaseUserManager

    from app.core.redis import Redis

# Pinned rather than inherited from upstream's default, so a fastapi-users bump cannot
# silently orphan tokens written under the old prefix.
ACCESS_TOKEN_KEY_PREFIX = "fastapi_users_token:"  # noqa: S105 # Redis key prefix, not a credential
_REVOKED_BEFORE_KEY_PREFIX = "auth:at:revoked-before:"
_BEARER_SCHEME = "bearer"


def _revoked_before_key(user_id: UUID4 | str) -> str:
    return f"{_REVOKED_BEFORE_KEY_PREFIX}{user_id}"


class RevocableRedisStrategy(RedisStrategy[models.UP, models.ID]):
    """``RedisStrategy`` whose tokens carry an issue time and honour a revocation epoch."""

    async def write_token(self, user: models.UP) -> str:
        """Issue a token stamped with its issue time.

        Deliberately not ``super().write_token`` plus an overwrite: that would write the
        key twice per login and leave a brief window holding the un-stamped value.
        """
        token = secrets.token_urlsafe()
        payload = json.dumps({"sub": str(user.id), "iat": time.time()})
        await self.redis.set(f"{self.key_prefix}{token}", payload, ex=self.lifetime_seconds)
        return token

    async def read_token(
        self, token: str | None, user_manager: BaseUserManager[models.UP, models.ID]
    ) -> models.UP | None:
        """Resolve a token to its user, refusing tokens issued before the revocation epoch."""
        if token is None:
            return None

        stored = await self.redis.get(f"{self.key_prefix}{token}")
        if stored is None:
            return None

        user_id, issued_at = _parse_stored_token(stored)
        if user_id is None:
            return None

        if issued_at is not None and await _is_revoked(self.redis, user_id, issued_at):
            return None

        try:
            parsed_id = user_manager.parse_id(user_id)
            return await user_manager.get(parsed_id)
        except exceptions.UserNotExists, exceptions.InvalidID:
            return None


async def request_access_token_owner_id(request: Request) -> str | None:
    """Return the user id the request's bearer or session-cookie access token was issued to.

    For rate-limit bucketing only: one Redis GET, no user load and no revocation check.
    Only a token this server issued resolves, so a forged one cannot pick a bucket.
    Never use this to authorize a request.
    """
    scheme, token = get_authorization_scheme_param(request.headers.get("authorization"))
    if scheme.lower() != _BEARER_SCHEME or not token:
        token = request.cookies.get(AUTH_COOKIE_NAME)
    redis = get_connection_services(request).redis
    if not token or redis is None:
        return None
    stored = await redis.get(f"{ACCESS_TOKEN_KEY_PREFIX}{token}")
    return None if stored is None else _parse_stored_token(stored)[0]


def _parse_stored_token(stored: Any) -> tuple[str | None, float | None]:  # noqa: ANN401 - redis returns str|bytes
    """Return ``(user_id, issued_at)`` for a stored token value.

    Tokens written before this module existed hold a bare user id with no issue time.
    They are still honoured (refusing them would log every active user out on deploy),
    but they cannot be epoch-checked, so a revocation does not reach them. They age out
    within one access-token lifetime, so the gap closes on its own shortly after rollout.
    """
    raw = stored.decode() if isinstance(stored, bytes) else str(stored)
    try:
        payload = json.loads(raw)
    except TypeError, ValueError:
        return raw, None
    if not isinstance(payload, dict):
        return raw, None
    user_id = payload.get("sub")
    issued_at = payload.get("iat")
    return (
        str(user_id) if user_id is not None else None,
        float(issued_at) if isinstance(issued_at, (int, float)) else None,
    )


async def _is_revoked(redis: Redis, user_id: str, issued_at: float) -> bool:
    """Return whether *issued_at* predates the user's revocation epoch."""
    revoked_before = await redis.get(_revoked_before_key(user_id))
    if revoked_before is None:
        return False
    raw = revoked_before.decode() if isinstance(revoked_before, bytes) else str(revoked_before)
    try:
        return issued_at < float(raw)
    except ValueError:
        return False


async def revoke_user_access_tokens(redis: Redis, user_id: UUID4) -> None:
    """Refuse every access token issued for *user_id* up to now.

    O(1) and free of the enumerate-then-delete race a token index would have: any token
    already issued fails its epoch check on the next request, whether or not it was
    recorded anywhere.
    """
    # The epoch only has to outlive the tokens it invalidates; anything older than one
    # access-token lifetime has already expired on its own. The slack absorbs clock skew.
    await redis.set(
        _revoked_before_key(user_id),
        repr(time.time()),
        ex=auth_settings.access_token_ttl_seconds + 60,
    )
