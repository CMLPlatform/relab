"""Unit tests for background data CRUD operations."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.background_data.crud.categories import (
    delete_category,
    get_category_trees,
    update_category,
    validate_category_creation,
    validate_category_taxonomy_domains,
)
from app.api.background_data.crud.materials import (
    add_categories_to_material,
    create_material,
    delete_material,
    update_material,
)
from app.api.background_data.crud.product_types import (
    add_categories_to_product_type,
    create_product_type,
    delete_product_type,
    update_product_type,
)
from app.api.background_data.crud.taxonomies import create_taxonomy, delete_taxonomy, update_taxonomy
from app.api.background_data.models import Category, Material, ProductType, Taxonomy, TaxonomyDomain
from app.api.background_data.schemas import (
    CategoryUpdate,
    MaterialCreate,
    MaterialUpdate,
    ProductTypeCreate,
    ProductTypeUpdate,
    TaxonomyCreate,
    TaxonomyUpdate,
)
from app.api.common.exceptions import BadRequestError
from tests.factories.models import CategoryFactory, MaterialFactory, ProductTypeFactory, TaxonomyFactory


class TestCategoryValidation:
    """Tests for category creation validation."""

    async def test_validate_category_creation_with_supercategory(self, mock_session: AsyncMock) -> None:
        """Test validation when supercategory is provided."""
        category_create = AsyncMock()
        category_create.taxonomy_id = 99  # Should be ignored if supercategory provided

        super_category = CategoryFactory.build(id=1, taxonomy_id=10, name="Super")

        with patch("app.api.background_data.crud.categories.require_model", return_value=super_category) as mock_get:
            # Case 1: Matching taxonomy_id
            result_id, result_cat = await validate_category_creation(
                mock_session, category_create, taxonomy_id=10, supercategory_id=1
            )

            assert result_id == 10
            assert result_cat == super_category
            mock_get.assert_called_with(mock_session, Category, 1)

    async def test_validate_category_creation_supercategory_mismatch(self, mock_session: AsyncMock) -> None:
        """Test validation fails when supercategory taxonomy mismatches."""
        category_create = AsyncMock()
        super_category = CategoryFactory.build(id=1, taxonomy_id=10, name="Super")

        with (
            patch("app.api.background_data.crud.categories.require_model", return_value=super_category),
            pytest.raises(BadRequestError, match="does not belong to taxonomy with id") as exc,
        ):
            # Case 2: Mismatched taxonomy_id
            await validate_category_creation(mock_session, category_create, taxonomy_id=20, supercategory_id=1)

        assert f"id {20}" in str(exc.value)

    async def test_validate_category_creation_top_level(self, mock_session: AsyncMock) -> None:
        """Test validation for top-level category info."""
        category_create = AsyncMock()
        category_create.taxonomy_id = 10

        mock_taxonomy = TaxonomyFactory.build(id=10, name="Tax")

        with patch("app.api.background_data.crud.categories.require_model", return_value=mock_taxonomy) as mock_get:
            result_id, result_cat = await validate_category_creation(
                mock_session, category_create, taxonomy_id=None, supercategory_id=None
            )

            assert result_id == 10
            assert result_cat is None
            mock_get.assert_called_with(mock_session, Taxonomy, 10)

    async def test_validate_category_creation_missing_taxonomy(self, mock_session: AsyncMock) -> None:
        """Test validation fails if no taxonomy ID for top-level."""
        category_create = AsyncMock()
        category_create.taxonomy_id = None

        with pytest.raises(BadRequestError, match="Taxonomy ID is required"):
            await validate_category_creation(mock_session, category_create, taxonomy_id=None, supercategory_id=None)


class TestTaxonomyDomainValidation:
    """Tests for taxonomy domain validation."""

    async def test_validate_domains_success(self, mock_session: AsyncMock) -> None:
        """Test successful domain validation."""
        category_ids = {1, 2}
        expected_domain = TaxonomyDomain.PRODUCTS

        # Mock DB response
        cat1 = CategoryFactory.build(id=1, taxonomy=TaxonomyFactory.build(domains={TaxonomyDomain.PRODUCTS}))
        cat2 = CategoryFactory.build(
            id=2,
            taxonomy=TaxonomyFactory.build(domains={TaxonomyDomain.PRODUCTS, TaxonomyDomain.MATERIALS}),
        )

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [cat1, cat2]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        await validate_category_taxonomy_domains(mock_session, category_ids, expected_domain)

        mock_session.execute.assert_called_once()

    async def test_validate_domains_missing_category(self, mock_session: AsyncMock) -> None:
        """Test validation fails when category is missing."""
        category_ids = {1, 2}
        expected_domain = TaxonomyDomain.PRODUCTS

        # Only return one category
        cat1 = CategoryFactory.build(id=1, taxonomy=TaxonomyFactory.build(domains={TaxonomyDomain.PRODUCTS}))

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [cat1]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(BadRequestError, match="not found") as exc:
            await validate_category_taxonomy_domains(mock_session, category_ids, expected_domain)

        assert str(2) in str(exc.value)

    async def test_validate_domains_invalid_domain(self, mock_session: AsyncMock) -> None:
        """Test validation fails when category has wrong domain."""
        category_ids = {1}
        expected_domain = TaxonomyDomain.PRODUCTS

        # Category has wrong domain
        cat1 = CategoryFactory.build(id=1, taxonomy=TaxonomyFactory.build(domains={TaxonomyDomain.MATERIALS}))

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [cat1]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(BadRequestError, match="belong to taxonomies outside of domains"):
            await validate_category_taxonomy_domains(mock_session, category_ids, expected_domain)


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
    """Tests for category CRUD operations."""

    async def test_update_category_name(self) -> None:
        """Test updating a category's name."""
        session = _make_session()
        db_category = CategoryFactory.build(id=1, name="Old Name")
        category_update = CategoryUpdate(name="New Name")

        with patch("app.api.background_data.crud.shared.require_model", return_value=db_category):
            result = await update_category(session, 1, category_update)

        assert result.name == "New Name"
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_delete_category_success(self) -> None:
        """Test successful category deletion."""
        session = _make_session()
        db_category = CategoryFactory.build(id=1)

        with patch("app.api.background_data.crud.shared.require_model", return_value=db_category):
            await delete_category(session, 1)

        session.delete.assert_called_once_with(db_category)
        session.commit.assert_called_once()


