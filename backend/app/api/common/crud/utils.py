"""Common utility functions for CRUD operations."""

from enum import StrEnum
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel
from sqlalchemy import inspect
from sqlalchemy.orm import InspectionAttr, joinedload, noload, selectinload
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from app.api.background_data.models import Material, ProductType
from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.models.base import CustomBase
from app.api.common.models.custom_types import ET, IDT, MT, FetchedModelT, HasID
from app.api.data_collection.models import Product
from app.api.file_storage.models.models import FileParentType, ImageParentType

if TYPE_CHECKING:
    from collections.abc import Sequence
    from uuid import UUID


### SQLALchemy Select Utilities ###
class RelationshipLoadStrategy(StrEnum):
    """Loading strategies for relationships in SQLAlchemy queries."""

    SELECTIN = "selectin"
    JOINED = "joined"


def _get_model_relationships(model: type[MT]) -> dict[str, tuple[InspectionAttr, bool]]:
    """Get all relationships from a model with their collection status.

    Args:
        model: The model class to inspect

    Returns:
        dict: {relationship_name: (relationship_attribute, is_collection)}
    """
    mapper = inspect(model)
    if not mapper:
        return {}

    relationships: dict[str, tuple[InspectionAttr, bool]] = {}
    for rel in mapper.relationships:
        relationships[rel.key] = (getattr(model, rel.key), rel.uselist)

    return relationships


def add_relationship_options(
    statement: SelectOfScalar,
    model: type[MT],
    include: set[str] | None = None,
    *,
    read_schema: type[BaseModel] | None = None,
    load_strategy: RelationshipLoadStrategy = RelationshipLoadStrategy.SELECTIN,
) -> tuple[SelectOfScalar, set[str]]:
    """Add eager loading options for relationships and return unloaded relationship names.

    Args:
        statement: SQLAlchemy select statement
        model: Model class to load relationships for
        include: Set of relationship names to eagerly load
        read_schema: Optional schema to filter relationships
        load_strategy: Strategy for loading (selectin or joined)

    Returns:
        tuple: (modified statement, set of excluded relationship names)
    """
    # Get all relationships from the model
    all_db_rels = _get_model_relationships(model)

    # Determine which relationships are in scope (db ∩ schema)
    in_scope_rel_names = (
        {name for name in all_db_rels if name in read_schema.model_fields} if read_schema else set(all_db_rels.keys())
    )

    # Valid relationships to include (user_input ∩ in_scope)
    to_include = (set(include) if include else set()) & in_scope_rel_names

    # Add eager loading for included relationships
    for rel_name in to_include:
        rel_attr = all_db_rels[rel_name][0]
        option = joinedload(rel_attr) if load_strategy == RelationshipLoadStrategy.JOINED else selectinload(rel_attr)
        statement = statement.options(option)

    # Apply noload for excluded relationships so serializers don't trigger lazy loads
    # and endpoints that don't request a relation still return stable empty/null values.
    relationships_to_exclude = in_scope_rel_names - to_include
    for rel_name in relationships_to_exclude:
        rel_attr = all_db_rels[rel_name][0]
        statement = statement.options(noload(rel_attr))

    return statement, relationships_to_exclude


def clear_unloaded_relationships[T](
    results: T,
    relationships_to_clear: set[str],
    db: AsyncSession | None = None,
) -> T:
    """Compatibility hook for historical call sites.

    Relationship suppression is now handled at query time by `add_relationship_options`
    via `noload`, so no post-query mutation is needed here.
    """
    del relationships_to_clear, db
    return results


### Error Handling Utilities ###
def ensure_model_exists(db_result: MT | None, model_type: type[MT], model_id: IDT) -> FetchedModelT:
    """Ensure a model with a given ID exists, providing type-safe return.

    Args:
        db_result: Model instance from database query (may be None)
        model_type: Type of the model class
        model_id: ID that was queried

    Returns:
        FetchedModelT: The model instance with guaranteed ID

    Raises:
        ModelNotFoundError: If model instance is None
    """
    if not db_result:
        raise ModelNotFoundError(model_type, model_id)
    # Type casting: after validation, we know the model exists and has an ID
    return db_result  # type: ignore[return-value]


