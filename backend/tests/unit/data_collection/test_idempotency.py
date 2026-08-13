"""Unit tests for server-side idempotency keys on create endpoints."""

from uuid import uuid4

import pytest
from fakeredis.aioredis import FakeRedis
from fastapi import HTTPException
from fastapi.responses import JSONResponse

from app.api.data_collection.idempotency import (
    begin_idempotent_request,
    finish_idempotent_request,
    validate_idempotency_key,
)

ENDPOINT = "POST /products"


async def _make_fake_redis() -> FakeRedis:
    """Build a fake Redis client for unit tests."""
    return FakeRedis(decode_responses=True, version=7)


async def test_no_header_passes_through_without_touching_redis() -> None:
    """A missing Idempotency-Key must be a complete no-op."""
    redis = await _make_fake_redis()
    user_id = uuid4()

    replay = await begin_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=None)

    assert replay is None
    assert await redis.dbsize() == 0

    # finish is also a no-op with no key
    await finish_idempotent_request(
        redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=None, status_code=201, body={"id": 1}
    )
    assert await redis.dbsize() == 0


async def test_first_use_claims_and_stores_response() -> None:
    """First use of a key claims the slot, then finish() stores the response with a TTL."""
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "client-key-1"

    replay = await begin_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key)
    assert replay is None  # first use: caller should proceed normally

    await finish_idempotent_request(
        redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key, status_code=201, body={"id": 42}
    )

    cache_key = f"idempotency:{user_id}:{ENDPOINT}:{key}"
    ttl = await redis.ttl(cache_key)
    assert 0 < ttl <= 24 * 60 * 60


async def test_replay_returns_stored_response_without_reprocessing() -> None:
    """A retry with the same key gets the original response back, not a fresh call."""
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "client-key-2"

    calls = 0

    async def fake_create() -> dict[str, int]:
        nonlocal calls
        calls += 1
        return {"id": 7}

    # First request: claim, process, store.
    assert await begin_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key) is None
    body = await fake_create()
    await finish_idempotent_request(
        redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key, status_code=201, body=body
    )

    # Retry with the same key: must short-circuit before the "create" call runs again.
    replay = await begin_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key)

    assert isinstance(replay, JSONResponse)
    assert replay.status_code == 201
    assert replay.body == b'{"id":7}'
    assert calls == 1


async def test_cross_user_isolation_same_key_different_users() -> None:
    """The same raw key for two different users must never collide."""
    redis = await _make_fake_redis()
    user_a = uuid4()
    user_b = uuid4()
    key = "shared-raw-key"

    assert await begin_idempotent_request(redis, user_id=user_a, endpoint=ENDPOINT, idempotency_key=key) is None
    await finish_idempotent_request(
        redis, user_id=user_a, endpoint=ENDPOINT, idempotency_key=key, status_code=201, body={"id": 1}
    )

    # user_b's first use of the *same* raw key must be treated as brand new, not a replay of A's.
    replay_for_b = await begin_idempotent_request(redis, user_id=user_b, endpoint=ENDPOINT, idempotency_key=key)
    assert replay_for_b is None


async def test_concurrent_in_flight_duplicate_returns_409() -> None:
    """A second request with the same key, before the first finishes, gets a clear 409."""
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "in-flight-key"

    first = await begin_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key)
    assert first is None  # claimed the in-flight marker, still "processing"

    with pytest.raises(HTTPException) as exc_info:
        await begin_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key)

    assert exc_info.value.status_code == 409
    assert "already being processed" in exc_info.value.detail


@pytest.mark.parametrize(
    "raw",
    [
        "x" * 129,  # over the length cap
        "",  # empty
        "has a space",
        "control\tchar",
        "emoji-\N{SNOWMAN}",
    ],
)
async def test_oversized_or_garbage_key_is_rejected(raw: str) -> None:
    """A key that fails the visible-ASCII/length contract must 422, not be silently accepted."""
    with pytest.raises(HTTPException) as exc_info:
        validate_idempotency_key(raw)

    assert exc_info.value.status_code == 422


async def test_well_formed_key_passes_validation() -> None:
    """A normal client-generated token (e.g. a UUID) must validate cleanly."""
    assert validate_idempotency_key("550e8400-e29b-41d4-a716-446655440000") == "550e8400-e29b-41d4-a716-446655440000"


async def test_none_passes_validation() -> None:
    """No header at all is valid — it just means idempotency is opted out of."""
    assert validate_idempotency_key(None) is None
