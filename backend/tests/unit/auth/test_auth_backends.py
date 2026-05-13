"""Unit tests for authentication backend token policy."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi_users.authentication import JWTStrategy, RedisStrategy
from fastapi_users.jwt import generate_jwt

from app.api.auth.services import auth_backends
from app.api.auth.services.auth_backends import AUTH_JWT_ALGORITHM, AUTH_TOKEN_AUDIENCE, get_token_strategy
from app.api.common.exceptions import ServiceUnavailableError
from app.core.config import Environment


def test_dev_jwt_fallback_uses_explicit_algorithm_and_audience(monkeypatch: pytest.MonkeyPatch) -> None:
    """The dev/test JWT fallback should pin the auth-token algorithm and audience."""
    monkeypatch.setattr(auth_backends.core_settings, "environment", Environment.TESTING)

    strategy = get_token_strategy(None)

    assert isinstance(strategy, JWTStrategy)
    assert strategy.algorithm == AUTH_JWT_ALGORITHM
    assert strategy.token_audience == [AUTH_TOKEN_AUDIENCE]


async def test_jwt_strategy_rejects_wrong_audience(monkeypatch: pytest.MonkeyPatch) -> None:
    """A self-contained auth JWT for another audience must not authenticate."""
    monkeypatch.setattr(auth_backends.core_settings, "environment", Environment.TESTING)
    strategy = get_token_strategy(None)
    token = generate_jwt(
        {"sub": "user-id", "aud": ["other-service"]},
        auth_backends.SECRET.get_secret_value(),
        lifetime_seconds=60,
        algorithm=AUTH_JWT_ALGORITHM,
    )
    user_manager = MagicMock()
    user_manager.parse_id.return_value = "user-id"
    user_manager.get.side_effect = AssertionError("wrong-audience token must not load a user")

    assert await strategy.read_token(token, user_manager) is None


def test_redis_strategy_remains_preferred_when_available() -> None:
    """Opaque Redis tokens should remain the normal strategy whenever Redis is available."""
    redis = MagicMock()

    strategy = get_token_strategy(redis)

    assert isinstance(strategy, RedisStrategy)


def test_missing_redis_fails_closed_outside_dev_and_test(monkeypatch: pytest.MonkeyPatch) -> None:
    """Production-like environments should not fall back to self-contained access tokens."""
    monkeypatch.setattr(auth_backends.core_settings, "environment", Environment.STAGING)

    with pytest.raises(ServiceUnavailableError):
        get_token_strategy(None)
