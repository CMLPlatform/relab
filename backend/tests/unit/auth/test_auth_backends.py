"""Unit tests for authentication backend token policy."""

from __future__ import annotations

from unittest.mock import MagicMock

from fastapi_users.authentication import RedisStrategy

from app.api.auth.services.auth_backends import get_token_strategy


def test_redis_strategy_is_returned() -> None:
    """Opaque Redis tokens are the auth strategy."""
    redis = MagicMock()

    strategy = get_token_strategy(redis)

    assert isinstance(strategy, RedisStrategy)