class TestTaxonomyCrud:
    """Tests for taxonomy CRUD operations."""

    async def test_create_taxonomy_simple(self) -> None:
        """Test simple taxonomy creation without categories."""
        session = _make_session()
        taxonomy_create = TaxonomyCreate(
            name="EN 45554 Repairability Scoring", domains={TaxonomyDomain.PRODUCTS}, version="1.0"
        )

        result = await create_taxonomy(session, taxonomy_create)

        assert isinstance(result, Taxonomy)
        assert result.name == "EN 45554 Repairability Scoring"
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_update_taxonomy_name(self) -> None:
        """Test updating a taxonomy's name."""
        session = _make_session()
        db_taxonomy = TaxonomyFactory.build(id=10, name="Old Name")
        taxonomy_update = TaxonomyUpdate(name="New Name")

        with patch("app.api.background_data.crud.shared.require_model", return_value=db_taxonomy):
            result = await update_taxonomy(session, 10, taxonomy_update)

        assert result.name == "New Name"
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_delete_taxonomy_success(self) -> None:
        """Test successful taxonomy deletion."""
        session = _make_session()
        db_taxonomy = TaxonomyFactory.build(id=10)

        with patch("app.api.background_data.crud.shared.require_model", return_value=db_taxonomy):
            await delete_taxonomy(session, 10)

        session.delete.assert_called_once_with(db_taxonomy)
        session.commit.assert_called_once()


class TestMaterialCrud:
    """Tests for material CRUD operations."""

    async def test_create_material_simple(self) -> None:
        """Test simple material creation without categories."""
        session = _make_session()
        material_create = MaterialCreate(name="Aluminum")

        result = await create_material(session, material_create)

        assert isinstance(result, Material)
        assert result.name == "Aluminum"
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_update_material_name(self) -> None:
        """Test updating a material's name."""
        session = _make_session()
        db_material = MaterialFactory.build(id=1, name="Old Material")
        material_update = MaterialUpdate(name="New Material")

        with patch("app.api.background_data.crud.shared.require_model", return_value=db_material):
            result = await update_material(session, 1, material_update)

        assert result.name == "New Material"
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_delete_material_success(self) -> None:
        """Test successful material deletion."""
        session = _make_session()
        db_material = MaterialFactory.build(id=1)

        with (
            patch("app.api.background_data.crud.materials.require_model", return_value=db_material),
            patch("app.api.background_data.crud.materials.delete_all_material_files"),
            patch("app.api.background_data.crud.materials.delete_all_material_images"),
        ):
            await delete_material(session, 1)

        session.delete.assert_called_once_with(db_material)
        session.commit.assert_called_once()

    async def test_add_categories_to_material_creates_first_link(self) -> None:
        """A material with no existing categories should still get its first category link."""
        session = _make_session()
        db_material = MaterialFactory.build(id=1)
        db_material.categories = []
        db_categories = [CategoryFactory.build(id=1)]

        with (
            patch("app.api.background_data.crud.shared.require_model", return_value=db_material),
            patch("app.api.background_data.crud.shared.require_models", return_value=db_categories),
            patch("app.api.background_data.crud.materials.validate_category_taxonomy_domains", new=AsyncMock()),
            patch("app.api.background_data.crud.shared.add_links", new=AsyncMock()) as mock_create_links,
        ):
            result = await add_categories_to_material(session, 1, {1})

        assert result == db_categories
        mock_create_links.assert_awaited_once()
        session.commit.assert_called_once()


