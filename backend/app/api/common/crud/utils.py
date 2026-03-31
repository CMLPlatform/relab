"""Common utility functions for CRUD operations."""
# spell-checker: disable joinedload

from enum import StrEnum
from typing import TYPE_CHECKING, Any, cast

from pydantic import BaseModel
from sqlalchemy import inspect
from sqlalchemy.orm import joinedload, noload, selectinload
from sqlalchemy.orm.attributes import QueryableAttribute
from sqlmodel import SQLModel, col, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from app.api.background_data.models import Material, ProductType
from app.api.common.crud.exceptions import (
    CRUDConfigurationError,
    LinkedItemsAlreadyAssignedError,
    LinkedItemsMissingError,
    ModelNotFoundError,
    ModelsNotFoundError,
    NoLinkedItemsError,
)
from app.api.common.exceptions import BadRequestError
from app.api.common.models.custom_types import ET, IDT, MT
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import MediaParentType

if TYPE_CHECKING:
    from collections.abc import Sequence
    from uuid import UUID


### SQLALchemy Select Utilities ###
class RelationshipLoadStrategy(StrEnum):
    """Loading strategies for relationships in SQLAlchemy queries."""

    SELECTIN = "selectin"
    JOINED = "joined"


def _get_model_relationships(model: type[MT]) -> dict[str, tuple[QueryableAttribute[Any], bool]]:
    """Get all relationships from a model with their collection status.

    Args:
        model: The model class to inspect

    Returns:
        dict: {relationship_name: (relationship_attribute, is_collection)}
    """
    mapper = inspect(model)
    if not mapper:
        return {}

    relationships: dict[str, tuple[QueryableAttribute[Any], bool]] = {}
    for rel in mapper.relationships:
        relationships[rel.key] = (cast("QueryableAttribute[Any]", getattr(model, rel.key)), rel.uselist)

    return relationships


def add_relationship_options(
    statement: SelectOfScalar,
    model: type[MT],
    include: set[str] | None = None,
    *,
    read_schema: type[BaseModel] | None = None,
    load_strategy: RelationshipLoadStrategy = RelationshipLoadStrategy.SELECTIN,
) -> SelectOfScalar:
    """Add eager loading options for relationships.

    Args:
        statement: SQLAlchemy select statement
        model: Model class to load relationships for
        include: Set of relationship names to eagerly load
        read_schema: Optional schema to filter relationships
        load_strategy: Strategy for loading (selectin or joined)

    """
    all_db_rels = _get_model_relationships(model)

    in_scope_rel_names = (
        {name for name in all_db_rels if name in read_schema.model_fields} if read_schema else set(all_db_rels.keys())
    )

    to_include = (set(include) if include else set()) & in_scope_rel_names

    for rel_name in to_include:
        rel_attr = all_db_rels[rel_name][0]
        option = joinedload(rel_attr) if load_strategy == RelationshipLoadStrategy.JOINED else selectinload(rel_attr)
        statement = statement.options(option)

    if read_schema is not None:
        for rel_name in in_scope_rel_names - to_include:
            rel_attr = all_db_rels[rel_name][0]
            statement = statement.options(noload(rel_attr))

    return statement


### Error Handling Utilities ###
def ensure_model_exists(db_result: MT | None, model_type: type[MT], model_id: IDT) -> MT:
    """Ensure a model with a given ID exists, providing type-safe return.

    Args:
        db_result: Model instance from database query (may be None)
        model_type: Type of the model class
        model_id: ID that was queried

    Returns:
        MT: The model instance with guaranteed ID

    Raises:
        ModelNotFoundError: If model instance is None
    """
    if not db_result:
        raise ModelNotFoundError(model_type, model_id)
    return cast("MT", db_result)


async def get_model_or_404(db: AsyncSession, model_type: type[MT], model_id: IDT) -> MT:
    """Get a model by ID or raise 404 error.

    Args:
        db: AsyncSession for database operations
        model_type: Type of the model class
        model_id: ID to fetch

    Returns:
        MT: The model instance with guaranteed ID

    Raises:
        ModelNotFoundError: If the model is not found
    """
    result = await db.get(model_type, model_id)
    return ensure_model_exists(result, model_type, model_id)


