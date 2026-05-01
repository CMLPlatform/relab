"""Unit tests for mutable computed/model properties."""

from __future__ import annotations

import uuid

from app.api.common.models.enums import Unit
from app.api.data_collection.models.product import MaterialProductLink, Product
from tests.factories.models import ProductFactory


def test_physical_properties_volume_tracks_dimension_updates() -> None:
    """Computed volume should not retain stale cached values after mutation."""
    product = ProductFactory.build(height_cm=2, width_cm=3, depth_cm=4, owner_id=uuid.uuid4())

    assert product.volume_cm3 == 24

    product.depth_cm = 5

    assert product.volume_cm3 == 30


def test_product_derived_flags_track_parent_and_component_updates() -> None:
    """Product convenience flags should reflect the current graph state."""
    product = Product(
        id=1,
        name="Chair",
        owner_id=uuid.uuid4(),
        first_image_id=None,
        parent_id=None,
        components=[],
        bill_of_materials=[MaterialProductLink(material_id=1, product_id=1, quantity=1, unit=Unit.GRAM)],
    )

    assert product.is_base_product is True
    assert product.is_leaf_node is True

    product.parent_id = 99
    product.components = [
        Product(
            id=2,
            name="Leg",
            owner_id=uuid.uuid4(),
            first_image_id=None,
            parent_id=1,
            amount_in_parent=1,
            bill_of_materials=[MaterialProductLink(material_id=2, product_id=2, quantity=1, unit=Unit.GRAM)],
        )
    ]

    assert product.is_base_product is False
    assert product.is_leaf_node is False
