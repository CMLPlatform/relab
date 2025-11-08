"""Base CRUD operations for SQLAlchemy models."""

from collections.abc import Sequence

from fastapi_filter.contrib.sqlalchemy import Filter
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlmodel import apaginate
from sqlalchemy import Select
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from app.api.common.crud.exceptions import DependentModelOwnershipError
from app.api.common.crud.utils import (
    AttributeSettingStrategy,
    add_relationship_options,
    set_empty_relationships,
    validate_model_with_id_exists,
)
from app.api.common.models.custom_types import DT, IDT, MT


def should_apply_filter(filter_obj: Filter) -> bool:
    """Check if any field in the filter (including nested filters) has a non-None value."""
    for value in filter_obj.__dict__.values():
        if isinstance(value, Filter):
            if should_apply_filter(value):
                return True
        elif value is not None:
            return True
    return False


def add_filter_joins(
    statement: Select,
    model: type[MT],
    filter_obj: Filter,
    path: list[str] | None = None,
) -> Select:
    """Recursively add joins for filter relationships."""
    path = path or []

    if not should_apply_filter(filter_obj):
        return statement

    relationship_filters = {name: value for name, value in filter_obj.__dict__.items() if isinstance(value, Filter)}

    for rel_name, nested_filter in relationship_filters.items():
        if not should_apply_filter(nested_filter):
            continue

        # Get the relationship attribute from the current model
        current_model = model
        current_path = []

        for ancestor in path:
            current_model = getattr(current_model, ancestor).property.entity.entity
            current_path.append(ancestor)

        relationship = getattr(current_model, rel_name)
        prop = relationship.property
        target = prop.entity.entity

        # Add joins with proper isouter parameter
        if getattr(prop, "secondary", None) is not None:
            statement = statement.join(prop.secondary, isouter=bool(current_path)).join(
                target, isouter=bool(current_path)
            )
        else:
            statement = statement.join(target, prop.primaryjoin, isouter=bool(current_path))

        # Recursively process nested filters
        statement = add_filter_joins(statement, model, nested_filter, path=[*path, rel_name])

    return statement


def get_models_query(
    model: type[MT],
    *,
    include_relationships: set[str] | None = None,
    model_filter: Filter | None = None,
    statement: SelectOfScalar[MT] | None = None,
    read_schema: type[MT] | None = None,
) -> tuple[SelectOfScalar[MT], dict[str, bool]]:
    """Generic function to get models with optional filtering and relationships.

    It returns the SQLAlchemy statement and relationship info.
    """
    if statement is None:
        statement = select(model)

    if model_filter:
        # Add all necessary joins for filtering
        statement = add_filter_joins(statement, model, model_filter)
        # Apply the filter
        statement = model_filter.filter(statement)
        # Apply sorting if specified
        # HACK: Inspect sort vars to see if any sorting is defined
        if vars(model_filter.sort):
            statement = model_filter.sort(statement)

    relationships_to_exclude = []
    statement, relationships_to_exclude = add_relationship_options(
        statement, model, include_relationships, read_schema=read_schema
    )

    return statement, relationships_to_exclude


async def get_models(
    db: AsyncSession,
    model: type[MT],
    *,
    include_relationships: set[str] | None = None,
    model_filter: Filter | None = None,
    statement: SelectOfScalar[MT] | None = None,
) -> Sequence[MT]:
    """Generic function to get models with optional filtering and relationships."""
    statement, relationships_to_exclude = get_models_query(
        model,
        include_relationships=include_relationships,
        model_filter=model_filter,
        statement=statement,
    )
    result: Sequence[MT] = (await db.exec(statement)).unique().all()

    return set_empty_relationships(result, relationships_to_exclude)


async def get_paginated_models(
    db: AsyncSession,
    model: type[MT],
    *,
    include_relationships: set[str] | None = None,
    model_filter: Filter | None = None,
    statement: SelectOfScalar[MT] | None = None,
    read_schema: type[MT] | None = None,
) -> Page[Sequence[DT]]:
    """Generic function to get paginated models with optional filtering and relationships."""
    statement, relationships_to_exclude = get_models_query(
        model,
        include_relationships=include_relationships,
        model_filter=model_filter,
        statement=statement,
        read_schema=read_schema,
    )

    result_page: Page[Sequence[DT]] = await apaginate(db, statement, params=None)

    result_page.items = set_empty_relationships(
        result_page.items, relationships_to_exclude, setattr_strat=AttributeSettingStrategy.PYDANTIC
    )

    return result_page


async def get_model_by_id(
    db: AsyncSession, model: type[MT], model_id: IDT, *, include_relationships: set[str] | None = None
) -> MT:
    """Generic function to get a model by ID with specified relationships.

    Args:
        db: AsyncSession for database operations
        model: The SQLAlchemy model class
        model_id: ID of the model instance to retrieve
        include_relationships: Optional set of relationship names to include

    Returns:
        Model instance
    """
    if not hasattr(model, "id"):
        err_msg: str = f"Model {model} does not have an id field."
        raise ValueError(err_msg)

    statement: SelectOfScalar[MT] = select(model).where(
        model.id == model_id  # TODO: Fix this type error by creating a custom database model type that has id.
    )

    statement, relationships_to_exclude = add_relationship_options(statement, model, include_relationships)

    result: MT | None = (await db.exec(statement)).unique().one_or_none()

    result = validate_model_with_id_exists(result, model, model_id)
    return set_empty_relationships(result, relationships_to_exclude)


async def get_nested_model_by_id(
    db: AsyncSession,
    parent_model: type[MT],
    parent_id: IDT,
    dependent_model: type[DT],
    dependent_id: IDT,
    parent_fk_name: str,
    *,
    include_relationships: set[str] | None = None,
) -> DT:
    """Get nested model by checking foreign key relationship.

    Args:
        db: Database session
        parent_model: Parent model class
        parent_id: Parent ID
        dependent_model: Dependent model class
        dependent_id: Dependent ID
        parent_fk_name: Name of parent foreign key in dependent model
        include_relationships: Optional relationships to include
    """
    dependent_model_name = dependent_model.get_api_model_name().name_capital
    parent_model_name = parent_model.get_api_model_name().name_capital

    # Validate foreign key exists on dependent
    if not hasattr(dependent_model, parent_fk_name):
        err_msg: str = f"{dependent_model_name} does not have a {parent_fk_name} field"
        raise KeyError(err_msg)

    # Get both models and validate existence
    await get_model_by_id(db, parent_model, parent_id)
    dependent: DT = await get_model_by_id(
        db, dependent_model, dependent_id, include_relationships=include_relationships
    )

    # Check relationship
    if getattr(dependent, parent_fk_name) != parent_id:
        err_msg = f"{dependent_model_name} {dependent_id} does not belong to {parent_model_name} {parent_id}"
        raise DependentModelOwnershipError(
            dependent_model=dependent_model,
            dependent_id=dependent_id,
            parent_model=parent_model,
            parent_id=parent_id,
        )

    return dependent
