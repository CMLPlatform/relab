"""Unit tests for pure Pydantic schema field mixins."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.api.background_data.schemas import CategoryReadAsSubCategory, ProductTypeRead, TaxonomyRead
from app.api.common.models.enums import Unit
from app.api.common.schemas.associations import MaterialProductLinkCreateWithinProduct
from app.api.common.schemas.base import MaterialRead, ProductRead
from app.api.data_collection.schemas import ProductCreateBaseProduct


@pytest.mark.unit
def test_read_schemas_validate_from_attribute_objects_without_sqlmodel_bases() -> None:
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
        dismantling_notes = None
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


@pytest.mark.unit
def test_product_create_schema_still_validates_end_after_start() -> None:
    """Timestamp validation should now live in schema validation, not the ORM base."""
    with pytest.raises(ValidationError):
        ProductCreateBaseProduct(
            name="Chair",
            dismantling_time_start=datetime(2026, 3, 30, 10, 0, tzinfo=UTC),
            dismantling_time_end=datetime(2026, 3, 30, 9, 0, tzinfo=UTC),
            bill_of_materials=[MaterialProductLinkCreateWithinProduct(material_id=1, quantity=1, unit=Unit.GRAM)],
        )
