"""Unit tests for TOTP MFA helpers."""

from __future__ import annotations

import base64
import json
import time
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest

from app.api.auth.exceptions import MfaChallengeInvalidError
from app.api.auth.services import mfa_service
from app.api.auth.services.rate_limiter import RateLimitExceededError, rate_limit_bucket_key

if TYPE_CHECKING:
    from pytest_mock import MockerFixture
    from redis.asyncio import Redis


def test_totp_code_uses_server_time_and_expected_rfc_vector() -> None:
    """TOTP generation should match the RFC 6238 SHA-1 test vector."""
    secret = base64.b32encode(b"12345678901234567890").decode("ascii").rstrip("=")

    code = mfa_service.generate_totp_code(secret, for_time=59)

    assert code == "287082"


async def test_verify_totp_code_once_accepts_current_server_window(redis_client: Redis) -> None:
    """The verifier should accept and record a valid current-window TOTP code."""
    secret = mfa_service.generate_totp_secret()
    user_id = uuid4()
    now = int(time.time())
    code = mfa_service.generate_totp_code(secret, for_time=now)

    assert await mfa_service.verify_totp_code_once(
        redis_client,
        user_id=user_id,
        secret=secret,
        code=code,
        for_time=now,
    )


async def test_mfa_challenge_token_is_one_time(redis_client: Redis) -> None:
    """MFA challenge tokens must be consumed only once."""
    user_id = uuid4()
    token = await mfa_service.create_login_challenge(redis_client, user_id=user_id, transport="bearer")

    first = await mfa_service.consume_login_challenge(redis_client, token)

    assert first.user_id == user_id
    assert first.transport == "bearer"
    with pytest.raises(MfaChallengeInvalidError):
        await mfa_service.consume_login_challenge(redis_client, token)


async def test_mfa_challenge_token_can_be_read_before_setup_confirmation(redis_client: Redis) -> None:
    """Starting TOTP setup should not consume the login challenge."""
    user_id = uuid4()
    token = await mfa_service.create_login_challenge(redis_client, user_id=user_id, transport="bearer")

    first = await mfa_service.get_login_challenge(redis_client, token)
    second = await mfa_service.get_login_challenge(redis_client, token)

    assert first.user_id == user_id
    assert second.user_id == user_id
    consumed = await mfa_service.consume_login_challenge(redis_client, token)
    assert consumed.user_id == user_id


async def test_mfa_challenge_consume_uses_atomic_redis_getdel(mocker: MockerFixture) -> None:
    """Consumed MFA tokens should use Redis GETDEL rather than separate get/delete calls."""
    user_id = uuid4()
    token = "login-token"
    metadata = json.dumps({"user_id": str(user_id), "transport": "bearer"})
    redis = mocker.AsyncMock()
    redis.getdel.return_value = metadata

    challenge = await mfa_service.consume_login_challenge(redis, token)

    assert challenge.user_id == user_id
    assert challenge.transport == "bearer"
    redis.getdel.assert_awaited_once_with(f"auth:mfa:login-challenge:{mfa_service.token_fingerprint(token)}")
    redis.delete.assert_not_called()


async def test_oauth_mfa_handoff_is_one_time(redis_client: Redis) -> None:
    """OAuth MFA handoff tokens should reveal pending MFA state only once."""
    handoff = await mfa_service.create_oauth_handoff(
        redis_client,
        mfa_token="mfa-token",
    )

    mfa_token = await mfa_service.consume_oauth_handoff(redis_client, handoff)

    assert mfa_token == "mfa-token"
    with pytest.raises(MfaChallengeInvalidError):
        await mfa_service.consume_oauth_handoff(redis_client, handoff)


async def test_mfa_setup_token_can_be_read_before_successful_confirmation(redis_client: Redis) -> None:
    """TOTP setup tokens should survive failed code attempts."""
    user_id = uuid4()
    secret = mfa_service.generate_totp_secret()
    token = await mfa_service.create_totp_setup(redis_client, user_id=user_id, secret=secret)

    first = await mfa_service.get_totp_setup(redis_client, token, user_id=user_id)
    second = await mfa_service.get_totp_setup(redis_client, token, user_id=user_id)

    assert first.secret == secret
    assert second.secret == secret


async def test_mfa_setup_token_is_consumed_after_successful_confirmation(redis_client: Redis) -> None:
    """TOTP setup tokens must not be reusable after confirmation succeeds."""
    user_id = uuid4()
    secret = mfa_service.generate_totp_secret()
    token = await mfa_service.create_totp_setup(redis_client, user_id=user_id, secret=secret)

    first = await mfa_service.consume_totp_setup(redis_client, token, user_id=user_id)

    assert first.secret == secret
    with pytest.raises(MfaChallengeInvalidError):
        await mfa_service.consume_totp_setup(redis_client, token, user_id=user_id)


async def test_mfa_token_rate_limit_uses_keyed_token_fingerprint(mocker: MockerFixture) -> None:
    """MFA token attempt limits should use keyed token fingerprints instead of raw tokens."""
    hit_key = mocker.patch("app.api.auth.services.mfa_service.limiter.hit_key")
    token = "setup-token-value"

    mfa_service.enforce_mfa_token_rate_limit(token)

    rate, key = hit_key.call_args.args
    assert rate == mfa_service.MFA_TOKEN_ATTEMPT_RATE_LIMIT
    assert key == rate_limit_bucket_key("auth:mfa:token", mfa_service.token_fingerprint(token))
    assert token not in key


def test_mfa_token_rate_limit_propagates_rate_limit_error(mocker: MockerFixture) -> None:
    """The MFA service should let the shared rate-limit exception become a 429 response."""
    mocker.patch(
        "app.api.auth.services.mfa_service.limiter.hit_key",
        side_effect=RateLimitExceededError,
    )

    with pytest.raises(RateLimitExceededError):
        mfa_service.enforce_mfa_token_rate_limit("setup-token-value")


async def test_corrupt_stored_mfa_token_metadata_is_rejected(redis_client: Redis) -> None:
    """Corrupt pending-token metadata should normalize to the public MFA token error."""
    token = "corrupt-token"
    await redis_client.set(f"auth:mfa:login-challenge:{mfa_service.token_fingerprint(token)}", '{"user_id": 42}')

    with pytest.raises(MfaChallengeInvalidError):
        await mfa_service.consume_login_challenge(redis_client, token)
