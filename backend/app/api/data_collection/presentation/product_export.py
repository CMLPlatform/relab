"""Product export: whole product trees as nested JSON read models or flat CSV rows."""

import csv
import io
from typing import TYPE_CHECKING, Any
from urllib.parse import urljoin

from app.api.data_collection.presentation.product_reads import to_read_model
from app.api.data_collection.schemas import (
    ComponentExportRead,
    ComponentReadWithRelationships,
    ProductExportRead,
    ProductReadWithRelationships,
)
from app.core.config.core import settings

if TYPE_CHECKING:
    from collections.abc import Iterator, Sequence

    from app.api.auth.models import User
    from app.api.data_collection.models.product import Product

# Mirrors the records table of the dataset release (backend/scripts/build_dataset_release.py,
# RECORDS_SCHEMA) where a field exists in both. The release pseudonymises owners; an export
# shows the username the product page shows. product_type_name and image_urls stand in for
# the release's reference tables and image folder.
CSV_COLUMNS: tuple[str, ...] = (
    "id",
    "parent_id",
    "amount_in_parent",
    "owner_username",
    "name",
    "description",
    "brand",
    "model",
    "product_type_id",
    "product_type_name",
    "weight_g",
    "height_cm",
    "width_cm",
    "depth_cm",
    "volume_cm3",
    "circularity_properties",
    "created_at",
    "updated_at",
    "image_urls",
)


# Leading characters a spreadsheet reads as a formula (OWASP ASVS 5.0 V1.2.10, CSV injection).
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value: object) -> object:
    """Prefix user text a spreadsheet would evaluate with a quote so it stays text."""
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return f"'{value}"
    return value


def _components(
    node: Product, children_by_parent_id: dict[int, list[Product]], viewer: User | None
) -> list[ComponentExportRead]:
    return [
        ComponentExportRead.model_construct(
            **dict(to_read_model(child, ComponentReadWithRelationships, viewer)),
            components=_components(child, children_by_parent_id, viewer),
        )
        for child in children_by_parent_id.get(node.id, [])
    ]


def build_product_exports(
    roots: Sequence[Product], children_by_parent_id: dict[int, list[Product]], viewer: User | None
) -> list[ProductExportRead]:
    """Assemble each base product with its whole component tree, owner redaction applied per row."""
    return [
        ProductExportRead.model_construct(
            **dict(to_read_model(root, ProductReadWithRelationships, viewer)),
            components=_components(root, children_by_parent_id, viewer),
        )
        for root in roots
    ]


def _absolute_url(url: str) -> str:
    """Resolve an API-relative media URL against the public API origin; absolute URLs pass through."""
    return urljoin(f"{str(settings.api_public_url).rstrip('/')}/", url)


def _csv_rows(node: ProductExportRead | ComponentExportRead) -> Iterator[dict[str, Any]]:
    """Yield one row for ``node`` and then one per component below it, depth first."""
    circularity = node.circularity_properties
    yield {
        "id": node.id,
        "parent_id": getattr(node, "parent_id", None),
        "amount_in_parent": getattr(node, "amount_in_parent", None),
        "owner_username": node.owner_username,
        "name": node.name,
        "description": node.description,
        "brand": node.brand,
        "model": node.model,
        "product_type_id": node.product_type_id,
        "product_type_name": node.product_type.name if node.product_type else None,
        "weight_g": node.weight_g,
        "height_cm": node.height_cm,
        "width_cm": node.width_cm,
        "depth_cm": node.depth_cm,
        "volume_cm3": node.volume_cm3,
        "circularity_properties": circularity.model_dump_json(exclude_none=True) if circularity else None,
        "created_at": node.created_at.isoformat() if node.created_at else None,
        "updated_at": node.updated_at.isoformat() if node.updated_at else None,
        # Space-separated: stored URLs are percent-encoded, so they never contain a space.
        "image_urls": " ".join(_absolute_url(image.image_url) for image in node.images if image.image_url),
    }
    for component in node.components:
        yield from _csv_rows(component)


def render_products_csv(products: Sequence[ProductExportRead]) -> str:
    """Render product exports as CSV, one row per product or component."""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for product in products:
        writer.writerows({key: _csv_safe(value) for key, value in row.items()} for row in _csv_rows(product))
    return buffer.getvalue()
