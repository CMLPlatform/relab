"""Unit tests wiring the idempotency-key contract into the create-product/component routes."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fakeredis.aioredis import FakeRedis
from pydantic import BaseModel

from app.api.data_collection.routers.component_core_routers import add_component_to_component
from app.api.data_collection.routers.product_mutation_routers import add_component_to_product, create_product
from tests.factories.models import UserFactory


class _StubRead(BaseModel):
    """Minimal read-model stand-in with the ``.model_dump(mode="json")`` shape the routes use."""

    id: int


async def _make_fake_redis() -> FakeRedis:
    """Build a fake Redis client for unit tests."""
    return FakeRedis(decode_responses=True, version=7)


async def test_create_product_replay_returns_stored_body_without_second_create() -> None:
    """A retried POST /products with the same key must not call create_product_record twice."""
    redis = await _make_fake_redis()
    session = AsyncMock()
    current_user = UserFactory.build(id=uuid4())
    key = "idem-key-product"

    with (
        patch(
            "app.api.data_collection.routers.product_mutation_routers.create_product_record",
            AsyncMock(return_value=MagicMock()),
        ) as create_record,
        patch(
            "app.api.data_collection.routers.product_mutation_routers.to_read_model",
            return_value=_StubRead(id=1),
        ),
    ):
        first = await create_product(MagicMock(), current_user, session, redis, idempotency_key=key)
        second = await create_product(MagicMock(), current_user, session, redis, idempotency_key=key)

    assert isinstance(first, _StubRead)
    assert create_record.await_count == 1
    assert second.status_code == 201
    assert second.body == b'{"id":1}'


async def test_create_product_no_header_never_touches_redis() -> None:
    """No Idempotency-Key header means the endpoint behaves exactly as before."""
    redis = await _make_fake_redis()
    session = AsyncMock()
    current_user = UserFactory.build(id=uuid4())

    with (
        patch(
            "app.api.data_collection.routers.product_mutation_routers.create_product_record",
            AsyncMock(return_value=MagicMock()),
        ) as create_record,
        patch(
            "app.api.data_collection.routers.product_mutation_routers.to_read_model",
            return_value=_StubRead(id=1),
        ),
    ):
        await create_product(MagicMock(), current_user, session, redis, idempotency_key=None)
        await create_product(MagicMock(), current_user, session, redis, idempotency_key=None)

    assert create_record.await_count == 2
    assert await redis.dbsize() == 0


async def test_add_component_to_product_replay_avoids_second_create() -> None:
    """A retried POST /products/{id}/components must not create a second component."""
    redis = await _make_fake_redis()
    session = AsyncMock()
    current_user = UserFactory.build(id=uuid4())
    db_product = MagicMock()
    key = "idem-key-component"

    with (
        patch(
            "app.api.data_collection.routers.product_mutation_routers.create_component",
            AsyncMock(return_value=MagicMock()),
        ) as create_record,
        patch(
            "app.api.data_collection.routers.product_mutation_routers.to_read_model",
            return_value=_StubRead(id=2),
        ),
    ):
        first = await add_component_to_product(db_product, MagicMock(), session, current_user, redis, key)
        second = await add_component_to_product(db_product, MagicMock(), session, current_user, redis, key)

    assert isinstance(first, _StubRead)
    assert create_record.await_count == 1
    assert second.status_code == 201
    assert second.body == b'{"id":2}'


async def test_add_component_to_component_replay_avoids_second_create() -> None:
    """A retried POST /components/{id}/components must not create a second component."""
    redis = await _make_fake_redis()
    session = AsyncMock()
    current_user = UserFactory.build(id=uuid4())
    db_component = MagicMock()
    key = "idem-key-nested-component"

    with (
        patch(
            "app.api.data_collection.routers.component_core_routers.create_component",
            AsyncMock(return_value=MagicMock()),
        ) as create_record,
        patch(
            "app.api.data_collection.routers.component_core_routers.to_read_model",
            return_value=_StubRead(id=3),
        ),
    ):
        first = await add_component_to_component(db_component, MagicMock(), session, current_user, redis, key)
        second = await add_component_to_component(db_component, MagicMock(), session, current_user, redis, key)

    assert isinstance(first, _StubRead)
    assert create_record.await_count == 1
    assert second.status_code == 201
    assert second.body == b'{"id":3}'


async def test_different_users_same_key_both_create() -> None:
    """Two different users retrying with the same raw key must each get their own record."""
    redis = await _make_fake_redis()
    session = AsyncMock()
    user_a = UserFactory.build(id=uuid4())
    user_b = UserFactory.build(id=uuid4())
    key = "shared-raw-key"

    with (
        patch(
            "app.api.data_collection.routers.product_mutation_routers.create_product_record",
            AsyncMock(return_value=MagicMock()),
        ) as create_record,
        patch(
            "app.api.data_collection.routers.product_mutation_routers.to_read_model",
            return_value=_StubRead(id=1),
        ),
    ):
        await create_product(MagicMock(), user_a, session, redis, idempotency_key=key)
        await create_product(MagicMock(), user_b, session, redis, idempotency_key=key)

    assert create_record.await_count == 2
