"""Common utility functions for CRUD operations."""

from collections.abc import Sequence
from enum import Enum
from typing import TYPE_CHECKING, Any, overload
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import inspect
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.orm.attributes import set_committed_value
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from app.api.background_data.models import Material, ProductType
from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.models.base import CustomBase
from app.api.common.models.custom_types import ET, IDT, MT
from app.api.data_collection.models import Product
from app.api.file_storage.models.models import FileParentType, ImageParentType

if TYPE_CHECKING:
    from sqlalchemy.orm.mapper import Mapper


### SQLALchemy Select Utilities ###
class RelationshipLoadStrategy(str, Enum):
    """Loading strategies for relationships in SQLAlchemy queries."""

    SELECTIN = "selectin"
    JOINED = "joined"


def add_relationship_options(
    statement: SelectOfScalar,
    model: type[MT],
    include: set[str] | None = None,
    *,
    read_schema: type[BaseModel] | None = None,
    load_strategy: RelationshipLoadStrategy = RelationshipLoadStrategy.SELECTIN,
) -> tuple[SelectOfScalar, dict[str, bool]]:
    """Add selectinload options and return info about relationships to exclude.

    Returns:
        tuple: (modified statement, dict of {rel_name: is_collection} to exclude)
    """
    # Get all relationships from the database model in one pass
    inspector: Mapper[Any] = inspect(model, raiseerr=True)
    # HACK: Using SQLAlchemy internals to get relationship info. This sometimes causes runtime issues with circular model definitions.
    # TODO: Fix this by finding a better way to get relationship info without using internals.
    all_db_rels = {rel.key: (getattr(model, rel.key), rel.uselist) for rel in inspector.relationships}

    # Determine which relationships are in scope (db ∩ schema)
    in_scope_rels = (
        {name for name in all_db_rels if name in read_schema.model_fields} if read_schema else set(all_db_rels.keys())
    )

    # Valid relationships to include (user_input ∩ in_scope)
    to_include = set(include or []) & in_scope_rels

    # Add selectinload for included relationships
    for rel_name in to_include:
        rel_attr = all_db_rels[rel_name][0]
        option = joinedload(rel_attr) if load_strategy == RelationshipLoadStrategy.JOINED else selectinload(rel_attr)
        statement = statement.options(option)

    # Build exclusion dict (in_scope - included)
    relationships_to_exclude = {
        rel_name: all_db_rels[rel_name][1]  # rel_name: is_collection
        for rel_name in (in_scope_rels - to_include)
    }

    return statement, relationships_to_exclude


# HACK: This is a quick way to set relationships to empty values in SQLAlchemy models.
# Ideally we make a clear distinction between database model and Pydantic models throughout the codebase via typing.
class AttributeSettingStrategy(str, Enum):
    """Model type for relationship setting strategy."""

    SQLALCHEMY = "sqlalchemy"  # SQLAlchemy method (uses set_committed_value)
    PYDANTIC = "pydantic"  # Pydantic method (uses setattr)


@overload
def set_empty_relationships(results: MT, relationships_to_exclude: ..., setattr_strat: ...) -> MT: ...


@overload
def set_empty_relationships(
    results: Sequence[MT], relationships_to_exclude: ..., setattr_strat: ...
) -> Sequence[MT]: ...


def set_empty_relationships(
    results: MT | Sequence[MT],
    relationships_to_exclude: dict[str, bool],
    setattr_strat: AttributeSettingStrategy = AttributeSettingStrategy.SQLALCHEMY,
) -> MT | Sequence[MT]:
    """Set relationships to empty values for SQLAlchemy models.

    Args:
        results: Single model instance or sequence of instances
        relationships_to_exclude: Dict of {rel_name: is_collection} to set to empty
        setattr_strat: Strategy for setting attributes (SQLAlchemy or Pydantic)

    Returns:
        MT | Sequence[MT]: Original result(s) with empty relationships set
    """
    if not results or not relationships_to_exclude:
        return results

    # Process single item or sequence
    items = results if isinstance(results, Sequence) else [results]

    for item in items:
        for rel_name, is_collection in relationships_to_exclude.items():
            if setattr_strat == AttributeSettingStrategy.PYDANTIC:
                # Use setattr to set the attribute directly
                setattr(item, rel_name, [] if is_collection else None)
            elif setattr_strat == AttributeSettingStrategy.SQLALCHEMY:
                # Settattr cannot be used directly on SQLAlchemy models as they are linked to the session
                set_committed_value(item, rel_name, [] if is_collection else None)
            else:
                err_msg = f"Invalid setting strategy: {setattr_strat}"
                raise ValueError(err_msg)

    return results


