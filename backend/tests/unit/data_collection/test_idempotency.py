"""Unit tests for server-side idempotency keys on create endpoints."""

import json
from uuid import uuid4

import pytest
from fakeredis.aioredis import FakeRedis
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.api.data_collection.idempotency import (
    abort_idempotent_request,
    begin_idempotent_request,
    finish_idempotent_request,
    idempotency_guard,
    validate_idempotency_key,
)
from app.api.data_collection.product_schemas import ProductRead
from tests.factories.models import MaterialProductLinkFactory, ProductFactory

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


async def test_in_flight_marker_uses_a_short_ttl_not_the_full_24h() -> None:
    """The in-flight marker must self-heal quickly, not lock the key for the full response TTL.

    Regression guard: the marker used to be claimed with the 24h response TTL, so a create
    that crashed (or whose final store silently failed) left the key 409-ing every retry for
    a full day even though nothing was ever created.
    """
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "marker-ttl-key"

    assert await begin_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key) is None

    cache_key = f"idempotency:{user_id}:{ENDPOINT}:{key}"
    ttl = await redis.ttl(cache_key)
    assert 0 < ttl <= 60


async def test_abort_deletes_the_marker_so_the_key_is_immediately_retryable() -> None:
    """A failed create must release the marker, not make the client wait out its TTL."""
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "abort-key"

    assert await begin_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key) is None
    await abort_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key)

    # Retryable immediately: begin claims the marker again instead of hitting the 409 path.
    assert await begin_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key) is None


async def test_idempotency_guard_releases_marker_when_create_raises() -> None:
    """A route wrapping its create-and-store sequence in the guard must be retryable after a failure."""
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "guard-raises-key"

    assert await begin_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key) is None

    async def _create_that_fails() -> None:
        msg = "create failed"
        raise ValueError(msg)

    with pytest.raises(ValueError, match="create failed"):
        async with idempotency_guard(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key):
            await _create_that_fails()

    # The exception must propagate (guard re-raises) *and* clear the marker.
    assert await begin_idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=key) is None


async def test_idempotency_guard_is_a_no_op_without_a_key() -> None:
    """No header means the guard must never touch Redis, matching every other no-key path."""
    redis = await _make_fake_redis()
    user_id = uuid4()

    async with idempotency_guard(redis, user_id=user_id, endpoint=ENDPOINT, idempotency_key=None):
        pass

    assert await redis.dbsize() == 0


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


async def test_stored_body_matches_fastapis_own_response_encoding() -> None:
    """Confirm a replayed body is indistinguishable from the original response.

    Routes call ``result.model_dump(mode="json")`` and round-trip it through ``json.dumps``/
    ``json.loads`` before handing it to ``JSONResponse``; FastAPI's own response path instead
    runs the model through ``jsonable_encoder``. This test pins the assumption that the two
    encoders agree — it would catch a future field (e.g. a new alias or computed property)
    that one encodes differently than the other.
    """
    product = ProductFactory.build(id=1, owner_id=uuid4(), bill_of_materials=[MaterialProductLinkFactory.build()])
    read_model = ProductRead.model_validate(product)

    stored_then_replayed = json.loads(json.dumps(read_model.model_dump(mode="json")))
    fastapis_own_encoding = jsonable_encoder(read_model)

    assert stored_then_replayed == fastapis_own_encoding
