"""Typed helpers for association/link models."""

# ruff: noqa: PLR0913

from enum import StrEnum
from typing import TYPE_CHECKING, overload

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import InstrumentedAttribute

from app.api.common.crud.query import list_models, require_model
from app.api.common.exceptions import BadRequestError
from app.api.common.models.base import get_model_label
from app.api.common.models.custom_types import DT, IDT, LMT, MT

if TYPE_CHECKING:
    from collections.abc import Sequence
    from uuid import UUID

    from fastapi_filter.contrib.sqlalchemy import Filter
    from sqlalchemy import Select


async def require_link(
    db: AsyncSession,
    link_model: type[LMT],
    id1: int | UUID,
    id2: int | UUID,
    id1_attr: InstrumentedAttribute[int | UUID],
    id2_attr: InstrumentedAttribute[int | UUID],
) -> LMT:
    """Return a link row for two IDs or raise BadRequestError."""
    statement: Select[tuple[LMT]] = select(link_model).where(id1_attr == id1, id2_attr == id2)
    result = (await db.execute(statement)).scalar_one_or_none()
    if result is None:
        model_name = get_model_label(link_model)
        err_msg = f"{model_name} with {id1_attr.key} {id1} and {id2_attr.key} {id2} not found"
        raise BadRequestError(err_msg)
    return result


class LinkedModelReturnType(StrEnum):
    """Enum for linked model return types."""

    DEPENDENT = "dependent"
    LINK = "link"


@overload
async def require_linked_model(
    db: AsyncSession,
    parent_model: type[MT],
    parent_id: IDT,
    dependent_model: type[DT],
    dependent_id: IDT,
    link_model: type[LMT],
    parent_link_attr: InstrumentedAttribute[int | UUID],
    dependent_link_attr: InstrumentedAttribute[int | UUID],
    *,
    return_type: LinkedModelReturnType = LinkedModelReturnType.DEPENDENT,
    loaders: set[str] | frozenset[str] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> DT: ...


@overload
async def require_linked_model(
    db: AsyncSession,
    parent_model: type[MT],
    parent_id: IDT,
    dependent_model: type[DT],
    dependent_id: IDT,
    link_model: type[LMT],
    parent_link_attr: InstrumentedAttribute[int | UUID],
    dependent_link_attr: InstrumentedAttribute[int | UUID],
    *,
    return_type: LinkedModelReturnType = LinkedModelReturnType.LINK,
    loaders: set[str] | frozenset[str] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> LMT: ...


async def require_linked_model(
    db: AsyncSession,
    parent_model: type[MT],
    parent_id: IDT,
    dependent_model: type[DT],
    dependent_id: IDT,
    link_model: type[LMT],
    parent_link_attr: InstrumentedAttribute[int | UUID],
    dependent_link_attr: InstrumentedAttribute[int | UUID],
    *,
    return_type: LinkedModelReturnType = LinkedModelReturnType.DEPENDENT,
    loaders: set[str] | frozenset[str] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> DT | LMT:
    """Return a linked dependent row, or the association row when requested."""
    await require_model(db, parent_model, parent_id)
    dependent = await require_model(db, dependent_model, dependent_id, loaders=loaders, read_schema=read_schema)

    try:
        link = await require_link(db, link_model, parent_id, dependent_id, parent_link_attr, dependent_link_attr)
    except BadRequestError as e:
        dependent_model_name = get_model_label(dependent_model)
        parent_model_name = get_model_label(parent_model)
        err_msg = f"{dependent_model_name} is not linked to {parent_model_name}"
        raise BadRequestError(err_msg) from e

    return link if return_type == LinkedModelReturnType.LINK else dependent


async def list_linked_models(
    db: AsyncSession,
    parent_model: type[MT],
    parent_id: int,
    dependent_model: type[DT],
    link_model: type[LMT],
    parent_link_attr: InstrumentedAttribute[int | UUID],
    *,
    loaders: set[str] | frozenset[str] | None = None,
    filters: Filter | None = None,
    read_schema: type[BaseModel] | None = None,
) -> Sequence[DT]:
    """Return dependent models linked to a parent."""
    await require_model(db, parent_model, parent_id)
    statement: Select[tuple[DT]] = select(dependent_model).join(link_model).where(parent_link_attr == parent_id)
    return await list_models(
        db,
        dependent_model,
        loaders=loaders,
        filters=filters,
        statement=statement,
        read_schema=read_schema,
    )


async def add_links(
    db: AsyncSession,
    id1: int,
    id1_attr: InstrumentedAttribute[int | UUID],
    id2_set: set[int] | set[UUID],
    id2_attr: InstrumentedAttribute[int | UUID],
    link_model: type[LMT],
) -> None:
    """Create association rows between one parent ID and many dependent IDs."""
    links = [link_model(**{id1_attr.key: id1, id2_attr.key: id2}) for id2 in id2_set]
    db.add_all(links)
