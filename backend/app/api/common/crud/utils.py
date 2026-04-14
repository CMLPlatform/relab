"""Common non-query utility functions for CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from app.api.common.crud.exceptions import (
    LinkedItemsAlreadyAssignedError,
    LinkedItemsMissingError,
    ModelNotFoundError,
    NoLinkedItemsError,
)
from app.api.common.models.custom_types import ET, IDT, MT

if TYPE_CHECKING:
    from collections.abc import Sequence
    from uuid import UUID


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
