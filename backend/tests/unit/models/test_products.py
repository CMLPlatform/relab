"""Unit tests for product models."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.data_collection.models import CircularityProperties, PhysicalProperties, Product
from tests.factories import (
    CircularityPropertiesFactory,
    CompleteProductFactory,
    PhysicalPropertiesFactory,
    ProductFactory,
    UserFactory,
)


class TestPhysicalProperties:
    """Test PhysicalProperties model."""

    async def test_create_physical_properties(self, db_session: AsyncSession) -> None:
        """Test creating physical properties."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()
        props = PhysicalPropertiesFactory.create(product=product)

        assert props.id is not None
        assert props.weight_g is not None
        assert props.weight_g > 0
        assert props.height_cm is not None
        assert props.width_cm is not None
        assert props.depth_cm is not None
        assert props.product_id == product.id

    async def test_volume_calculation(self, db_session: AsyncSession) -> None:
        """Test that volume is correctly calculated from dimensions."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()
        props = PhysicalPropertiesFactory.create(
            product=product, height_cm=10.0, width_cm=20.0, depth_cm=30.0
        )

        # Verify volume calculation
        assert props.volume_cm3 == 6000.0  # 10 * 20 * 30

    async def test_weight_in_grams(self, db_session: AsyncSession) -> None:
        """Test that weight is stored in grams (recent feature)."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()
        # 500g for a small product
        props = PhysicalPropertiesFactory.create(product=product, weight_g=500.0)

        assert props.weight_g == 500.0
        # Verify it's greater than 0 (validation)
        assert props.weight_g > 0


class TestCircularityProperties:
    """Test CircularityProperties model."""

    async def test_create_circularity_properties(self, db_session: AsyncSession) -> None:
        """Test creating circularity properties."""
        CircularityPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()
        props = CircularityPropertiesFactory.create(product=product)

        assert props.id is not None
        assert props.recyclability_observation is not None
        assert props.repairability_observation is not None
        assert props.remanufacturability_observation is not None
        assert props.product_id == product.id

    async def test_all_circularity_aspects(self, db_session: AsyncSession) -> None:
        """Test that all three circularity aspects are present."""
        CircularityPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()
        props = CircularityPropertiesFactory.create(
            product=product,
            recyclability_observation="Fully recyclable",
            recyclability_comment="Grade A plastic",
            repairability_observation="Easily repairable",
            repairability_comment="Modular design",
            remanufacturability_observation="Can be remanufactured",
            remanufacturability_comment="Standard components",
        )

        # Recyclability
        assert props.recyclability_observation == "Fully recyclable"
        assert props.recyclability_comment == "Grade A plastic"

        # Repairability
        assert props.repairability_observation == "Easily repairable"
        assert props.repairability_comment == "Modular design"

        # Remanufacturability
        assert props.remanufacturability_observation == "Can be remanufactured"
        assert props.remanufacturability_comment == "Standard components"


class TestProduct:
    """Test Product model."""

    async def test_create_product(self, db_session: AsyncSession) -> None:
        """Test creating a basic product."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        assert product.id is not None
        assert product.name is not None
        assert product.owner is not None
        assert product.owner.id is not None

    async def test_product_with_physical_properties(self, db_session: AsyncSession) -> None:
        """Test product with physical properties."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create(with_physical_properties=True)

        assert product.physical_properties is not None
        assert product.physical_properties.weight_g is not None

    async def test_product_with_circularity_properties(self, db_session: AsyncSession) -> None:
        """Test product with circularity properties."""
        CircularityPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create(with_circularity_properties=True)

        assert product.circularity_properties is not None
        assert product.circularity_properties.recyclability_observation is not None

    async def test_complete_product(self, db_session: AsyncSession) -> None:
        """Test creating a complete product with all properties."""
        CompleteProductFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        CircularityPropertiesFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = CompleteProductFactory.create()

        # Verify basic product fields
        assert product.id is not None
        assert product.name is not None
        assert product.owner is not None

        # Verify physical properties
        assert product.physical_properties is not None
        assert product.physical_properties.weight_g is not None

        # Verify circularity properties
        assert product.circularity_properties is not None
        assert product.circularity_properties.recyclability_observation is not None

    async def test_product_relationships(self, db_session: AsyncSession) -> None:
        """Test that product relationships are properly set up."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        product1 = ProductFactory.create(owner=user)
        product2 = ProductFactory.create(owner=user)

        # Both products should have the same owner
        assert product1.owner.id == user.id
        assert product2.owner.id == user.id
        assert product1.owner_id == product2.owner_id

    async def test_product_optional_fields(self, db_session: AsyncSession) -> None:
        """Test that optional fields can be None."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create(
            description=None, brand=None, model=None, serial_number=None, purchase_date=None
        )

        assert product.id is not None
        assert product.name is not None  # Required field
        assert product.description is None
        assert product.brand is None
        assert product.model is None