async def get_models_by_ids_or_404(db: AsyncSession, model_type: type[MT], model_ids: set[int] | set[UUID]) -> list[MT]:
    """Get multiple models by IDs, raising error if any don't exist.

    Args:
        db: AsyncSession for database operations
        model_type: Type of the model class
        model_ids: Set of IDs that must all exist

    Returns:
        list[MT]: The model instances with guaranteed IDs

    Raises:
        CRUDConfigurationError: If model type doesn't have an id field
        ModelsNotFoundError: If any requested ID doesn't exist
    """
    if not hasattr(model_type, "id"):
        err_msg = f"{model_type} does not have an 'id' attribute"
        raise CRUDConfigurationError(err_msg)

    statement = select(model_type).where(col(model_type.id).in_(model_ids))
    found_models: list[MT] = list((await db.exec(statement)).all())

    if len(found_models) != len(model_ids):
        found_ids: set[int | UUID] = {cast("int | UUID", model.__dict__["id"]) for model in found_models}
        missing_ids = cast("set[int | UUID]", model_ids) - found_ids
        raise ModelsNotFoundError(model_type, missing_ids)

    return found_models


### Linked Item Validation ###
def validate_linked_items(
    item_ids: set[int] | set[UUID],
    existing_items: Sequence[Any] | None,
    model_name_plural: str,
    *,
    id_attr: str = "id",
    check_duplicates: bool = True,
    check_existence: bool = True,
) -> None:
    """Validate linked items for both duplicates and existence.

    Args:
        item_ids: Set of IDs to validate
        existing_items: Sequence of existing items to check against
        model_name_plural: Name of the item model for error messages
        id_attr: Attribute name to read the ID from each item (default ``"id"``)
        check_duplicates: Whether to check if items are already assigned
        check_existence: Whether to check if items exist in the list

    Raises:
        NoLinkedItemsError: If no items exist
        LinkedItemsAlreadyAssignedError: If items are duplicates
        LinkedItemsMissingError: If items don't exist
    """
    if not existing_items:
        raise NoLinkedItemsError(model_name_plural)

    existing_ids = {getattr(item, id_attr) for item in existing_items}

    if check_duplicates:
        duplicates = item_ids & existing_ids
        if duplicates:
            raise LinkedItemsAlreadyAssignedError(model_name_plural, duplicates)

    if check_existence:
        missing = item_ids - existing_ids
        if missing:
            raise LinkedItemsMissingError(model_name_plural, missing)


### Formatting Utilities ###
def format_id_set(id_set: set[Any]) -> str:
    """Format a set of IDs as a comma-separated string."""
    return ", ".join(map(str, sorted(id_set)))


def enum_format_id_set(enum_set: set[ET]) -> str:
    """Format a set of enum values as a comma-separated string."""
    return ", ".join(str(e.value) for e in sorted(enum_set, key=lambda x: x.value))


### Parent Type Utilities ###
def get_file_parent_type_model(parent_type: MediaParentType) -> type[SQLModel]:
    """Return the model for the given parent type. Utility function to avoid circular imports."""
    if parent_type == parent_type.PRODUCT:
        return Product
    if parent_type == parent_type.PRODUCT_TYPE:
        return ProductType
    if parent_type == parent_type.MATERIAL:
        return Material
    err_msg = f"Invalid parent type: {parent_type}"
    raise BadRequestError(err_msg)


### Backward Compatibility (Refactored) ###
# The previous aliases were removed in favor of using the base functions directly.
# The following helpers are kept for readability but simplified.


def validate_no_duplicate_linked_items(
    new_ids: set[int] | set[UUID],
    existing_items: Sequence[Any] | None,
    model_name_plural: str,
    *,
    id_attr: str = "id",
) -> None:
    """Validate that new items are not already in the existing items list."""
    validate_linked_items(
        new_ids,
        existing_items,
        model_name_plural,
        id_attr=id_attr,
        check_duplicates=True,
        check_existence=False,
    )


def validate_linked_items_exist(
    item_ids: set[int] | set[UUID],
    existing_items: Sequence[Any] | None,
    model_name_plural: str,
    *,
    id_attr: str = "id",
) -> None:
    """Validate that all item_ids are present in existing_items."""
    validate_linked_items(
        item_ids,
        existing_items,
        model_name_plural,
        id_attr=id_attr,
        check_duplicates=False,
        check_existence=True,
    )
