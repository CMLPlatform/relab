"""Integration tests for data_collection model persistence and relationships."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from sqlalchemy import insert
from sqlalchemy.exc import IntegrityError

from app.api.data_collection.models.product import Product
from tests.factories.models import MaterialFactory, ProductFactory

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.api.auth.models import User


@pytest.mark.integration
class TestProductModelPersistence:
    """Tests for persisting Product model to database."""

    @pytest.mark.asyncio
    async def test_create_product_with_required_fields(self, session: AsyncSession, superuser: User) -> None:
        """Verify id and timestamps are auto-populated on product creation."""
        product = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Test Product",
            product_type_id=None,
        )
        await session.refresh(product)

        assert product.id is not None
        assert product.name == "Test Product"
        assert product.owner_id == superuser.id
        assert product.created_at is not None
        assert product.updated_at is not None

    @pytest.mark.asyncio
    async def test_product_requires_owner(self, session: AsyncSession) -> None:
        """Verify owner_id is required via FK constraint."""
        # Try to create product without owner
        with pytest.raises(IntegrityError):
            await session.exec(insert(Product).values(name="Orphan Product", owner_id=None))


@pytest.mark.integration
class TestProductHierarchy:
    """Tests for product parent-child relationships."""

    @pytest.mark.asyncio
    async def test_create_base_product_without_parent(self, session: AsyncSession, superuser: User) -> None:
        """Create a leaf product without parent."""
        product = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Base Product",
            parent_id=None,
            product_type_id=None,
        )
        await session.refresh(product)

        assert product.parent_id is None
        assert product.is_base_product is True

    @pytest.mark.asyncio
    async def test_create_component_with_parent(self, session: AsyncSession, superuser: User) -> None:
        """Create a component product with parent_id."""
        parent = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Parent Product",
            parent_id=None,
            product_type_id=None,
        )
        component = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Component",
            parent_id=parent.id,
            amount_in_parent=2,
            product_type_id=None,
        )
        await session.refresh(component)

        assert component.parent_id == parent.id
        assert component.amount_in_parent == 2
        assert component.is_base_product is False

    @pytest.mark.asyncio
    async def test_parent_relationship_accessible(self, session: AsyncSession, superuser: User) -> None:
        """Parent product can be accessed from component."""
        parent = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Parent",
            parent_id=None,
            product_type_id=None,
        )
        component = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Component",
            parent_id=parent.id,
            product_type_id=None,
        )
        await session.refresh(component)

        assert component.parent is not None
        assert component.parent.name == "Parent"

    @pytest.mark.asyncio
    async def test_product_hierarchy_depth(self, session: AsyncSession, superuser: User) -> None:
        """Create multi-level product hierarchy."""
        # Create 3-level hierarchy: base -> component -> sub-component
        base = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Base",
            parent_id=None,
            product_type_id=None,
        )
        component = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Component",
            parent_id=base.id,
            amount_in_parent=1,
            product_type_id=None,
        )
        subcomponent = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="SubComponent",
            parent_id=component.id,
            amount_in_parent=2,
            product_type_id=None,
        )
        await session.refresh(base)
        await session.refresh(component)
        await session.refresh(subcomponent)

        # Verify hierarchy
        assert subcomponent.parent_id == component.id
        assert component.parent_id == base.id
        assert base.parent_id is None


@pytest.mark.integration
class TestProductBillOfMaterials:
    """Tests for product bill of materials relationships."""

    @pytest.mark.asyncio
    async def test_product_with_bill_of_materials(self, session: AsyncSession, superuser: User) -> None:
        """Create product with materials list."""
        await MaterialFactory.create_async(session, name="Steel")
        product = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Product with BOM",
            bill_of_materials=[],
            product_type_id=None,
        )
        await session.refresh(product)

        # Verify BOM is empty initially
        assert product.bill_of_materials is not None
        assert len(product.bill_of_materials) == 0

    @pytest.mark.asyncio
    async def test_product_owner_relationship(self, session: AsyncSession, superuser: User) -> None:
        """Product owner relationship is accessible."""
        product = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Owned Product",
            product_type_id=None,
        )
        await session.refresh(product)

        assert product.owner is not None
        assert product.owner.id == superuser.id

    @pytest.mark.asyncio
    async def test_multiple_products_per_owner(self, session: AsyncSession, superuser: User) -> None:
        """Create multiple products with same owner."""
        product1 = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Product 1",
            product_type_id=None,
        )
        product2 = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Product 2",
            product_type_id=None,
        )
        await session.refresh(product1)
        await session.refresh(product2)

        assert product1.owner_id == superuser.id
        assert product2.owner_id == superuser.id
        assert product1.id != product2.id


@pytest.mark.integration
class TestProductPhysicalProperties:
    """Tests for product physical property fields."""

    @pytest.mark.asyncio
    async def test_product_physical_dimensions_stored(self, session: AsyncSession, superuser: User) -> None:
        """Physical dimensions are stored and retrieved."""
        product = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Product with Dimensions",
            weight_g=1500,
            height_cm=10.0,
            width_cm=20.0,
            depth_cm=5.0,
            product_type_id=None,
        )
        await session.refresh(product)

        assert product.weight_g == 1500
        assert product.height_cm == 10.0
        assert product.width_cm == 20.0
        assert product.depth_cm == 5.0

    @pytest.mark.asyncio
    async def test_product_optional_physical_properties(self, session: AsyncSession, superuser: User) -> None:
        """Physical properties can be None."""
        product = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Product without dimensions",
            weight_g=None,
            height_cm=None,
            product_type_id=None,
        )
        await session.refresh(product)

        assert product.weight_g is None
        assert product.height_cm is None


@pytest.mark.integration
class TestProductDismantlingProperties:
    """Tests for product dismantling-related properties."""

    @pytest.mark.asyncio
    async def test_dismantling_time_start_set(self, session: AsyncSession, superuser: User) -> None:
        """Dismantling time start is set on product creation."""
        product = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Product to Dismantle",
            product_type_id=None,
        )
        await session.refresh(product)

        # dismantling_time_start should have a default
        assert product.dismantling_time_start is not None

    @pytest.mark.asyncio
    async def test_dismantling_time_end_optional(self, session: AsyncSession, superuser: User) -> None:
        """Dismantling time end can be None."""
        product = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Product being dismantled",
            dismantling_time_end=None,
            product_type_id=None,
        )
        await session.refresh(product)

        assert product.dismantling_time_end is None


@pytest.mark.integration
class TestProductConstraints:
    """Tests for product database constraints."""

    @pytest.mark.asyncio
    async def test_product_type_optional(self, session: AsyncSession, superuser: User) -> None:
        """Product type is optional."""
        product = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Product without type",
            product_type_id=None,
        )
        await session.refresh(product)

        assert product.product_type_id is None

    @pytest.mark.asyncio
    async def test_created_updated_timestamps_immutable_after_creation(
        self, session: AsyncSession, superuser: User
    ) -> None:
        """Timestamps should be set and consistent after creation."""
        product = await ProductFactory.create_async(
            session,
            owner_id=superuser.id,
            name="Timestamp Test",
            product_type_id=None,
        )
        created_at_original = product.created_at
        updated_at_original = product.updated_at

        await session.refresh(product)

        # Timestamps should not change on refresh
        assert product.created_at == created_at_original
        assert product.updated_at == updated_at_original
