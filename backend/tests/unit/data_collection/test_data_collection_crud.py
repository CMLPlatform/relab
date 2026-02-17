from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.api.auth.models import User
from app.api.background_data.models import ProductType
from app.api.common.schemas.associations import MaterialProductLinkCreateWithinProductAndMaterial
from app.api.data_collection.crud import add_material_to_product, create_physical_properties, create_product
from app.api.data_collection.models import PhysicalProperties, Product
from app.api.data_collection.schemas import PhysicalPropertiesCreate, ProductCreateWithComponents


@pytest.fixture
def mock_session():
    session = AsyncMock()
    # add and add_all are synchronous methods in SQLAlchemy
    session.add = MagicMock()
    session.add_all = MagicMock()
    return session


class TestPhysicalPropertiesCrud:
    async def test_create_physical_properties_success(self, mock_session):
        """Test successful creation of physical properties."""
        product_id = 1
        props_create = PhysicalPropertiesCreate(weight_g=10.0, width_cm=5.0)

        # Mock product that exists and has no properties
        product = Product(id=product_id, name="Test Product")
        product.physical_properties = None

        with patch("app.api.data_collection.crud.db_get_model_with_id_if_it_exists", return_value=product) as mock_get:
            result = await create_physical_properties(mock_session, props_create, product_id)

            assert isinstance(result, PhysicalProperties)
            assert result.weight_g == 10.0
            assert result.product_id == product_id

            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()
            mock_session.refresh.assert_called_once()

    async def test_create_physical_properties_already_exist(self, mock_session):
        """Test error when product already has properties."""
        product_id = 1
        props_create = PhysicalPropertiesCreate(weight_g=10.0)

        # Mock product that already has properties
        product = Product(id=product_id, name="Test Product")
        product.physical_properties = PhysicalProperties(weight_g=5.0)

        with patch("app.api.data_collection.crud.db_get_model_with_id_if_it_exists", return_value=product):
            with pytest.raises(ValueError) as exc:
                await create_physical_properties(mock_session, props_create, product_id)

            assert "already has physical properties" in str(exc.value)


class TestProductCrud:
    async def test_create_product_success(self, mock_session):
        """Test successful product creation."""
        owner_id = uuid4()
        # Product must have at least one material or component
        product_create = ProductCreateWithComponents(
            name="New Product",
            product_type_id=1,
            components=[],
            bill_of_materials=[{"material_id": 1, "quantity": 1.0, "unit": "kg"}],
        )

        mock_type = ProductType(id=1, name="Type")
        mock_user = User(id=owner_id, email="test@example.com")

        with patch("app.api.data_collection.crud.db_get_model_with_id_if_it_exists") as mock_get:
            # Configure mock to return type then user
            mock_get.side_effect = [mock_type, mock_user]

            # Use patch for material existence check as well
            with patch("app.api.data_collection.crud.db_get_models_with_ids_if_they_exist"):
                result = await create_product(mock_session, product_create, owner_id)

            assert isinstance(result, Product)
            assert result.name == "New Product"
            assert result.owner_id == owner_id

            mock_session.add.assert_called()
            mock_session.commit.assert_called_once()

    async def test_add_material_to_product_success(self, mock_session):
        """Test adding material to product."""
        product_id = 1
        material_id = 10
        link_create = MaterialProductLinkCreateWithinProductAndMaterial(quantity=5.0)

        db_product = Product(id=product_id, name="Product")
        db_product.bill_of_materials = []

        with (
            patch("app.api.data_collection.crud.db_get_model_with_id_if_it_exists", return_value=db_product),
            patch("app.api.data_collection.crud.db_get_models_with_ids_if_they_exist"),
            patch("app.api.data_collection.crud.add_materials_to_product") as mock_add_batch,
        ):
            expected_link = MagicMock()
            mock_add_batch.return_value = [expected_link]

            result = await add_material_to_product(
                mock_session, product_id, material_link=link_create, material_id=material_id
            )

            assert result == expected_link
            mock_add_batch.assert_called_once()

    async def test_add_material_missing_id(self, mock_session):
        """Test error when material ID is missing."""
        link_create = MaterialProductLinkCreateWithinProductAndMaterial(quantity=5.0)

        with pytest.raises(ValueError) as exc:
            await add_material_to_product(mock_session, product_id=1, material_link=link_create, material_id=None)

        assert "Material ID is required" in str(exc.value)
