"""CRUD-operation tests for reference data domain modules."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from app.api.reference_data.crud.categories import delete_category, update_category
from app.api.reference_data.crud.materials import (
    add_categories_to_material,
    create_material,
    delete_material,
    update_material,
)
from app.api.reference_data.crud.product_types import (
    add_categories_to_product_type,
    create_product_type,
    delete_product_type,
    update_product_type,
)
from app.api.reference_data.crud.taxonomies import create_taxonomy, delete_taxonomy, update_taxonomy
from app.api.reference_data.models import Category, Material, ProductType, Taxonomy, TaxonomyDomain
from app.api.reference_data.schemas import (
    CategoryUpdate,
    MaterialCreate,
    MaterialUpdate,
    ProductTypeCreate,
    ProductTypeUpdate,
    TaxonomyCreate,
    TaxonomyUpdate,
)
from tests.factories.models import CategoryFactory, MaterialFactory, ProductTypeFactory, TaxonomyFactory


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    return session


class TestCategoryCrud:
    """Cover category CRUD helpers."""

    async def test_update_category_name(self) -> None:
        """Updates a category name and persists the change."""
        session = _make_session()
        db_category = CategoryFactory.build(id=1, name="Old Name")
        category_update = CategoryUpdate(name="New Name")

        with patch("app.api.reference_data.crud.shared.require_model", return_value=db_category):
            result = await update_category(session, 1, category_update)

        assert result.name == "New Name"
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_delete_category_success(self) -> None:
        """Deletes a category and commits the removal."""
        session = _make_session()
        db_category = CategoryFactory.build(id=1)

        with patch("app.api.reference_data.crud.shared.require_locked_model", return_value=db_category) as get_category:
            await delete_category(session, 1)

        get_category.assert_awaited_once_with(session, Category, 1)
        session.delete.assert_called_once_with(db_category)
        session.commit.assert_called_once()


class TestTaxonomyCrud:
    """Cover taxonomy CRUD helpers."""

    async def test_create_taxonomy_simple(self) -> None:
        """Creates a taxonomy from a minimal payload."""
        session = _make_session()
        taxonomy_create = TaxonomyCreate(
            name="EN 45554 Repairability Scoring", domains={TaxonomyDomain.PRODUCTS}, version="1.0"
        )

        result = await create_taxonomy(session, taxonomy_create)

        assert isinstance(result, Taxonomy)
        assert result.name == "EN 45554 Repairability Scoring"

    async def test_update_taxonomy_name(self) -> None:
        """Updates a taxonomy name."""
        session = _make_session()
        db_taxonomy = TaxonomyFactory.build(id=10, name="Old Name")
        taxonomy_update = TaxonomyUpdate(name="New Name")

        with patch("app.api.reference_data.crud.shared.require_model", return_value=db_taxonomy):
            result = await update_taxonomy(session, 10, taxonomy_update)

        assert result.name == "New Name"
        session.commit.assert_called_once()

    async def test_delete_taxonomy_success(self) -> None:
        """Deletes a taxonomy and commits the change."""
        session = _make_session()
        db_taxonomy = TaxonomyFactory.build(id=10)

        with patch("app.api.reference_data.crud.shared.require_locked_model", return_value=db_taxonomy) as get_taxonomy:
            await delete_taxonomy(session, 10)

        get_taxonomy.assert_awaited_once_with(session, Taxonomy, 10)
        session.delete.assert_called_once_with(db_taxonomy)
        session.commit.assert_called_once()


class TestMaterialCrud:
    """Cover material CRUD helpers."""

    async def test_create_material_simple(self) -> None:
        """Creates a material from a minimal payload."""
        session = _make_session()
        material_create = MaterialCreate(name="Aluminum")

        result = await create_material(session, material_create)

        assert isinstance(result, Material)
        assert result.name == "Aluminum"

    async def test_update_material_name(self) -> None:
        """Updates a material name."""
        session = _make_session()
        db_material = MaterialFactory.build(id=1, name="Old Material")
        material_update = MaterialUpdate(name="New Material")

        with patch("app.api.reference_data.crud.shared.require_model", return_value=db_material):
            result = await update_material(session, 1, material_update)

        assert result.name == "New Material"
        session.commit.assert_called_once()

    async def test_delete_material_success(self) -> None:
        """Deletes a material and its related assets."""
        session = _make_session()
        db_material = MaterialFactory.build(id=1)

        with (
            patch(
                "app.api.reference_data.crud.materials.require_locked_model",
                return_value=db_material,
            ) as get_material,
            patch("app.api.reference_data.crud.materials.delete_all_material_files"),
            patch("app.api.reference_data.crud.materials.delete_all_material_images"),
        ):
            await delete_material(session, 1)

        get_material.assert_awaited_once_with(session, Material, 1)
        session.delete.assert_called_once_with(db_material)
        session.commit.assert_called_once()

    async def test_add_categories_to_material_creates_first_link(self) -> None:
        """Creates category links when a material has none yet."""
        session = _make_session()
        db_material = MaterialFactory.build(id=1)
        db_material.categories = []
        db_categories = [CategoryFactory.build(id=1)]

        with (
            patch("app.api.reference_data.crud.shared.require_model", return_value=db_material),
            patch("app.api.reference_data.crud.shared.require_models", return_value=db_categories),
            patch("app.api.reference_data.crud.materials.validate_category_taxonomy_domains", new=AsyncMock()),
            patch("app.api.reference_data.crud.shared.add_links", new=AsyncMock()) as mock_create_links,
        ):
            result = await add_categories_to_material(session, 1, {1})

        assert result == db_categories
        mock_create_links.assert_awaited_once()


class TestProductTypeCrud:
    """Cover product type CRUD helpers."""

    async def test_add_categories_to_product_type_creates_first_link(self) -> None:
        """Creates category links when a product type has none yet."""
        session = _make_session()
        db_product_type = ProductTypeFactory.build(id=1)
        db_product_type.categories = []
        db_categories = [CategoryFactory.build(id=1)]

        with (
            patch("app.api.reference_data.crud.shared.require_model", return_value=db_product_type),
            patch("app.api.reference_data.crud.shared.require_models", return_value=db_categories),
            patch("app.api.reference_data.crud.product_types.validate_category_taxonomy_domains", new=AsyncMock()),
            patch("app.api.reference_data.crud.shared.add_links", new=AsyncMock()) as mock_create_links,
        ):
            result = await add_categories_to_product_type(session, 1, {1})

        assert result == db_categories
        mock_create_links.assert_awaited_once()

    async def test_create_product_type_simple(self) -> None:
        """Creates a product type from a minimal payload."""
        session = _make_session()
        pt_create = ProductTypeCreate(name="Laptop")

        result = await create_product_type(session, pt_create)

        assert isinstance(result, ProductType)
        assert result.name == "Laptop"

    async def test_update_product_type(self) -> None:
        """Updates a product type name."""
        session = _make_session()
        db_pt = ProductTypeFactory.build(id=1, name="Old Type")
        pt_update = ProductTypeUpdate(name="New Type")

        with patch("app.api.reference_data.crud.shared.require_model", return_value=db_pt):
            result = await update_product_type(session, 1, pt_update)

        assert result.name == "New Type"
        session.commit.assert_called_once()

    async def test_delete_product_type(self) -> None:
        """Deletes a product type and its related assets."""
        session = _make_session()
        db_pt = ProductTypeFactory.build(id=1)

        with (
            patch(
                "app.api.reference_data.crud.product_types.require_locked_model",
                return_value=db_pt,
            ) as get_product_type,
            patch("app.api.reference_data.crud.product_types.delete_all_product_type_files"),
            patch("app.api.reference_data.crud.product_types.delete_all_product_type_images"),
        ):
            await delete_product_type(session, 1)

        get_product_type.assert_awaited_once_with(session, ProductType, 1)
        session.delete.assert_called_once_with(db_pt)
        session.commit.assert_called_once()
