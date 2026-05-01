"""Unit tests for data collection CRUD operations."""
# spell-checker: ignore Bosch, Combi, Makita

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.audit import AuditAction
from app.api.common.models.enums import Unit
from app.api.common.schemas.associations import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkCreateWithinProductAndMaterial,
    MaterialProductLinkUpdate,
)
from app.api.data_collection.crud.material_links import (
    add_material_to_product,
    add_materials_to_product,
    remove_materials_from_product,
    update_material_within_product,
)
from app.api.data_collection.crud.products import (
    create_component,
    create_product,
    delete_product,
    update_product,
)
from app.api.data_collection.exceptions import (
    MaterialIDRequiredError,
    ProductOwnerRequiredError,
)
from app.api.data_collection.models.product import Product
from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    ProductCreateWithComponents,
    ProductUpdate,
)
from tests.factories.models import ProductFactory

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
    # session.execute already set above with mock_result

    return session


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

        with (
            patch("app.api.data_collection.crud.product_commands.require_models"),
            patch(
                "app.api.data_collection.crud.product_commands.refresh_profile_stats_after_mutation",
                AsyncMock(),
            ) as apply_stats,
        ):
            result = await create_product(mock_session, product_create, owner_id)

        assert isinstance(result, Product)
        assert result.name == "Makita DHP486 Combi Drill"
        assert result.owner_id == owner_id

        mock_session.add.assert_called()
        assert mock_session.commit.call_count >= 1
        apply_stats.assert_awaited_once()

    async def test_update_product_success(self, mock_session: AsyncMock) -> None:
        """Test successful product update."""
        product_id = 1
        product_update = ProductUpdate(name="Bosch GSR 18V-90 C")

        db_product = ProductFactory.build(id=product_id, name="Bosch PSR 1800 LI-2")
        db_product.owner_id = uuid4()

        with (
            patch(
                "app.api.data_collection.crud.product_commands.require_locked_model",
                return_value=db_product,
            ) as get_product,
            patch("app.api.data_collection.crud.product_commands.require_models", return_value=[]),
            patch(
                "app.api.data_collection.crud.product_commands.refresh_profile_stats_after_mutation",
                AsyncMock(),
            ) as apply_stats,
        ):
            result = await update_product(mock_session, product_id, product_update)
            assert result.name == "Bosch GSR 18V-90 C"
            assert mock_session.add.call_count >= 1
            assert mock_session.commit.call_count >= 1
            apply_stats.assert_awaited_once()
            get_product.assert_awaited_once_with(mock_session, Product, product_id)

    async def test_delete_product_success(self, mock_session: AsyncMock) -> None:
        """Test successful product deletion."""
        product_id = 1
        db_product = ProductFactory.build(id=product_id)
        owner_id = uuid4()
        db_product.owner_id = owner_id

        with (
            patch(
                "app.api.data_collection.crud.product_commands.require_locked_model",
                return_value=db_product,
            ) as get_product,
            patch("app.api.data_collection.crud.product_commands.delete_all_product_files"),
            patch("app.api.data_collection.crud.product_commands.delete_all_product_images"),
            patch(
                "app.api.data_collection.crud.product_commands.refresh_profile_stats_after_mutation",
                AsyncMock(),
            ) as apply_stats,
            patch("app.api.data_collection.crud.product_commands.audit_event") as log_audit,
        ):
            await delete_product(mock_session, product_id)
            mock_session.delete.assert_called_once_with(db_product)
            assert mock_session.commit.call_count >= 1
            apply_stats.assert_awaited_once()
            get_product.assert_awaited_once_with(mock_session, Product, product_id)
            log_audit.assert_called_once_with(owner_id, AuditAction.DELETE, Product, product_id)

    async def test_create_component_success(self, mock_session: AsyncMock) -> None:
        """Test successful component creation."""
        owner_id = uuid4()
        parent_product = ProductFactory.build(id=1, owner_id=owner_id)
        parent_product.owner_id = owner_id

        comp_create = ComponentCreateWithComponents(
            name="Comp",
            product_type_id=1,
            amount_in_parent=1,
            weight_g=1,
            components=[
                ComponentCreateWithComponents(
                    name="Subcomp",
                    product_type_id=1,
                    amount_in_parent=1,
                    bill_of_materials=[MaterialProductLinkCreateWithinProduct(material_id=1, quantity=1)],
                )
            ],
            bill_of_materials=[MaterialProductLinkCreateWithinProduct(material_id=1, quantity=1)],
        )

        with patch("app.api.data_collection.crud.product_commands.require_models"):
            res = await create_component(mock_session, comp_create, parent_product)
            assert res.name == "Comp"
            # Components denormalize their parent's owner_id.
            assert res.owner_id == owner_id
            assert res.parent is parent_product

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
            patch("app.api.data_collection.crud.shared.require_model", return_value=product),
            patch("app.api.data_collection.crud.shared.require_models"),
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
            patch("app.api.data_collection.crud.shared.require_model", return_value=db_product),
            patch("app.api.data_collection.crud.shared.require_models"),
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
            patch("app.api.data_collection.crud.shared.require_model"),
            patch("app.api.data_collection.crud.material_links.require_link") as mock_link,
        ):
            mock_link_obj = MagicMock()
            mock_link.return_value = mock_link_obj

            await update_material_within_product(mock_session, 1, 1, MaterialProductLinkUpdate(quantity=2))
            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()

    async def test_remove_materials_from_product(self, mock_session: AsyncMock) -> None:
        """Test removal of materials from product."""
        product_id = 1
        material_ids = {10, 20}

        db_product = ProductFactory.build(id=product_id)
        link1 = MagicMock(material_id=10, id=10)
        link2 = MagicMock(material_id=20, id=20)
        object.__setattr__(db_product, "bill_of_materials", [link1, link2])

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [link1, link2]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        with (
            patch("app.api.data_collection.crud.shared.require_model", return_value=db_product),
            patch("app.api.data_collection.crud.shared.require_models"),
        ):
            await remove_materials_from_product(mock_session, product_id, material_ids)
            mock_session.execute.assert_called_once()
            # Should have deleted each material link
            assert mock_session.delete.call_count == 2
            mock_session.commit.assert_called_once()
