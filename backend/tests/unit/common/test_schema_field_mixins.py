"""Unit tests for pure Pydantic schema field mixins."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.api.common.models.enums import Unit
from app.api.common.schemas.associations import MaterialProductLinkCreateWithinProduct
from app.api.common.schemas.base import ComponentRead, MaterialRead, ProductRead
from app.api.data_collection.models.product import Product
from app.api.data_collection.presentation.product_reads import render_component_tree, to_component_read, to_product_read
from app.api.data_collection.schemas import (
    ComponentReadWithRecursiveComponents,
    ComponentReadWithRelationshipsAndFlatComponents,
    ProductCreateBaseProduct,
    ProductReadWithRelationshipsAndFlatComponents,
)
from app.api.reference_data.schemas import CategoryReadAsSubCategory, ProductTypeRead, TaxonomyRead
from tests.factories.models import ProductFactory, UserFactory


def test_read_schemas_validate_from_attribute_objects_without_orm_bases() -> None:
    """Read schemas should validate ORM-like attribute objects via pure Pydantic field mixins."""

    class MaterialRow:
        id = 1
        name = "Steel"
        description = "Alloy"
        source = "DIN"
        density_kg_m3 = 7850.0
        is_crm = False

    class ProductTypeRow:
        id = 2
        name = "Chair"
        description = "Seating"

    class CategoryRow:
        id = 3
        name = "Metals"
        description = "Raw materials"
        external_id = "cat-1"

    class TaxonomyRow:
        id = 4
        name = "Materials"
        version = "2026"
        description = "Taxonomy"
        domains = frozenset({"materials"})
        source = "doi:test"
        created_at = datetime(2026, 3, 30, 10, 11, 12, tzinfo=UTC)
        updated_at = datetime(2026, 3, 30, 10, 12, 13, tzinfo=UTC)

    class ProductRow:
        id = 5
        name = "Office Chair"
        description = "Chair"
        brand = "Brand"
        model = "M1"
        dismantling_time_start = datetime(2026, 3, 29, 10, 11, 12, tzinfo=UTC)
        dismantling_time_end = datetime(2026, 3, 29, 10, 12, 13, tzinfo=UTC)
        owner_id = "4f4b34bc-4b3d-4324-a58f-8fb59428df2a"
        created_at = datetime(2026, 3, 30, 10, 11, 12, tzinfo=UTC)
        updated_at = datetime(2026, 3, 30, 10, 12, 13, tzinfo=UTC)
        product_type_id = 2
        owner_username = "simon"
        thumbnail_url = None
        parent_id = None
        amount_in_parent = None

    assert MaterialRead.model_validate(MaterialRow()).name == "Steel"
    assert ProductTypeRead.model_validate(ProductTypeRow()).name == "Chair"
    assert CategoryReadAsSubCategory.model_validate(CategoryRow()).external_id == "cat-1"
    assert TaxonomyRead.model_validate(TaxonomyRow()).domains == {"materials"}
    assert ProductRead.model_validate(ProductRow()).owner_username == "simon"
    assert "dismantling_notes" not in ProductRead.model_fields


def test_product_read_schema_does_not_apply_privacy_context() -> None:
    """Plain schemas should not know about viewer-aware privacy policy."""
    raw = {
        "id": 1,
        "name": "Office Chair",
        "owner_id": "4f4b34bc-4b3d-4324-a58f-8fb59428df2a",
        "owner_username": "simon",
        "dismantling_time_start": datetime(2026, 3, 29, 10, 11, 12, tzinfo=UTC),
    }

    result = ProductRead.model_validate(raw, context={"redact_owner": True})

    assert str(result.owner_id) == "4f4b34bc-4b3d-4324-a58f-8fb59428df2a"
    assert result.owner_username == "simon"


def test_component_read_schema_does_not_apply_privacy_context() -> None:
    """Component schemas should stay policy-free too."""
    raw = {
        "id": 1,
        "name": "Chair leg",
        "parent_id": 10,
        "amount_in_parent": 4,
        "owner_username": "simon",
        "dismantling_time_start": datetime(2026, 3, 29, 10, 11, 12, tzinfo=UTC),
    }

    result = ComponentRead.model_validate(raw, context={"redact_owner": True})
    assert result.owner_username == "simon"


def _make_product_row(*, visibility: str = "public") -> Product:
    owner = UserFactory.build(preferences={"profile_visibility": visibility}, username="simon")
    return ProductFactory.build(owner=owner, owner_id=owner.id, name="Office Chair")


def test_product_read_presenter_redacts_when_viewer_is_guest_on_community_profile() -> None:
    """Presenter computes redaction from the explicit viewer and hides owner fields."""
    row = _make_product_row(visibility="community")
    result = to_product_read(row, ProductRead, viewer=None)

    assert result.owner_id is None
    assert result.owner_username is None


def test_product_read_presenter_preserves_identity_for_owner() -> None:
    """Owners see their own identity on private profiles."""
    row = _make_product_row(visibility="private")
    assert row.owner is not None
    viewer = UserFactory.build(id=row.owner.id)
    result = to_product_read(row, ProductRead, viewer)

    assert result.owner_username == "simon"


def test_product_read_presenter_preserves_identity_for_public_profile() -> None:
    """Public profiles never redact regardless of viewer."""
    row = _make_product_row(visibility="public")
    result = to_product_read(row, ProductRead, viewer=None)

    assert result.owner_username == "simon"


def test_product_read_presenter_redacts_flat_components() -> None:
    """Presenter redaction should include nested flat component lists."""
    owner = UserFactory.build(preferences={"profile_visibility": "private"}, username="simon")
    component = ProductFactory.build(
        id=2,
        owner=owner,
        owner_id=owner.id,
        parent_id=1,
        amount_in_parent=1,
        name="Chair leg",
    )
    row = ProductFactory.build(id=1, owner=owner, owner_id=owner.id, name="Office Chair", components=[component])

    result = to_product_read(row, ProductReadWithRelationshipsAndFlatComponents, viewer=None)

    assert result.owner_id is None
    assert result.owner_username is None
    assert result.components[0].owner_username is None


def test_component_read_presenter_redacts_flat_components() -> None:
    """Component detail payloads can also contain child components."""
    owner = UserFactory.build(preferences={"profile_visibility": "private"}, username="simon")
    child = ProductFactory.build(
        id=3,
        owner=owner,
        owner_id=owner.id,
        parent_id=2,
        amount_in_parent=1,
        name="Screw",
    )
    component = ProductFactory.build(
        id=2,
        owner=owner,
        owner_id=owner.id,
        parent_id=1,
        amount_in_parent=1,
        name="Chair leg",
        components=[child],
    )

    result = to_component_read(component, ComponentReadWithRelationshipsAndFlatComponents, viewer=None)

    assert result.owner_username is None
    assert result.components[0].owner_username is None


def test_component_tree_renderer_redacts_recursive_components() -> None:
    """Recursive tree rendering should redact every component node."""
    owner = UserFactory.build(preferences={"profile_visibility": "private"}, username="simon")
    root = ProductFactory.build(id=2, owner=owner, owner_id=owner.id, parent_id=1, amount_in_parent=1, name="Leg")
    child = ProductFactory.build(id=3, owner=owner, owner_id=owner.id, parent_id=2, amount_in_parent=4, name="Screw")

    result = render_component_tree(
        [root],
        children_by_parent_id={2: [child]},
        max_depth=1,
        viewer=None,
    )

    assert isinstance(result[0], ComponentReadWithRecursiveComponents)
    assert result[0].owner_username is None
    assert result[0].components[0].owner_username is None


def test_product_create_schema_still_validates_end_after_start() -> None:
    """Timestamp validation should now live in schema validation, not the ORM base."""
    with pytest.raises(ValidationError):
        ProductCreateBaseProduct(
            name="Chair",
            dismantling_time_start=datetime(2026, 3, 30, 10, 0, tzinfo=UTC),
            dismantling_time_end=datetime(2026, 3, 30, 9, 0, tzinfo=UTC),
            bill_of_materials=[MaterialProductLinkCreateWithinProduct(material_id=1, quantity=1, unit=Unit.GRAM)],
        )
