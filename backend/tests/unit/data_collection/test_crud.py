"""Unit tests for data collection CRUD operations."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.common.models.enums import Unit
from app.api.common.schemas.associations import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkCreateWithinProductAndMaterial,
    MaterialProductLinkUpdate,
)
from app.api.data_collection.crud import (
    add_material_to_product,
    add_materials_to_product,
    create_circularity_properties,
    create_component,
    create_physical_properties,
    create_product,
    delete_circularity_properties,
    delete_physical_properties,
    delete_product,
    get_circularity_properties,
    get_physical_properties,
    get_product_trees,
    remove_materials_from_product,
    update_circularity_properties,
    update_material_within_product,
    update_physical_properties,
    update_product,
)
from app.api.data_collection.exceptions import (
    MaterialIDRequiredError,
    ProductOwnerRequiredError,
    ProductPropertyAlreadyExistsError,
    ProductPropertyNotFoundError,
    ProductTreeMissingContentError,
)
from app.api.data_collection.models.product import CircularityProperties, PhysicalProperties, Product
from app.api.data_collection.schemas import (
    CircularityPropertiesCreate,
    CircularityPropertiesUpdate,
    ComponentCreateWithComponents,
    PhysicalPropertiesCreate,
    PhysicalPropertiesUpdate,
    ProductCreateWithComponents,
    ProductUpdate,
)
from app.api.file_storage.schemas import VideoCreateWithinProduct
from tests.factories.models import (
    CircularityPropertiesFactory,
    PhysicalPropertiesFactory,
    ProductFactory,
)

# Realistic test data for reverse-engineering lab products
BRAND_BOSCH = "bosch"
BRAND_MAKITA = "makita"


@pytest.fixture
def mock_session() -> AsyncMock:
    """Fixture for an AsyncSession mock."""
    session = AsyncMock(spec=AsyncSession)
    # add and add_all are synchronous methods in SQLAlchemy
    session.add = MagicMock()
    session.add_all = MagicMock()
    session.delete = AsyncMock()

    # For execute/exec mocking
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [BRAND_BOSCH, BRAND_MAKITA]
    mock_result.all.return_value = [BRAND_BOSCH, BRAND_MAKITA]
    session.execute.return_value = mock_result
    session.exec = AsyncMock(return_value=mock_result)

    return session


class TestPhysicalPropertiesCrud:
    """Tests for physical properties CRUD operations."""

    async def test_create_physical_properties_success(self, mock_session: AsyncMock) -> None:
        """Test successful creation of physical properties."""
        product_id = 1
        props_create = PhysicalPropertiesCreate(weight_g=10.0, width_cm=5.0)

        # Mock product that exists and has no properties
        product = ProductFactory.build(id=product_id, name="Bosch IXO 7 Screwdriver")
        product.physical_properties = None

        with patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product):
            result = await create_physical_properties(mock_session, props_create, product_id)

            assert isinstance(result, PhysicalProperties)
            assert result.weight_g == 10.0
            assert result.product_id == product_id

            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()
            mock_session.refresh.assert_called_once()

    async def test_create_physical_properties_already_exist(self, mock_session: AsyncMock) -> None:
        """Test error when product already has properties."""
        product_id = 1
        props_create = PhysicalPropertiesCreate(weight_g=10.0)

        # Mock product that already has properties
        product = ProductFactory.build(id=product_id, name="Bosch IXO 7 Screwdriver")
        product.physical_properties = PhysicalPropertiesFactory.build(weight_g=5.0)

        with (
            patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product),
            pytest.raises(ProductPropertyAlreadyExistsError, match="already has physical properties"),
        ):
            await create_physical_properties(mock_session, props_create, product_id)

    async def test_get_physical_properties_success(self, mock_session: AsyncMock) -> None:
        """Test successful retrieval of physical properties."""
        product_id = 1
        product = ProductFactory.build(id=product_id)
        props = PhysicalPropertiesFactory.build(weight_g=10.0)
        product.physical_properties = props

        with patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product):
            result = await get_physical_properties(mock_session, product_id)
            assert result == props

    async def test_get_physical_properties_missing(self, mock_session: AsyncMock) -> None:
        """Test error when getting missing physical properties."""
        product = ProductFactory.build(id=1)
        product.physical_properties = None
        with (
            patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product),
            pytest.raises(ProductPropertyNotFoundError, match="not found"),
        ):
            await get_physical_properties(mock_session, 1)

    async def test_update_physical_properties_success(self, mock_session: AsyncMock) -> None:
        """Test successful update of physical properties."""
        product_id = 1
        props_update = PhysicalPropertiesUpdate(weight_g=20.0)

        product = ProductFactory.build(id=product_id)
        product.physical_properties = PhysicalPropertiesFactory.build(weight_g=10.0)

        with patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product):
            result = await update_physical_properties(mock_session, product_id, props_update)
            assert result.weight_g == 20.0
            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()

    async def test_update_physical_properties_missing(self, mock_session: AsyncMock) -> None:
        """Test error when updating missing physical properties."""
        product = ProductFactory.build(id=1)
        product.physical_properties = None
        with (
            patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product),
            pytest.raises(ProductPropertyNotFoundError, match="not found"),
        ):
            await update_physical_properties(mock_session, 1, PhysicalPropertiesUpdate())

    async def test_delete_physical_properties_success(self, mock_session: AsyncMock) -> None:
        """Test successful deletion of physical properties."""
        product = ProductFactory.build(id=1)
        product.physical_properties = PhysicalPropertiesFactory.build(id=10)

        await delete_physical_properties(mock_session, product)
        mock_session.delete.assert_called_once()

    async def test_delete_physical_properties_missing(self, mock_session: AsyncMock) -> None:
        """Test error when deleting missing physical properties."""
        product = ProductFactory.build(id=1)
        product.physical_properties = None
        with pytest.raises(ProductPropertyNotFoundError, match="not found"):
            await delete_physical_properties(mock_session, product)


class TestCircularityPropertiesCrud:
    """Tests for circularity properties CRUD operations."""

    async def test_create_circularity_properties_success(self, mock_session: AsyncMock) -> None:
        """Test successful creation of circularity properties."""
        product_id = 1
        props_create = CircularityPropertiesCreate(
            recyclability_observation="ABS housing separable from PCB; no adhesive bonding"
        )

        product = ProductFactory.build(id=product_id)
        product.circularity_properties = None

        with patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product):
            result = await create_circularity_properties(mock_session, props_create, product_id)
            assert isinstance(result, CircularityProperties)
            assert result.recyclability_observation == "ABS housing separable from PCB; no adhesive bonding"
            assert result.product_id == product_id
            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()

    async def test_create_circularity_properties_exists(self, mock_session: AsyncMock) -> None:
        """Test error when circularity properties already exist."""
        product = ProductFactory.build(id=1)
        product.circularity_properties = CircularityPropertiesFactory.build(product_id=1)
        with (
            patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product),
            pytest.raises(ProductPropertyAlreadyExistsError, match="already has"),
        ):
            await create_circularity_properties(mock_session, CircularityPropertiesCreate(), 1)

    async def test_get_circularity_properties_success(self, mock_session: AsyncMock) -> None:
        """Test successful retrieval of circularity properties."""
        product_id = 1
        product = ProductFactory.build(id=product_id)
        props = CircularityPropertiesFactory.build(
            recyclability_observation="ABS housing separable from PCB; no adhesive bonding"
        )
        product.circularity_properties = props

        with patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product):
            result = await get_circularity_properties(mock_session, product_id)
            assert result == props

    async def test_get_circularity_properties_missing(self, mock_session: AsyncMock) -> None:
        """Test error when getting missing circularity properties."""
        product = ProductFactory.build(id=1)
        product.circularity_properties = None
        with (
            patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product),
            pytest.raises(ProductPropertyNotFoundError, match="not found"),
        ):
            await get_circularity_properties(mock_session, 1)

    async def test_update_circularity_properties_success(self, mock_session: AsyncMock) -> None:
        """Test successful update of circularity properties."""
        product_id = 1
        props_update = CircularityPropertiesUpdate(
            repairability_observation="Glued battery; requires heat gun for disassembly"
        )

        product = ProductFactory.build(id=product_id)
        product.circularity_properties = CircularityPropertiesFactory.build(
            recyclability_observation="ABS housing separable from PCB; no adhesive bonding"
        )

        with patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product):
            result = await update_circularity_properties(mock_session, product_id, props_update)
            assert result.repairability_observation == "Glued battery; requires heat gun for disassembly"
            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()

    async def test_update_circularity_properties_missing(self, mock_session: AsyncMock) -> None:
        """Test error when updating missing circularity properties."""
        product = ProductFactory.build(id=1)
        product.circularity_properties = None
        with (
            patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product),
            pytest.raises(ProductPropertyNotFoundError, match="not found"),
        ):
            await update_circularity_properties(mock_session, 1, CircularityPropertiesUpdate())

    async def test_delete_circularity_properties_success(self, mock_session: AsyncMock) -> None:
        """Test successful deletion of circularity properties."""
        product = ProductFactory.build(id=1)
        product.circularity_properties = CircularityPropertiesFactory.build(id=20)

        await delete_circularity_properties(mock_session, product)
        mock_session.delete.assert_called_once()

    async def test_delete_circularity_properties_missing(self, mock_session: AsyncMock) -> None:
        """Test error when deleting missing circularity properties."""
        product = ProductFactory.build(id=1)
        product.circularity_properties = None
        with pytest.raises(ProductPropertyNotFoundError, match="not found"):
            await delete_circularity_properties(mock_session, product)


class TestProductCrud:
    """Tests for product CRUD operations."""

    async def test_create_product_success(self, mock_session: AsyncMock) -> None:
        """Test successful product creation."""
        owner_id = uuid4()
        # Product must have at least one material or component
        product_create = ProductCreateWithComponents(
            name="Makita DHP486 Combi Drill",
            product_type_id=1,
            components=[],
            bill_of_materials=[MaterialProductLinkCreateWithinProduct(material_id=1, quantity=1.0, unit=Unit.KILOGRAM)],
        )

        with patch("app.api.data_collection.crud.products.get_models_by_ids_or_404"):
            result = await create_product(mock_session, product_create, owner_id)

        assert isinstance(result, Product)
        assert result.name == "Makita DHP486 Combi Drill"
        assert result.owner_id == owner_id

        mock_session.add.assert_called()
        mock_session.commit.assert_called_once()

    async def test_get_product_trees(self, mock_session: AsyncMock) -> None:
        """Test retrieving product trees."""
        with patch("app.api.data_collection.crud.products.get_model_by_id"):
            # Setup mock_session to return results for exec().all()
            mock_result = MagicMock()
            mock_result.all.return_value = ["Product 1"]
            mock_session.exec = AsyncMock(return_value=mock_result)

            res = await get_product_trees(mock_session, parent_id=1, product_filter=MagicMock())
            assert res == ["Product 1"]

    async def test_update_product_success(self, mock_session: AsyncMock) -> None:
        """Test successful product update."""
        product_id = 1
        product_update = ProductUpdate(name="Bosch GSR 18V-90 C")

        db_product = ProductFactory.build(id=product_id, name="Bosch PSR 1800 LI-2")

        with (
            patch("app.api.data_collection.crud.products.get_model_by_id", return_value=db_product),
            patch("app.api.data_collection.crud.products.get_models_by_ids_or_404", return_value=[]),
        ):
            result = await update_product(mock_session, product_id, product_update)
            assert result.name == "Bosch GSR 18V-90 C"
            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()

    async def test_delete_product_success(self, mock_session: AsyncMock) -> None:
        """Test successful product deletion."""
        product_id = 1
        db_product = ProductFactory.build(id=product_id)

        with (
            patch("app.api.data_collection.crud.products.get_model_by_id", return_value=db_product),
            patch("app.api.data_collection.crud.products.product_files_crud.delete_all"),
            patch("app.api.data_collection.crud.products.product_images_crud.delete_all"),
        ):
            await delete_product(mock_session, product_id)
            mock_session.delete.assert_called_once_with(db_product)
            mock_session.commit.assert_called_once()

    async def test_create_component_success(self, mock_session: AsyncMock) -> None:
        """Test successful component creation."""
        owner_id = uuid4()
        parent_product = ProductFactory.build(id=1, owner_id=owner_id)

        comp_create = ComponentCreateWithComponents(
            name="Comp",
            product_type_id=1,
            amount_in_parent=1,
            components=[
                ComponentCreateWithComponents(
                    name="Subcomp",
                    product_type_id=1,
                    amount_in_parent=1,
                    bill_of_materials=[MaterialProductLinkCreateWithinProduct(material_id=1, quantity=1)],
                )
            ],
            physical_properties=PhysicalPropertiesCreate(weight_g=1),
            circularity_properties=CircularityPropertiesCreate(),
            videos=[VideoCreateWithinProduct.model_validate({"url": "http://ok.com", "title": "Vid"})],
            bill_of_materials=[MaterialProductLinkCreateWithinProduct(material_id=1, quantity=1)],
        )

        with patch("app.api.data_collection.crud.products.get_models_by_ids_or_404"):
            res = await create_component(mock_session, comp_create, parent_product)
            assert res.name == "Comp"
            assert res.owner_id == owner_id

    async def test_create_product_requires_materials_or_components(self, mock_session: AsyncMock) -> None:
        """Product creation should fail when the payload has no materials and no components."""
        owner_id = uuid4()
        product_create = ProductCreateWithComponents.model_construct(
            name="Makita DHP486 Combi Drill",
            components=[],
            bill_of_materials=[],
        )

        with pytest.raises(ProductTreeMissingContentError, match="needs materials or components"):
            await create_product(mock_session, product_create, owner_id)

    async def test_create_product_tree_requires_owner(self, mock_session: AsyncMock) -> None:
        """The shared tree helper should reject creation attempts without an owner id."""
        product_create = ProductCreateWithComponents(
            name="Makita DHP486 Combi Drill",
            bill_of_materials=[MaterialProductLinkCreateWithinProduct(material_id=1, quantity=1.0, unit=Unit.KILOGRAM)],
        )

        with pytest.raises(ProductOwnerRequiredError, match="owner_id must be set"):
            await create_product(mock_session, product_create, owner_id=None)


class TestBillOfMaterialsCrud:
    """Tests for bill of materials CRUD operations."""

    async def test_add_materials_to_product_success(self, mock_session: AsyncMock) -> None:
        """Test successful batch addition of materials to product."""
        product = ProductFactory.build(id=1)
        product.bill_of_materials = []
        with (
            patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=product),
            patch("app.api.data_collection.crud.shared.get_models_by_ids_or_404"),
        ):
            links = [MaterialProductLinkCreateWithinProduct(material_id=1, quantity=1)]
            res = await add_materials_to_product(mock_session, 1, links)
            assert len(res) == 1
            mock_session.add_all.assert_called_once()
            mock_session.commit.assert_called_once()

    async def test_add_material_to_product_success(self, mock_session: AsyncMock) -> None:
        """Test adding material to product."""
        product_id = 1
        material_id = 10
        link_create = MaterialProductLinkCreateWithinProductAndMaterial(quantity=5.0)

        db_product = ProductFactory.build(id=product_id, name="Bosch IXO 7 Screwdriver")
        db_product.bill_of_materials = []

        with (
            patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=db_product),
            patch("app.api.data_collection.crud.shared.get_models_by_ids_or_404"),
            patch("app.api.data_collection.crud.material_links.add_materials_to_product") as mock_add_batch,
        ):
            expected_link = MagicMock()
            mock_add_batch.return_value = [expected_link]

            result = await add_material_to_product(
                mock_session, product_id, material_link=link_create, material_id=material_id
            )

            assert result == expected_link
            mock_add_batch.assert_called_once()

    async def test_add_material_missing_id(self, mock_session: AsyncMock) -> None:
        """Test error when material ID is missing."""
        link_create = MaterialProductLinkCreateWithinProductAndMaterial(quantity=5.0)

        with pytest.raises(MaterialIDRequiredError, match="Material ID is required"):
            await add_material_to_product(mock_session, product_id=1, material_link=link_create, material_id=None)

    async def test_update_material_within_product_success(self, mock_session: AsyncMock) -> None:
        """Test successful update of material within product."""
        with (
            patch("app.api.data_collection.crud.shared.get_model_by_id"),
            patch("app.api.data_collection.crud.material_links.get_linking_model_with_ids_if_it_exists") as mock_link,
        ):
            mock_link_obj = MagicMock()
            mock_link.return_value = mock_link_obj

            await update_material_within_product(mock_session, 1, 1, MaterialProductLinkUpdate(quantity=2))
            mock_link_obj.sqlmodel_update.assert_called_once()
            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()

    async def test_remove_materials_from_product(self, mock_session: AsyncMock) -> None:
        """Test removal of materials from product."""
        product_id = 1
        material_ids = {10, 20}

        db_product = ProductFactory.build(id=product_id)
        link1 = MagicMock(material_id=10, id=10)
        link2 = MagicMock(material_id=20, id=20)
        db_product.bill_of_materials = [link1, link2]

        # Mock exec to return a result with material links
        mock_result = MagicMock()
        mock_result.all.return_value = [link1, link2]
        mock_session.exec = AsyncMock(return_value=mock_result)

        with (
            patch("app.api.data_collection.crud.shared.get_model_by_id", return_value=db_product),
            patch("app.api.data_collection.crud.shared.get_models_by_ids_or_404"),
        ):
            await remove_materials_from_product(mock_session, product_id, material_ids)
            # Should have executed a select statement with exec()
            mock_session.exec.assert_called_once()
            # Should have deleted each material link
            assert mock_session.delete.call_count == 2
            mock_session.commit.assert_called_once()
