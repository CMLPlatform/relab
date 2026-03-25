"""Base CRUD operations for SQLAlchemy models."""
# spell-checker: disable isouter

from typing import TYPE_CHECKING, Any, cast

from fastapi_filter.contrib.sqlalchemy import Filter
from fastapi_pagination import create_page
from fastapi_pagination.api import resolve_params
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from app.api.common.crud.exceptions import CRUDConfigurationError, DependentModelOwnershipError
from app.api.common.crud.utils import add_relationship_options, clear_unloaded_relationships, ensure_model_exists
from app.api.common.models.custom_types import DT, IDT, MT, FetchedModelT

if TYPE_CHECKING:
    from fastapi_pagination import Page
    from fastapi_pagination.bases import AbstractParams


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
    statement: SelectOfScalar[MT],
    model: type[MT],
    filter_obj: Filter,
    path: list[str] | None = None,
) -> SelectOfScalar[MT]:
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
    read_schema: type[BaseModel] | None = None,
) -> tuple[SelectOfScalar[MT], set[str]]:
    """Build a query for fetching models with optional filtering and relationships.

    Args:
        model: The model class to query
        include_relationships: Set of relationship names to eagerly load
        model_filter: Optional filter to apply
        statement: Optional base statement (defaults to select(model))
        read_schema: Optional schema to validate relationships against

    Returns:
        tuple: (SQLAlchemy statement, set of excluded relationship names)
    """
    if statement is None:
        statement = select(model)

    if model_filter:
        # Add all necessary joins for filtering
        statement = add_filter_joins(statement, model, model_filter)
        # Apply the filter
        statement = model_filter.filter(statement)
        # Apply sorting if `order_by` was provided (guard attribute access on Filter models)
        if getattr(model_filter, "order_by", None):
            sort_func = getattr(model_filter, "sort", None)
            if callable(sort_func):
                statement = sort_func(statement)

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
    read_schema: type[BaseModel] | None = None,
) -> list[FetchedModelT]:
    """Get models with optional filtering and relationships.

    Args:
        db: Database session
        model: Model class to query
        include_relationships: Set of relationship names to eagerly load
        model_filter: Optional filter to apply
        statement: Optional base statement
        read_schema: Optional schema to validate relationships against

    Returns:
        list[FetchedModelT]: List of model instances with guaranteed IDs
    """
    statement, relationships_to_exclude = get_models_query(
        model,
        include_relationships=include_relationships,
        model_filter=model_filter,
        statement=statement,
        read_schema=read_schema,
    )
    result: list[MT] = list((await db.exec(statement)).unique().all())

    return cast("list[FetchedModelT]", clear_unloaded_relationships(result, relationships_to_exclude))


async def get_paginated_models(
    db: AsyncSession,
    model: type[MT],
    *,
    include_relationships: set[str] | None = None,
    model_filter: Filter | None = None,
    statement: SelectOfScalar[MT] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> Page[Any]:
    """Get paginated models with optional filtering and relationships.

    Args:
        db: Database session
        model: Model class to query
        include_relationships: Set of relationship names to eagerly load
        model_filter: Optional filter to apply
        statement: Optional base statement
        read_schema: Optional schema to validate relationships against

    Returns:
        Page[DT]: Paginated results
    """
    statement, relationships_to_exclude = get_models_query(
        model,
        include_relationships=include_relationships,
        model_filter=model_filter,
        statement=statement,
        read_schema=read_schema,
    )

    result_page = await paginate_with_exec(db, statement)

    # Clear unloaded relationships for serialization
    result_page.items = cast(
        "list[FetchedModelT]",
        clear_unloaded_relationships(result_page.items, relationships_to_exclude, db=db),
    )

    return result_page


async def paginate_with_exec(
    db: AsyncSession,
    statement: SelectOfScalar[Any],
    params: AbstractParams | None = None,
) -> Page[Any]:
    """Paginate a SQLModel select statement using `session.exec()` instead of `session.execute()`."""
    resolved_params = resolve_params(params)
    raw_params = resolved_params.to_raw_params()

    total = None
    if raw_params.include_total:
        count_query = select(func.count()).select_from(statement.order_by(None).subquery())
        total = cast("int", (await db.exec(count_query)).one())

    limit = getattr(raw_params, "limit", None)
    offset = getattr(raw_params, "offset", None)
    paginated_statement = statement
    if limit is not None:
        paginated_statement = paginated_statement.limit(limit)
    if offset is not None:
        paginated_statement = paginated_statement.offset(offset)
    items = list((await db.exec(paginated_statement)).unique().all())

    return cast("Page[Any]", create_page(items, total=total, params=resolved_params))


async def get_model_by_id(
    db: AsyncSession,
    model: type[MT],
    model_id: IDT,
    *,
    include_relationships: set[str] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> FetchedModelT:
    """Get a model by ID with specified relationships.

    Args:
        db: Database session
        model: The model class to query
        model_id: ID of the model instance to retrieve
        include_relationships: Optional set of relationship names to eagerly load
        read_schema: Optional schema to validate relationships against

    Returns:
        FetchedModelT: Model instance with guaranteed ID

    Raises:
        CRUDConfigurationError: If model doesn't have an id field
        ModelNotFoundError: If model with given ID doesn't exist
    """
    if not hasattr(model, "id"):
        err_msg: str = f"Model {model} does not have an id field."
        raise CRUDConfigurationError(err_msg)

    statement: SelectOfScalar[MT] = select(model).where(model.id == model_id)

    statement, relationships_to_exclude = add_relationship_options(
        statement, model, include_relationships, read_schema=read_schema
    )

    result: MT | None = (await db.exec(statement)).unique().one_or_none()

    result = ensure_model_exists(result, model, model_id)
    return clear_unloaded_relationships(result, relationships_to_exclude, db=db)


async def get_nested_model_by_id(
    db: AsyncSession,
    parent_model: type[MT],
    parent_id: IDT,
    dependent_model: type[DT],
    dependent_id: IDT,
    parent_fk_name: str,
    *,
    include_relationships: set[str] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> FetchedModelT:
    """Get nested model by checking foreign key relationship.

    Args:
        db: Database session
        parent_model: Parent model class
        parent_id: Parent ID
        dependent_model: Dependent model class
        dependent_id: Dependent ID
        parent_fk_name: Name of parent foreign key in dependent model
        include_relationships: Optional relationships to eagerly load
        read_schema: Optional schema to validate relationships against

    Returns:
        FetchedModelT: Dependent model instance with guaranteed ID

    Raises:
        CRUDConfigurationError: If dependent model doesn't have the specified foreign key
        DependentModelOwnershipError: If dependent doesn't belong to parent
    """
    dependent_model_name = dependent_model.get_api_model_name().name_capital

    # Validate foreign key exists on dependent
    if not hasattr(dependent_model, parent_fk_name):
        err_msg: str = f"{dependent_model_name} does not have a {parent_fk_name} field"
        raise CRUDConfigurationError(err_msg)

    # Get both models and validate existence
    await get_model_by_id(db, parent_model, parent_id)
    dependent: FetchedModelT = await get_model_by_id(
        db,
        dependent_model,
        dependent_id,
        include_relationships=include_relationships,
        read_schema=read_schema,
    )

    # Check relationship
    if getattr(dependent, parent_fk_name) != parent_id:
        raise DependentModelOwnershipError(
            dependent_model=dependent_model,
            dependent_id=dependent_id,
            parent_model=parent_model,
            parent_id=parent_id,
        )

    return dependent
