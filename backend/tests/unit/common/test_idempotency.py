"""Unit tests for server-side idempotency keys on create endpoints."""

import json
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fakeredis.aioredis import FakeRedis
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.common.idempotency import idempotent_request, validate_idempotency_key
from app.api.data_collection.product_schemas import ProductRead
from tests.factories.models import MaterialProductLinkFactory, ProductFactory

ENDPOINT = "POST /products"


class _Body(BaseModel):
    """Stand-in for a validated create payload."""

    name: str = "widget"


async def _make_fake_redis() -> FakeRedis:
    """Build a fake Redis client for unit tests."""
    return FakeRedis(decode_responses=True, version=7)


async def test_no_header_passes_through_without_touching_redis() -> None:
    """A missing Idempotency-Key must be a complete no-op."""
    redis = await _make_fake_redis()
    user_id = uuid4()

    async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=None, body=_Body()) as idem:
        assert idem.replay is None

    await idem.finish(201, {"id": 1})
    assert await redis.dbsize() == 0


async def test_first_use_claims_and_stores_response_for_an_hour() -> None:
    """First use claims the slot; finish() stores the response under the (short) response TTL.

    Regression guard: the response used to be cached for 24 hours. Real retries of a lost
    response happen within seconds or minutes, so a day of cached create responses per user
    was pure exposure with no benefit.
    """
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "client-key-1"

    async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body()) as idem:
        assert idem.replay is None
    await idem.finish(201, {"id": 42})

    ttl = await redis.ttl(f"idempotency:{user_id}:{ENDPOINT}:{key}")
    assert 60 < ttl <= 60 * 60


async def test_in_flight_marker_uses_a_short_ttl_not_the_response_ttl() -> None:
    """The in-flight marker must self-heal quickly, not lock the key for the response TTL."""
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "marker-ttl-key"

    async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body()):
        ttl = await redis.ttl(f"idempotency:{user_id}:{ENDPOINT}:{key}")

    assert 0 < ttl <= 60


async def test_guard_releases_marker_when_create_raises() -> None:
    """A create that fails inside the block must be retryable immediately."""
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "guard-raises-key"

    async def _create_that_fails() -> None:
        async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body()):
            msg = "create failed"
            raise ValueError(msg)

    with pytest.raises(ValueError, match="create failed"):
        await _create_that_fails()

    # The exception propagates *and* the marker is gone: a retry claims the key afresh.
    async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body()) as retry:
        assert retry.replay is None


async def test_failure_after_the_block_keeps_the_marker() -> None:
    """A post-commit failure must not release the marker — the row is already durable.

    Regression guard: the routers used to commit *inside* the guard, so a refresh/serialize
    error released the key and the client's retry created a duplicate row.
    """
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "post-commit-key"

    async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body()):
        pass  # the create committed here

    # Serializing the response blows up before finish() runs; the marker must survive.
    with pytest.raises(HTTPException) as exc_info:
        async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body()):
            pass

    assert exc_info.value.status_code == 409


async def test_replay_returns_stored_response_without_reprocessing() -> None:
    """A retry with the same key gets the original response back, not a fresh call."""
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "client-key-2"

    calls = 0

    async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body()) as idem:
        assert idem.replay is None
        calls += 1
    await idem.finish(201, {"id": 7})

    async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body()) as retry:
        replay = retry.replay
        if replay is None:  # pragma: no cover — the assertion below reports it
            calls += 1

    assert isinstance(replay, JSONResponse)
    assert replay.status_code == 201
    assert replay.body == b'{"id":7}'
    assert calls == 1


async def test_replay_with_a_different_body_is_rejected() -> None:
    """Reusing a key for a different payload must 422, not hand back the earlier record."""
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "reused-key"

    async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body(name="a")) as idem:
        pass
    await idem.finish(201, {"id": 1})

    with pytest.raises(HTTPException) as exc_info:
        async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body(name="b")):
            pass

    assert exc_info.value.status_code == 422
    assert "different request body" in exc_info.value.detail


async def test_same_key_on_a_different_parent_is_a_separate_request() -> None:
    """The endpoint scope carries the parent id, so the same key can target two parents."""
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "per-parent-key"
    body = _Body()

    async with idempotent_request(
        redis, user_id=user_id, endpoint="POST /products/1/components", key=key, body=body
    ) as idem:
        pass
    await idem.finish(201, {"id": 1})

    async with idempotent_request(
        redis, user_id=user_id, endpoint="POST /products/2/components", key=key, body=body
    ) as other:
        assert other.replay is None


async def test_cross_user_isolation_same_key_different_users() -> None:
    """The same raw key for two different users must never collide."""
    redis = await _make_fake_redis()
    user_a = uuid4()
    user_b = uuid4()
    key = "shared-raw-key"

    async with idempotent_request(redis, user_id=user_a, endpoint=ENDPOINT, key=key, body=_Body()) as idem:
        pass
    await idem.finish(201, {"id": 1})

    async with idempotent_request(redis, user_id=user_b, endpoint=ENDPOINT, key=key, body=_Body()) as for_b:
        assert for_b.replay is None


async def test_concurrent_in_flight_duplicate_returns_409() -> None:
    """A second request with the same key, before the first finishes, gets a clear 409."""
    redis = await _make_fake_redis()
    user_id = uuid4()
    key = "in-flight-key"

    async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body()):
        with pytest.raises(HTTPException) as exc_info:
            async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key=key, body=_Body()):
                pass

    assert exc_info.value.status_code == 409
    assert "already being processed" in exc_info.value.detail


async def test_unreachable_redis_returns_503_not_409() -> None:
    """A Redis outage is an outage, not a duplicate-request conflict."""
    redis = await _make_fake_redis()
    user_id = uuid4()

    with (
        patch("app.api.common.idempotency.set_redis_value_nx", AsyncMock(return_value=None)),
        pytest.raises(HTTPException) as exc_info,
    ):
        async with idempotent_request(redis, user_id=user_id, endpoint=ENDPOINT, key="down-key", body=_Body()):
            pass

    assert exc_info.value.status_code == 503
    assert "Retry later" in exc_info.value.detail


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
