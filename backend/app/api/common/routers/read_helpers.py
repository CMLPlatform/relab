"""Shared read-handler helpers for list/detail router endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from app.api.common.crud.base import get_model_by_id, get_models, get_nested_model_by_id, get_paginated_models
from app.api.common.models.base import CustomBaseBare

if TYPE_CHECKING:
    from collections.abc import Sequence

    from fastapi_filter.contrib.sqlalchemy import Filter
    from fastapi_pagination import Page
    from pydantic import BaseModel
    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlmodel.sql._expression_select_cls import SelectOfScalar


async def list_models_response[ModelT: CustomBaseBare](
    session: AsyncSession,
    model: type[ModelT],
    *,
    include_relationships: set[str] | None = None,
    model_filter: Filter | None = None,
    read_schema: type[BaseModel] | None = None,
    statement: SelectOfScalar[ModelT] | None = None,
) -> Page[ModelT]:
    """Return a paginated list response for a model-backed endpoint."""
    return await get_paginated_models(
        session,
        model,
        include_relationships=include_relationships,
        model_filter=model_filter,
        read_schema=read_schema,
        statement=statement,
    )


async def get_model_response[ModelT: CustomBaseBare, ModelIDT: int | UUID](
    session: AsyncSession,
    model: type[ModelT],
    model_id: ModelIDT,
    *,
    include_relationships: set[str] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> ModelT:
    """Return a single model response for a detail endpoint."""
    return await get_model_by_id(
        session,
        model,
        model_id,
        include_relationships=include_relationships,
        read_schema=read_schema,
    )


async def list_models_sequence_response[ModelT: CustomBaseBare](
    session: AsyncSession,
    model: type[ModelT],
    *,
    include_relationships: set[str] | None = None,
    model_filter: Filter | None = None,
    read_schema: type[BaseModel] | None = None,
    statement: SelectOfScalar[ModelT] | None = None,
) -> Sequence[ModelT]:
    """Return a non-paginated list response for a model-backed endpoint."""
    return await get_models(
        session,
        model,
        include_relationships=include_relationships,
        model_filter=model_filter,
        statement=statement,
        read_schema=read_schema,
    )


async def get_nested_model_response[
    ParentModelT: CustomBaseBare,
    DependentModelT: CustomBaseBare,
    ModelIDT: int | UUID,
](
    session: AsyncSession,
    parent_model: type[ParentModelT],
    parent_id: ModelIDT,
    dependent_model: type[DependentModelT],
    dependent_id: ModelIDT,
    foreign_key_attr: str,
    *,
    include_relationships: set[str] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> DependentModelT:
    """Return a nested model response for dependent child resources."""
    return await get_nested_model_by_id(
        session,
        parent_model,
        parent_id,
        dependent_model,
        dependent_id,
        foreign_key_attr,
        include_relationships=include_relationships,
        read_schema=read_schema,
    )
