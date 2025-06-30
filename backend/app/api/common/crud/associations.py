"""CRUD utility functions for association models between many-to-many relationships."""

from collections.abc import Sequence
from enum import Enum
from typing import TYPE_CHECKING, overload
from uuid import UUID

from fastapi_filter.contrib.sqlalchemy import Filter
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.common.crud.base import get_model_by_id, get_models
from app.api.common.models.custom_types import DT, IDT, LMT, MT

if TYPE_CHECKING:
    from sqlmodel.sql._expression_select_cls import SelectOfScalar


### Association Utilities ###
async def get_linking_model_with_ids_if_it_exists(
    db: AsyncSession, model_type: type[LMT], id1: int | UUID, id2: int | UUID, id1_field: str, id2_field: str
) -> LMT:
    """Get a linking model instance by composite keys if it exists in the database.

    Args:
        db: AsyncSession to use for the database query
        model_type: Type of the linking model instance
        id1: First ID that was queried
        id2: Second ID that was queried
        id1_field: Field name for the first ID in the linking model
        id2_field: Field name for the second ID in the linking model

    Returns:
        LMT: The linking model instance if it exists

    Raises:
        ValueError: If linking model instance is None
    """
    statement: SelectOfScalar[LMT] = select(model_type).where(
        getattr(model_type, id1_field) == id1, getattr(model_type, id2_field) == id2
    )
    result: LMT | None = (await db.exec(statement)).one_or_none()
    if not result:
        model_name: str = model_type.get_api_model_name().name_capital
        err_msg: str = f"{model_name} with {id1_field} {id1} and {id2_field} {id2} not found"
        raise ValueError(err_msg)
    return result


class LinkedModelReturnType(str, Enum):
    """Enum for linked model return types."""

    DEPENDENT = "dependent"
    LINK = "link"


@overload
async def get_linked_model_by_id(
    db: AsyncSession,
    parent_model: type[MT],
    parent_id: IDT,
    dependent_model: type[DT],
    dependent_id: IDT,
    link_model: type[LMT],
    parent_link_field: str,
    dependent_link_field: str,
    *,
    return_type: LinkedModelReturnType = LinkedModelReturnType.DEPENDENT,
    include: set[str] | None = None,
) -> DT: ...


@overload
async def get_linked_model_by_id(
    db: AsyncSession,
    parent_model: type[MT],
    parent_id: IDT,
    dependent_model: type[DT],
    dependent_id: IDT,
    link_model: type[LMT],
    parent_link_field: str,
    dependent_link_field: str,
    *,
    return_type: LinkedModelReturnType = LinkedModelReturnType.LINK,
    include: set[str] | None = None,
) -> LMT: ...


async def get_linked_model_by_id(
    db: AsyncSession,
    parent_model: type[MT],
    parent_id: IDT,
    dependent_model: type[DT],
    dependent_id: IDT,
    link_model: type[LMT],
    parent_link_field: str,
    dependent_link_field: str,
    *,
    return_type: LinkedModelReturnType = LinkedModelReturnType.DEPENDENT,
    include: set[str] | None = None,
) -> DT | LMT:
    """Get dependent or linking model via linking table relationship.

    Args:
        db: Database session
        parent_model: Parent model class
        parent_id: Parent ID
        dependent_model: Dependent model class
        dependent_id: Dependent ID
        link_model: Linking model class
        parent_link_field: Parent ID field in link model
        dependent_link_field: Dependent ID field in link model
        return_type: Type of result to return (dependent model or linking model)
        include: Optional relationships to include
    """
    # Validate both models exist
    await get_model_by_id(db, parent_model, parent_id)
    dependent: DT = await get_model_by_id(db, dependent_model, dependent_id, include_relationships=include)

    # Validate link exists
    try:
        link: LMT = await get_linking_model_with_ids_if_it_exists(
            db, link_model, parent_id, dependent_id, parent_link_field, dependent_link_field
        )
    except ValueError as e:
        dependent_model_name: str = dependent_model.get_api_model_name().name_capital
        parent_model_name: str = parent_model.get_api_model_name().name_capital
        err_msg: str = f"{dependent_model_name} is not linked to {parent_model_name}"
        raise ValueError(err_msg) from e

    return link if return_type == LinkedModelReturnType.LINK else dependent


async def get_linked_models(
    db: AsyncSession,
    parent_model: type[MT],
    parent_id: int,
    dependent_model: type[DT],
    link_model: type[LMT],
    parent_link_field: str,
    *,
    include_relationships: set[str] | None = None,
    model_filter: Filter | None = None,
) -> Sequence[DT]:
    """Get all linked dependent models for a parent."""
    # Validate parent exists
    await get_model_by_id(db, parent_model, parent_id)

    # Build base query
    statement: SelectOfScalar[DT] = (
        select(dependent_model).join(link_model).where(getattr(link_model, parent_link_field) == parent_id)
    )

    # Get filtered models with includes
    return await get_models(
        db, dependent_model, include_relationships=include_relationships, model_filter=model_filter, statement=statement
    )


async def create_model_links(
    db: AsyncSession,
    id1: int,
    id1_field: str,
    id2_set: set[int] | set[UUID],
    id2_field: str,
    link_model: type[LMT],
) -> None:
    """Create links between two sets of IDs using a linking model.

    Args:
        db: Database session
        id1: ID of the first model instance
        id1_field: Field name for the first model ID in the linking model
        id2_set: Set of IDs of the second model instances
        id2_field: Field name for the second model ID in the linking model
        link_model: Linking model class
    """
    links: list[LMT] = [link_model(**{id1_field: id1, id2_field: id2}) for id2 in id2_set]
    db.add_all(links)
