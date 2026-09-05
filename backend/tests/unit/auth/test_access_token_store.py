"""Tests for revocable opaque access tokens."""

import uuid
from unittest.mock import AsyncMock, MagicMock

from app.api.auth.services.access_token_store import (
    ACCESS_TOKEN_KEY_PREFIX,
    RevocableRedisStrategy,
    revoke_user_access_tokens,
)
from app.core.redis import Redis

ACCESS_TOKEN_TTL = 900


def _strategy(redis: Redis) -> RevocableRedisStrategy:
    return RevocableRedisStrategy(redis, lifetime_seconds=ACCESS_TOKEN_TTL, key_prefix=ACCESS_TOKEN_KEY_PREFIX)


def _user(user_id: uuid.UUID) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    return user


def _user_manager(user: MagicMock) -> MagicMock:
    manager = MagicMock()
    manager.parse_id = lambda value: value
    manager.get = AsyncMock(return_value=user)
    return manager


async def test_revocation_invalidates_access_tokens_on_every_device(redis_client: Redis) -> None:
    """Revoking a user must refuse access tokens already issued to other devices.

    Regression for the core gap: upstream's RedisStrategy keeps no user -> token index,
    so "log out all devices" reached only refresh tokens and every live access token
    stayed usable for the rest of its 15-minute lifetime (ASVS V7.4.1/V7.4.2).
    """
    user_id = uuid.uuid4()
    user = _user(user_id)
    manager = _user_manager(user)
    strategy = _strategy(redis_client)

    device_a = await strategy.write_token(user)
    device_b = await strategy.write_token(user)
    assert await strategy.read_token(device_a, manager) is not None
    assert await strategy.read_token(device_b, manager) is not None

    await revoke_user_access_tokens(redis_client, user_id)

    assert await strategy.read_token(device_a, manager) is None
    assert await strategy.read_token(device_b, manager) is None


async def test_login_after_revocation_is_accepted(redis_client: Redis) -> None:
    """The epoch must not lock the user out of signing in again."""
    user_id = uuid.uuid4()
    user = _user(user_id)
    manager = _user_manager(user)
    strategy = _strategy(redis_client)

    await revoke_user_access_tokens(redis_client, user_id)
    fresh = await strategy.write_token(user)

    assert await strategy.read_token(fresh, manager) is not None


async def test_revocation_is_scoped_to_one_user(redis_client: Redis) -> None:
    """One user's revocation must not sign anyone else out."""
    revoked_id, other_id = uuid.uuid4(), uuid.uuid4()
    other = _user(other_id)
    strategy = _strategy(redis_client)
    other_token = await strategy.write_token(other)

    await revoke_user_access_tokens(redis_client, revoked_id)

    assert await strategy.read_token(other_token, _user_manager(other)) is not None


async def test_tokens_written_before_this_change_still_authenticate(redis_client: Redis) -> None:
    """A token stored in the pre-existing bare-user-id format is still honoured.

    Refusing them would sign every active user out the moment this deploys. They carry no
    issue time, so a revocation cannot reach them — they age out within one access-token
    lifetime, which closes the gap shortly after rollout.
    """
    user_id = uuid.uuid4()
    user = _user(user_id)
    strategy = _strategy(redis_client)
    await redis_client.set(f"{ACCESS_TOKEN_KEY_PREFIX}legacy-token", str(user_id), ex=ACCESS_TOKEN_TTL)

    assert await strategy.read_token("legacy-token", _user_manager(user)) is not None


async def test_unknown_token_is_rejected(redis_client: Redis) -> None:
    """An unknown token resolves to no user."""
    strategy = _strategy(redis_client)

    assert await strategy.read_token("not-a-real-token", _user_manager(_user(uuid.uuid4()))) is None


async def test_write_token_stores_the_issue_time(redis_client: Redis) -> None:
    """The stored value must carry the issue time the epoch check compares against."""
    user = _user(uuid.uuid4())
    strategy = _strategy(redis_client)

    token = await strategy.write_token(user)

    stored = await redis_client.get(f"{ACCESS_TOKEN_KEY_PREFIX}{token}")
    raw = stored.decode() if isinstance(stored, bytes) else str(stored)
    assert '"iat"' in raw
    assert str(user.id) in raw
