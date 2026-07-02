"""Unit tests for auth token-store helpers."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest

from app.api.auth.exceptions import MfaChallengeInvalidError
from app.api.auth.services.token_store import (
    decode_token_metadata,
    read_token_metadata,
    store_new_token,
    token_fingerprint,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis


def test_token_fingerprint_never_returns_raw_token() -> None:
    """Token storage keys should use non-secret fingerprints."""
    token = "secret-token-value"

    fingerprint = token_fingerprint(token)

    assert fingerprint != token
    assert token not in fingerprint
    assert len(fingerprint) == 64


async def test_store_and_read_token_metadata(redis_client: Redis) -> None:
    """Token metadata should round-trip through Redis."""
    token = await store_new_token(
        redis_client,
        key_prefix="auth:test",
        payload={"user_id": "user-1"},
        ttl_seconds=60,
        token_bytes=16,
    )

    assert await read_token_metadata(
        redis_client,
        key_prefix="auth:test",
        token=token,
        error_cls=MfaChallengeInvalidError,
    ) == {"user_id": "user-1"}


async def test_read_token_metadata_can_consume_once(redis_client: Redis) -> None:
    """One-time token reads should consume stored metadata atomically."""
    token = await store_new_token(
        redis_client,
        key_prefix="auth:test",
        payload={"kind": "one-time"},
        ttl_seconds=60,
        token_bytes=16,
    )

    assert await read_token_metadata(
        redis_client,
        key_prefix="auth:test",
        token=token,
        error_cls=MfaChallengeInvalidError,
        consume=True,
    ) == {"kind": "one-time"}
    with pytest.raises(MfaChallengeInvalidError):
        await read_token_metadata(
            redis_client,
            key_prefix="auth:test",
            token=token,
            error_cls=MfaChallengeInvalidError,
        )


def test_decode_token_metadata_rejects_invalid_payload() -> None:
    """Corrupt token-store payloads should normalize to the caller's public error."""
    with pytest.raises(MfaChallengeInvalidError):
        decode_token_metadata(json.dumps(["not", "an", "object"]), error_cls=MfaChallengeInvalidError)