class TestGetCategoryTrees:
    """Tests for get_category_trees."""

    async def test_raises_when_both_ids_provided(self) -> None:
        """Test error when both supercategory_id and taxonomy_id are given."""
        session = _make_session()

        with pytest.raises(BadRequestError, match="not both"):
            await get_category_trees(session, supercategory_id=1, taxonomy_id=2)

    async def test_returns_top_level_categories(self) -> None:
        """Test fetching top-level categories (no supercategory or taxonomy filter)."""
        session = _make_session()
        cat = CategoryFactory.build(id=1)
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [cat]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        session.execute.return_value = mock_result

        result = await get_category_trees(session)

        assert result == [cat]

    async def test_filters_by_taxonomy_id(self) -> None:
        """Test that taxonomy_id narrows results."""
        session = _make_session()
        cat = CategoryFactory.build(id=1, taxonomy_id=10)
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [cat]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        session.execute.return_value = mock_result

        with patch("app.api.background_data.crud.categories.require_model"):
            result = await get_category_trees(session, taxonomy_id=10)

        assert result == [cat]

    async def test_filters_by_supercategory_id(self) -> None:
        """Test that supercategory_id narrows results to children."""
        session = _make_session()
        child_cat = CategoryFactory.build(id=2, supercategory_id=1)
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [child_cat]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        session.execute.return_value = mock_result

        with patch("app.api.background_data.crud.categories.require_model"):
            result = await get_category_trees(session, supercategory_id=1)

        assert result == [child_cat]


class TestProductTypeCrud:
    """Tests for ProductType CRUD operations."""

    async def test_add_categories_to_product_type_creates_first_link(self) -> None:
        """A product type with no existing categories should still get its first category link."""
        session = _make_session()
        db_product_type = ProductTypeFactory.build(id=1)
        db_product_type.categories = []
        db_categories = [CategoryFactory.build(id=1)]

        with (
            patch("app.api.background_data.crud.shared.require_model", return_value=db_product_type),
            patch("app.api.background_data.crud.shared.require_models", return_value=db_categories),
            patch("app.api.background_data.crud.product_types.validate_category_taxonomy_domains", new=AsyncMock()),
            patch("app.api.background_data.crud.shared.add_links", new=AsyncMock()) as mock_create_links,
        ):
            result = await add_categories_to_product_type(session, 1, {1})

        assert result == db_categories
        mock_create_links.assert_awaited_once()
        session.commit.assert_called_once()

    async def test_create_product_type_simple(self) -> None:
        """Test simple ProductType creation."""
        session = _make_session()
        pt_create = ProductTypeCreate(name="Laptop")

        result = await create_product_type(session, pt_create)

        assert isinstance(result, ProductType)
        assert result.name == "Laptop"
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_update_product_type(self) -> None:
        """Test updating a ProductType."""
        session = _make_session()
        db_pt = ProductTypeFactory.build(id=1, name="Old Type")
        pt_update = ProductTypeUpdate(name="New Type")

        with patch("app.api.background_data.crud.shared.require_model", return_value=db_pt):
            result = await update_product_type(session, 1, pt_update)

        assert result.name == "New Type"
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_delete_product_type(self) -> None:
        """Test deleting a ProductType."""
        session = _make_session()
        db_pt = ProductTypeFactory.build(id=1)

        with (
            patch("app.api.background_data.crud.product_types.require_model", return_value=db_pt),
            patch("app.api.background_data.crud.product_types.delete_all_product_type_files"),
            patch("app.api.background_data.crud.product_types.delete_all_product_type_images"),
        ):
            await delete_product_type(session, 1)

        session.delete.assert_called_once_with(db_pt)
        session.commit.assert_called_once()
