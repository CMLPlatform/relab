"""Viewer-aware presentation helpers for product and component read models."""

from typing import TYPE_CHECKING

from pydantic import BaseModel

from app.api.auth.services.privacy import should_redact_owner_identity
from app.api.data_collection.schemas import ComponentRead, ComponentReadWithRecursiveComponents

if TYPE_CHECKING:
    from app.api.auth.models import User
    from app.api.data_collection.models.product import Product


def _should_redact_owner(row: Product, viewer: User | None) -> bool:
    """Return whether this row's owner attribution should be hidden."""
    # NOTE: the product/component content itself is intentionally public regardless
    # of this result — profile_visibility hides owner identity only, never the
    # research data. See .github/SECURITY.md.
    owner = row.owner
    return bool(owner and should_redact_owner_identity(owner, viewer))


OWNER_FIELD_PREFIX = "owner"


def _redact_owner_fields(read_model: BaseModel) -> None:
    """Clear every owner-attribution field on a read DTO and its nested components.

    Fields are discovered from the schema rather than named here, so a new
    ``owner_*`` field is redacted by default instead of leaking until someone
    remembers to update this function.
    """
    for field_name in type(read_model).model_fields:
        if field_name == OWNER_FIELD_PREFIX or field_name.startswith(f"{OWNER_FIELD_PREFIX}_"):
            object.__setattr__(read_model, field_name, None)

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
            to_read_model(child, ComponentRead, viewer),
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
            to_read_model(root, ComponentRead, viewer),
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
