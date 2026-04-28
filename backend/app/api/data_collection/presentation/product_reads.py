"""Viewer-aware presentation helpers for product and component read models."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel

from app.api.auth.services.privacy import should_redact_owner_identity
from app.api.common.schemas.base import ComponentRead
from app.api.data_collection.schemas import ComponentReadWithRecursiveComponents

if TYPE_CHECKING:
    from app.api.auth.models import User
    from app.api.data_collection.models.product import Product


def _should_redact_owner(row: Product, viewer: User | None) -> bool:
    """Return whether this row's owner attribution should be hidden."""
    owner = row.owner
    return bool(owner and should_redact_owner_identity(owner, viewer))


def _redact_owner_fields(read_model: BaseModel) -> None:
    """Clear owner fields on a read DTO and any nested component DTOs."""
    if hasattr(read_model, "owner_id"):
        object.__setattr__(read_model, "owner_id", None)
    if hasattr(read_model, "owner_username"):
        object.__setattr__(read_model, "owner_username", None)

    components = getattr(read_model, "components", None)
    if isinstance(components, list):
        for component in components:
            if isinstance(component, BaseModel):
                _redact_owner_fields(component)


def to_read_model[ReadSchemaT: BaseModel](
    row: Product,
    schema: type[ReadSchemaT],
    viewer: User | None,
) -> ReadSchemaT:
    """Validate a product row and apply viewer-aware owner redaction."""
    read_model = schema.model_validate(row)
    if _should_redact_owner(row, viewer):
        _redact_owner_fields(read_model)
    return read_model


def to_product_read[ReadSchemaT: BaseModel](
    row: Product,
    schema: type[ReadSchemaT],
    viewer: User | None,
) -> ReadSchemaT:
    """Validate a base product row with viewer-aware owner redaction."""
    return to_read_model(row, schema, viewer)


def to_product_reads[ReadSchemaT: BaseModel](
    rows: list[Product], schema: type[ReadSchemaT], viewer: User | None
) -> list[ReadSchemaT]:
    """Validate multiple product rows with viewer-aware owner redaction."""
    return [to_product_read(row, schema, viewer) for row in rows]


def to_component_read[ReadSchemaT: BaseModel](
    row: Product, schema: type[ReadSchemaT], viewer: User | None
) -> ReadSchemaT:
    """Validate a component row with viewer-aware owner redaction."""
    return to_read_model(row, schema, viewer)


def to_component_reads[ReadSchemaT: BaseModel](
    rows: list[Product], schema: type[ReadSchemaT], viewer: User | None
) -> list[ReadSchemaT]:
    """Validate multiple component rows with viewer-aware owner redaction."""
    return [to_component_read(row, schema, viewer) for row in rows]


def _promote_to_recursive(
    validated: ComponentRead, components: list[ComponentReadWithRecursiveComponents]
) -> ComponentReadWithRecursiveComponents:
    """Attach pre-built children onto a validated component read model."""
    return ComponentReadWithRecursiveComponents.model_construct(
        **{name: getattr(validated, name) for name in ComponentRead.model_fields},
        components=components,
    )


def render_component_subtree(
    node: Product,
    *,
    children_by_parent_id: dict[int, list[Product]],
    max_depth: int,
    viewer: User | None,
    current_depth: int = 0,
    visited: frozenset[int] | None = None,
) -> list[ComponentReadWithRecursiveComponents]:
    """Serialize child components under ``node`` up to ``max_depth``."""
    if node.id is None or current_depth >= max_depth:
        return []
    visited = (visited or frozenset()) | {node.id}
    return [
        _promote_to_recursive(
            to_component_read(child, ComponentRead, viewer),
            render_component_subtree(
                child,
                children_by_parent_id=children_by_parent_id,
                max_depth=max_depth,
                viewer=viewer,
                current_depth=current_depth + 1,
                visited=visited,
            ),
        )
        for child in children_by_parent_id.get(node.id, [])
        if child.id not in visited
    ]


def render_component_tree(
    roots: list[Product],
    *,
    children_by_parent_id: dict[int, list[Product]],
    max_depth: int,
    viewer: User | None,
    visited: frozenset[int] | None = None,
) -> list[ComponentReadWithRecursiveComponents]:
    """Serialize component roots and their bounded descendants."""
    return [
        _promote_to_recursive(
            to_component_read(root, ComponentRead, viewer),
            render_component_subtree(
                root,
                children_by_parent_id=children_by_parent_id,
                max_depth=max_depth,
                viewer=viewer,
                visited=visited,
            ),
        )
        for root in roots
    ]
