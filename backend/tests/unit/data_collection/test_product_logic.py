"""Unit tests for product model logic."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from tests.factories.models import MaterialProductLinkFactory, ProductFactory

# Constants for test values to avoid magic value warnings
AMOUNT_IN_PARENT_5 = 5
ERR_MIN_CONTENT = "must have at least one material or one component"
ERR_MISSING_AMOUNT = "must have amount_in_parent set"


@pytest.mark.unit
class TestProductLogic:
    """Tests for product model business logic like cycle detection and validation."""

    def test_thumbnail_url_uses_first_image_id(self) -> None:
        """Test that thumbnail_url is derived from the mapped first image ID."""
        product = ProductFactory.build(id=1, owner_id=uuid4(), bill_of_materials=[MaterialProductLinkFactory.build()])
        first_image_id = UUID("12345678-1234-5678-1234-567812345678")
        object.__setattr__(product, "first_image_id", first_image_id)

        assert product.thumbnail_url == f"/images/{first_image_id}/resized?width=200"

    def test_thumbnail_url_is_none_without_first_image_id(self) -> None:
        """Test that thumbnail_url is None when no first image is available."""
        product = ProductFactory.build(id=1, owner_id=uuid4(), bill_of_materials=[MaterialProductLinkFactory.build()])
        object.__setattr__(product, "first_image_id", None)

        assert product.thumbnail_url is None

    def test_has_cycles_no_cycle(self) -> None:
        """Test that a valid tree has no cycles."""
        # A -> B -> C
        c = ProductFactory.build(id=uuid4(), components=[])
        b = ProductFactory.build(id=uuid4(), components=[c])
        a = ProductFactory.build(id=uuid4(), components=[b])

        assert a.has_cycles() is False

    def test_has_cycles_direct_cycle(self) -> None:
        """Test detection of a product containing itself."""
        a = ProductFactory.build(id=uuid4())
        a.components = [a]  # Direct cycle

        assert a.has_cycles() is True

    def test_has_cycles_indirect_cycle(self) -> None:
        """Test detection of an indirect cycle A -> B -> A."""
        a = ProductFactory.build(id=uuid4())
        b = ProductFactory.build(id=uuid4(), components=[a])
        a.components = [b]

        assert a.has_cycles() is True

    def test_components_resolve_to_materials_valid(self) -> None:
        """Test that validation passes when all leaves have materials."""
        # A -> B (Material)
        #   -> C (Material)

        # Leaf B
        link_b = MaterialProductLinkFactory.build()
        b = ProductFactory.build(id=uuid4(), components=[], bill_of_materials=[link_b])

        # Leaf C
        link_c = MaterialProductLinkFactory.build()
        c = ProductFactory.build(id=uuid4(), components=[], bill_of_materials=[link_c])

        # Root A
        a = ProductFactory.build(id=uuid4(), components=[b, c])

        assert a.components_resolve_to_materials() is True

    def test_components_resolve_to_materials_invalid(self) -> None:
        """Test that validation fails when a leaf has no materials."""
        # A -> B (No Material)

        b = ProductFactory.build(id=uuid4(), components=[], bill_of_materials=[])
        a = ProductFactory.build(id=uuid4(), components=[b])

        assert a.components_resolve_to_materials() is False

    def test_validate_product_base_valid(self) -> None:
        """Test validation of a valid base product."""
        # Base product (no parent_id) must have content
        link = MaterialProductLinkFactory.build()

        # Should not raise
        p = ProductFactory.build(
            name="Valid Base", owner_id=uuid4(), bill_of_materials=[link], parent_id=None, amount_in_parent=None
        )
        p.validate_product()

    def test_validate_product_base_invalid_no_content(self) -> None:
        """Test validation fails for base product with no content."""
        p = ProductFactory.build(
            name="Empty Base",
            owner_id=uuid4(),
            bill_of_materials=[],
            components=[],
            parent_id=None,
            amount_in_parent=None,
        )

        with pytest.raises(ValueError, match=ERR_MIN_CONTENT) as exc:
            p.validate_product()
        assert ERR_MIN_CONTENT in str(exc.value)

    def test_validate_product_intermediate_valid(self) -> None:
        """Test validation of a valid intermediate product."""
        link = MaterialProductLinkFactory.build()

        # Intermediate product
        p = ProductFactory.build(
            name="Valid Intermediate",
            owner_id=uuid4(),
            bill_of_materials=[link],
            parent_id=uuid4(),  # Has parent
            amount_in_parent=AMOUNT_IN_PARENT_5,
        )
        p.validate_product()

    def test_validate_product_intermediate_missing_amount(self) -> None:
        """Test validation fails for intermediate product without amount."""
        link = MaterialProductLinkFactory.build()

        p = ProductFactory.build(
            name="No Amount Intermediate",
            owner_id=uuid4(),
            bill_of_materials=[link],
            parent_id=uuid4(),
            amount_in_parent=None,  # Missing
        )

        with pytest.raises(ValueError, match=ERR_MISSING_AMOUNT) as exc:
            p.validate_product()
        assert ERR_MISSING_AMOUNT in str(exc.value)

    def test_validate_cycle_detection_on_init(self) -> None:
        """Test that cycles are detected during validation."""
        a = ProductFactory.build(id=uuid4())
        a.components = [a]

        with pytest.raises(ValueError, match="Cycle detected"):
            a.validate_product()
