"""Unit tests wiring the idempotency-key contract into the create-product/component routes."""

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from app.api.data_collection.routers.component_core_routers import add_component_to_component
from app.api.data_collection.routers.product_mutation_routers import add_component_to_product, create_product
from scripts.seed.factories.models import UserFactory

if TYPE_CHECKING:
    from redis.asyncio import Redis


class _StubRead(BaseModel):
    """Minimal read-model stand-in with the ``.model_dump(mode="json")`` shape the routes use."""

    id: int


class _StubBody(BaseModel):
    """Minimal create-payload stand-in; the routes only hash it and pass it to the CRUD call."""

    name: str = "widget"


async def test_create_product_replay_returns_stored_body_without_second_create(redis_client: Redis) -> None:
    """A retried POST /products with the same key must not call create_product_record twice."""
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
        first = await create_product(_StubBody(), current_user, session, redis_client, idempotency_key=key)
        second = await create_product(_StubBody(), current_user, session, redis_client, idempotency_key=key)

    assert isinstance(first, _StubRead)
    assert create_record.await_count == 1
    assert second.status_code == 201
    assert second.body == b'{"id":1}'


async def test_create_product_no_header_never_touches_redis(redis_client: Redis) -> None:
    """No Idempotency-Key header means the endpoint behaves exactly as before."""
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
        await create_product(_StubBody(), current_user, session, redis_client, idempotency_key=None)
        await create_product(_StubBody(), current_user, session, redis_client, idempotency_key=None)

    assert create_record.await_count == 2
    assert await redis_client.dbsize() == 0


async def test_add_component_to_product_replay_avoids_second_create(redis_client: Redis) -> None:
    """A retried POST /products/{id}/components must not create a second component."""
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
        first = await add_component_to_product(db_product, _StubBody(), session, current_user, redis_client, key)
        second = await add_component_to_product(db_product, _StubBody(), session, current_user, redis_client, key)

    assert isinstance(first, _StubRead)
    assert create_record.await_count == 1
    assert second.status_code == 201
    assert second.body == b'{"id":2}'


async def test_add_component_to_component_replay_avoids_second_create(redis_client: Redis) -> None:
    """A retried POST /components/{id}/components must not create a second component."""
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
        first = await add_component_to_component(db_component, _StubBody(), session, current_user, redis_client, key)
        second = await add_component_to_component(db_component, _StubBody(), session, current_user, redis_client, key)

    assert isinstance(first, _StubRead)
    assert create_record.await_count == 1
    assert second.status_code == 201
    assert second.body == b'{"id":3}'


async def test_different_users_same_key_both_create(redis_client: Redis) -> None:
    """Two different users retrying with the same raw key must each get their own record."""
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
        await create_product(_StubBody(), user_a, session, redis_client, idempotency_key=key)
        await create_product(_StubBody(), user_b, session, redis_client, idempotency_key=key)

    assert create_record.await_count == 2


async def test_failure_after_the_commit_does_not_make_the_key_retryable(redis_client: Redis) -> None:
    """A refresh/serialize error happens after the row is durable, so a retry must not re-create.

    Regression guard: the route used to commit inside the idempotency guard, so a post-commit
    exception released the marker and the client's retry inserted a duplicate.
    """
    session = AsyncMock()
    session.refresh.side_effect = RuntimeError("refresh blew up")
    current_user = UserFactory.build(id=uuid4())
    key = "post-commit-key"

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
        with pytest.raises(RuntimeError, match="refresh blew up"):
            await create_product(_StubBody(), current_user, session, redis_client, idempotency_key=key)
        with pytest.raises(HTTPException) as exc_info:
            await create_product(_StubBody(), current_user, session, redis_client, idempotency_key=key)

    assert exc_info.value.status_code == 409
    assert create_record.await_count == 1