async def get_model_or_404(db: AsyncSession, model_type: type[MT], model_id: IDT) -> FetchedModelT:
    """Get a model by ID or raise 404 error.

    Args:
        db: AsyncSession for database operations
        model_type: Type of the model class
        model_id: ID to fetch

    Returns:
        FetchedModelT: The model instance with guaranteed ID

    Raises:
        ModelNotFoundError: If the model is not found
    """
    result = await db.get(model_type, model_id)
    return ensure_model_exists(result, model_type, model_id)


async def get_models_by_ids_or_404(
    db: AsyncSession, model_type: type[MT], model_ids: set[int] | set[UUID]
) -> list[FetchedModelT]:
    """Get multiple models by IDs, raising error if any don't exist.

    Args:
        db: AsyncSession for database operations
        model_type: Type of the model class
        model_ids: Set of IDs that must all exist

    Returns:
        list[FetchedModelT]: The model instances with guaranteed IDs

    Raises:
        ValueError: If model type doesn't have an id field
        ValueError: If any requested ID doesn't exist
    """
    if not hasattr(model_type, "id"):
        err_msg = f"{model_type} does not have an 'id' attribute"
        raise ValueError(err_msg)

    statement = select(model_type).where(col(model_type.id).in_(model_ids))
    found_models = list((await db.exec(statement)).all())

    if len(found_models) != len(model_ids):
        found_ids: set[int] | set[UUID] = {model.id for model in found_models}
        missing_ids = model_ids - found_ids
        model_name = model_type.get_api_model_name().plural_capital
        err_msg = f"The following {model_name} do not exist: {format_id_set(missing_ids)}"
        raise ValueError(err_msg)

    return found_models


### Linked Item Validation ###
def validate_linked_items(
    item_ids: set[int] | set[UUID],
    existing_items: Sequence[HasID] | None,
    model_name_plural: str,
    *,
    check_duplicates: bool = True,
    check_existence: bool = True,
    id_field: str = "id",
) -> None:
    """Validate linked items for both duplicates and existence.

    Args:
        item_ids: Set of IDs to validate
        existing_items: Sequence of existing items to check against
        model_name_plural: Name of the item model for error messages
        check_duplicates: Whether to check if items are already assigned
        check_existence: Whether to check if items exist in the list
        id_field: Field name for the ID in the model (default: "id")

    Raises:
        ValueError: If no items exist, items are duplicates, or items don't exist
    """
    if not existing_items:
        err_msg = f"No {model_name_plural.lower()} are assigned"
        raise ValueError(err_msg)

    existing_ids = {getattr(item, id_field) for item in existing_items}

    if check_duplicates:
        duplicates = item_ids & existing_ids
        if duplicates:
            err_msg = f"{model_name_plural} with id {format_id_set(duplicates)} are already assigned"
            raise ValueError(err_msg)

    if check_existence:
        missing = item_ids - existing_ids
        if missing:
            err_msg = f"{model_name_plural} with id {format_id_set(missing)} not found"
            raise ValueError(err_msg)


### Formatting Utilities ###
def format_id_set(id_set: set[Any]) -> str:
    """Format a set of IDs as a comma-separated string."""
    return ", ".join(map(str, sorted(id_set)))


def format_enum_set(enum_set: set[ET]) -> str:
    """Format a set of enum values as a comma-separated string."""
    return ", ".join(str(e.value) for e in sorted(enum_set, key=lambda x: x.value))


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


### Backward Compatibility Aliases ###
# These aliases maintain backward compatibility with existing code
# NOTE: Consider migrating to new function names in future refactorings
db_get_model_with_id_if_it_exists = get_model_or_404
db_get_models_with_ids_if_they_exist = get_models_by_ids_or_404
set_to_str = format_id_set
enum_set_to_str = format_enum_set


def validate_no_duplicate_linked_items(
    new_ids: set[int] | set[UUID],
    existing_items: Sequence[HasID] | None,
    model_name_plural: str,
    id_field: str = "id",
) -> None:
    """Deprecated: Use validate_linked_items with check_duplicates=True instead."""
    validate_linked_items(
        new_ids,
        existing_items,
        model_name_plural,
        check_duplicates=True,
        check_existence=False,
        id_field=id_field,
    )


def validate_linked_items_exist(
    item_ids: set[int] | set[UUID],
    existing_items: Sequence[HasID] | None,
    model_name_plural: str,
    id_field: str = "id",
) -> None:
    """Deprecated: Use validate_linked_items with check_existence=True instead."""
    validate_linked_items(
        item_ids,
        existing_items,
        model_name_plural,
        check_duplicates=False,
        check_existence=True,
        id_field=id_field,
    )