### Error Handling Utilities ###
def validate_model_with_id_exists(db_get_response: MT | None, model_type: type[MT], model_id: IDT) -> MT:
    """Validate that a model with a given id from a db.get() response exists.

    Args:
        db_get_response: Model instance to check
        model_type: Type of the model instance
        model_id: ID that was queried

    Returns:
        MT: The model instance if it exists

    Raises:
        ModelNotFoundError: If model instance is None
    """
    if not db_get_response:
        raise ModelNotFoundError(model_type, model_id)
    return db_get_response


async def db_get_model_with_id_if_it_exists(db: AsyncSession, model_type: type[MT], model_id: IDT) -> MT:
    """Get a model instance with a given id if it exists in the database.

    Args:
        db: AsyncSession to use for the database query
        model_type: Type of the model instance
        model_id: ID that was queried

    Returns:
        MT: The model instance if it exists
    Raises:
        ModelNotFoundError if the model is not found

    """
    return validate_model_with_id_exists(await db.get(model_type, model_id), model_type, model_id)


async def db_get_models_with_ids_if_they_exist(
    db: AsyncSession, model_type: type[MT], model_ids: set[int] | set[UUID]
) -> Sequence[MT]:
    """Get model instances with given ids, throwing error if any don't exist.

    Args:
        db: AsyncSession to use for the database query
        model_type: Type of the model instance
        model_ids: IDs that must exist

    Returns:
        Sequence[MT]: The model instances

    Raises:
        ValueError: If any requested ID doesn't exist
    """
    if not hasattr(model_type, "id"):
        err_msg = f"{model_type} does not have an 'id' attribute"
        raise ValueError(err_msg)

    # TODO: Fix typing issues by implementing databasemodel typevar in utils.typing
    statement = select(model_type).where(col(model_type.id).in_(model_ids))
    found_models = (await db.exec(statement)).all()

    if len(found_models) != len(model_ids):
        found_ids: set[int] | set[UUID] = {model.id for model in found_models}
        missing_ids = model_ids - found_ids
        err_msg = f"The following {model_type.get_api_model_name().plural_capital} do not exist: {missing_ids}"
        raise ValueError(err_msg)

    return found_models


def validate_no_duplicate_linked_items(
    new_ids: set[int] | set[UUID], existing_items: Sequence[MT] | None, model_name_plural: str, id_field: str = "id"
) -> None:
    """Validate that no linked items are already assigned.

    Args:
        new_ids: Set of new IDs to validate
        existing_items: Sequence of existing items to check against
        model_name_plural: Name of the item model for error messages
        id_field: Field name for the ID in the model (default: "id")

    Raises:
        ValueError: If any items are duplicates
    """
    if not existing_items:
        err_msg = f"No {model_name_plural.lower()} are assigned"
        raise ValueError()

    existing_ids = {getattr(item, id_field) for item in existing_items}
    duplicates = new_ids & existing_ids
    if duplicates:
        err_msg = f"{model_name_plural} with id {set_to_str(duplicates)} are already assigned"
        raise ValueError(err_msg)


def validate_linked_items_exist(
    item_ids: set[int] | set[UUID], existing_items: Sequence[MT] | None, model_name_plural: str, id_field: str = "id"
) -> None:
    """Validate that all item IDs exist in the given items.

    Args:
        item_ids: IDs to validate
        existing_items: Items to check against
        model_name_plural: Name of the item model for error messages
        id_field: Field name for the ID in the model (default: "id")

    Raises:
        ValueError: If items don't exist or no items are assigned
    """
    if not existing_items:
        err_msg = f"No {model_name_plural.lower()} are assigned"
        raise ValueError(err_msg)

    existing_ids = {getattr(item, id_field) for item in existing_items}
    missing = item_ids - existing_ids
    if missing:
        err_msg = f"{model_name_plural} with id {set_to_str(missing)} not found"
        raise ValueError(err_msg)


### Printing Utilities ###
def set_to_str(set_: set[Any]) -> str:
    """Convert a set of strings to a comma-separated string."""
    return ", ".join(map(str, set_))


def enum_set_to_str(set_: set[ET]) -> str:
    """Convert a set of enum types to a comma-separated string."""
    return ", ".join(str(e.value) for e in set_)


### Parent Type Utilities ###
def get_file_parent_type_model(parent_type: FileParentType | ImageParentType) -> type[CustomBase]:
    """Return the model for the given parent type. Utility function to avoid circular imports."""
    if parent_type == parent_type.PRODUCT:
        return Product
    if parent_type == parent_type.PRODUCT_TYPE:
        return ProductType
    if parent_type == parent_type.MATERIAL:
        return Material
    err_msg = f"Invalid parent type: {parent_type}"
    raise ValueError(err_msg)
