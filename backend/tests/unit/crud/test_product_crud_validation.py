"""Validation tests for product CRUD operations."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.data_collection import crud
from app.api.data_collection.models import PhysicalProperties, Product
from app.api.data_collection.schemas import PhysicalPropertiesCreate, PhysicalPropertiesUpdate
from tests.factories import PhysicalPropertiesFactory, ProductFactory, UserFactory


class TestPhysicalPropertiesCRUDValidation:
    """Test validation in physical properties CRUD operations."""

    async def test_create_physical_properties_for_nonexistent_product(self, db_session: AsyncSession) -> None:
        """Test that creating physical properties for nonexistent product fails."""
        props_data = PhysicalPropertiesCreate(weight_kg=20.0, height_cm=150.0)

        with pytest.raises(ValueError, match="not found"):
            await crud.create_physical_properties(db_session, props_data, product_id=99999)

    async def test_create_physical_properties_for_product_that_already_has_them(
        self, db_session: AsyncSession
    ) -> None:
        """Test that creating physical properties for product that already has them fails."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session

        # Create product with physical properties
        product = ProductFactory.create()
        existing_props = PhysicalPropertiesFactory.create(product=product)

        # Try to create again
        new_props_data = PhysicalPropertiesCreate(weight_kg=30.0)

        with pytest.raises(ValueError, match="already has physical properties"):
            await crud.create_physical_properties(db_session, new_props_data, product_id=product.id)

    async def test_create_physical_properties_validates_positive_values(self, db_session: AsyncSession) -> None:
        """Test that CRUD validates positive values before database insertion."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        # This should fail at the Pydantic validation layer
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            PhysicalPropertiesCreate(weight_kg=-5.0)

    async def test_get_physical_properties_for_product_without_them(self, db_session: AsyncSession) -> None:
        """Test that getting physical properties for product without them fails."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        with pytest.raises(ValueError, match="not found"):
            await crud.get_physical_properties(db_session, product_id=product.id)

    async def test_get_physical_properties_for_nonexistent_product(self, db_session: AsyncSession) -> None:
        """Test that getting physical properties for nonexistent product fails."""
        with pytest.raises(ValueError, match="not found"):
            await crud.get_physical_properties(db_session, product_id=99999)

    async def test_update_physical_properties_for_product_without_them(self, db_session: AsyncSession) -> None:
        """Test that updating physical properties for product without them fails."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()
        update_data = PhysicalPropertiesUpdate(weight_kg=25.0)

        with pytest.raises(ValueError, match="Physical properties.*not found"):
            await crud.update_physical_properties(db_session, product_id=product.id, physical_properties=update_data)

    async def test_successful_create_physical_properties(self, db_session: AsyncSession) -> None:
        """Test successful creation of physical properties."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()
        props_data = PhysicalPropertiesCreate(weight_kg=20.0, height_cm=150.0, width_cm=70.0, depth_cm=50.0)

        result = await crud.create_physical_properties(db_session, props_data, product_id=product.id)

        assert result.id is not None
        assert result.weight_kg == 20.0
        assert result.product_id == product.id

    async def test_successful_update_physical_properties(self, db_session: AsyncSession) -> None:
        """Test successful update of physical properties."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()
        props = PhysicalPropertiesFactory.create(product=product, weight_kg=20.0)

        update_data = PhysicalPropertiesUpdate(weight_kg=25.0)
        result = await crud.update_physical_properties(db_session, product_id=product.id, physical_properties=update_data)

        assert result.weight_kg == 25.0

    async def test_delete_physical_properties_for_product_without_them(self, db_session: AsyncSession) -> None:
        """Test that deleting physical properties for product without them fails."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        with pytest.raises(ValueError, match="Physical properties.*not found"):
            await crud.delete_physical_properties(db_session, product_id=product.id)

    async def test_successful_delete_physical_properties(self, db_session: AsyncSession) -> None:
        """Test successful deletion of physical properties."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()
        props = PhysicalPropertiesFactory.create(product=product)

        # Delete
        await crud.delete_physical_properties(db_session, product_id=product.id)

        # Verify deleted
        with pytest.raises(ValueError, match="not found"):
            await crud.get_physical_properties(db_session, product_id=product.id)


class TestProductCRUDConstraints:
    """Test business logic constraints in product CRUD operations."""

    async def test_product_name_is_required(self, db_session: AsyncSession) -> None:
        """Test that product name is required."""
        from pydantic import ValidationError

        from app.api.data_collection.schemas import ProductCreateBaseProduct

        with pytest.raises(ValidationError, match="Field required"):
            ProductCreateBaseProduct()

    async def test_product_owner_is_required_at_database_level(self, db_session: AsyncSession) -> None:
        """Test that owner_id is required at the database level."""
        from sqlalchemy.exc import IntegrityError

        # Try to create product without owner
        product = Product(name="Test Product")
        db_session.add(product)

        with pytest.raises(IntegrityError):
            await db_session.commit()

        await db_session.rollback()


class TestCRUDExistenceValidation:
    """Test validation of entity existence in CRUD operations."""

    async def test_crud_validates_product_exists(self, db_session: AsyncSession) -> None:
        """Test that CRUD operations validate product existence."""
        from app.api.common.crud.utils import db_get_model_with_id_if_it_exists

        with pytest.raises(ValueError, match="not found"):
            await db_get_model_with_id_if_it_exists(db_session, Product, 99999)

    async def test_crud_validates_physical_properties_exist(self, db_session: AsyncSession) -> None:
        """Test that CRUD operations validate physical properties existence."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        # Product exists but has no physical properties
        with pytest.raises(ValueError, match="not found"):
            await crud.get_physical_properties(db_session, product_id=product.id)


class TestCRUDBusinessLogic:
    """Test business logic validation in CRUD operations."""

    async def test_cannot_create_duplicate_physical_properties(self, db_session: AsyncSession) -> None:
        """Test that creating duplicate physical properties is prevented."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()
        PhysicalPropertiesFactory.create(product=product)

        # Try to create another set of physical properties
        props_data = PhysicalPropertiesCreate(weight_kg=30.0)

        with pytest.raises(ValueError, match="already has"):
            await crud.create_physical_properties(db_session, props_data, product_id=product.id)

    async def test_physical_properties_require_valid_product(self, db_session: AsyncSession) -> None:
        """Test that physical properties require a valid product."""
        props_data = PhysicalPropertiesCreate(weight_kg=20.0)

        # Nonexistent product
        with pytest.raises(ValueError):
            await crud.create_physical_properties(db_session, props_data, product_id=99999)
