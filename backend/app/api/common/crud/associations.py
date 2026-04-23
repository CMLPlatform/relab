"""Typed helpers for association/link models."""

from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import InstrumentedAttribute

from app.api.common.exceptions import BadRequestError
from app.api.common.models.base import get_model_label
from app.api.common.models.custom_types import LMT

if TYPE_CHECKING:
    from uuid import UUID

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
