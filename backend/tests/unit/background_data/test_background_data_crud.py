"""Unit tests for background data CRUD operations."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.background_data.crud import validate_category_creation, validate_category_taxonomy_domains
from app.api.background_data.models import Category, Taxonomy, TaxonomyDomain
from tests.factories.models import CategoryFactory, TaxonomyFactory

# Constants for test values to avoid magic value warnings
TAXONOMY_ID_10 = 10
TAXONOMY_ID_20 = 20
TAXONOMY_ID_99 = 99
CATEGORY_ID_1 = 1
CATEGORY_ID_2 = 2
BELONG_MSG = "does not belong to taxonomy with id"
MISSING_MSG = "not found"
BELONG_OUTSIDE_MSG = "belong to taxonomies outside of domains"
MISSING_TAX_MSG = "Taxonomy ID is required"


@pytest.fixture
def mock_session() -> AsyncMock:
    """Fixture for an AsyncSession mock."""
    return AsyncMock()


class TestCategoryValidation:
    """Tests for category creation validation."""

    async def test_validate_category_creation_with_supercategory(self, mock_session: AsyncMock) -> None:
        """Test validation when supercategory is provided."""
        category_create = AsyncMock()
        category_create.taxonomy_id = TAXONOMY_ID_99  # Should be ignored if supercategory provided

        super_category = CategoryFactory.build(id=CATEGORY_ID_1, taxonomy_id=TAXONOMY_ID_10, name="Super")

        with patch(
            "app.api.background_data.crud.db_get_model_with_id_if_it_exists", return_value=super_category
        ) as mock_get:
            # Case 1: Matching taxonomy_id
            result_id, result_cat = await validate_category_creation(
                mock_session, category_create, taxonomy_id=TAXONOMY_ID_10, supercategory_id=CATEGORY_ID_1
            )

            assert result_id == TAXONOMY_ID_10
            assert result_cat == super_category
            mock_get.assert_called_with(mock_session, Category, CATEGORY_ID_1)

    async def test_validate_category_creation_supercategory_mismatch(self, mock_session: AsyncMock) -> None:
        """Test validation fails when supercategory taxonomy mismatches."""
        category_create = AsyncMock()
        super_category = CategoryFactory.build(id=CATEGORY_ID_1, taxonomy_id=TAXONOMY_ID_10, name="Super")

        with (
            patch("app.api.background_data.crud.db_get_model_with_id_if_it_exists", return_value=super_category),
            pytest.raises(ValueError, match=BELONG_MSG) as exc,
        ):
            # Case 2: Mismatched taxonomy_id
            await validate_category_creation(
                mock_session, category_create, taxonomy_id=TAXONOMY_ID_20, supercategory_id=CATEGORY_ID_1
            )

        assert f"id {TAXONOMY_ID_20}" in str(exc.value)

    async def test_validate_category_creation_top_level(self, mock_session: AsyncMock) -> None:
        """Test validation for top-level category info."""
        category_create = AsyncMock()
        category_create.taxonomy_id = TAXONOMY_ID_10

        mock_taxonomy = TaxonomyFactory.build(id=TAXONOMY_ID_10, name="Tax")

        with patch(
            "app.api.background_data.crud.db_get_model_with_id_if_it_exists", return_value=mock_taxonomy
        ) as mock_get:
            result_id, result_cat = await validate_category_creation(
                mock_session, category_create, taxonomy_id=None, supercategory_id=None
            )

            assert result_id == TAXONOMY_ID_10
            assert result_cat is None
            mock_get.assert_called_with(mock_session, Taxonomy, TAXONOMY_ID_10)

    async def test_validate_category_creation_missing_taxonomy(self, mock_session: AsyncMock) -> None:
        """Test validation fails if no taxonomy ID for top-level."""
        category_create = AsyncMock()
        category_create.taxonomy_id = None

        with pytest.raises(ValueError, match=MISSING_TAX_MSG) as exc:
            await validate_category_creation(mock_session, category_create, taxonomy_id=None, supercategory_id=None)

        assert MISSING_TAX_MSG in str(exc.value)


class TestTaxonomyDomainValidation:
    """Tests for taxonomy domain validation."""

    async def test_validate_domains_success(self, mock_session: AsyncMock) -> None:
        """Test successful domain validation."""
        category_ids = {CATEGORY_ID_1, CATEGORY_ID_2}
        expected_domain = TaxonomyDomain.PRODUCTS

        # Mock DB response
        cat1 = CategoryFactory.build(
            id=CATEGORY_ID_1, taxonomy=TaxonomyFactory.build(domains={TaxonomyDomain.PRODUCTS})
        )
        cat2 = CategoryFactory.build(
            id=CATEGORY_ID_2,
            taxonomy=TaxonomyFactory.build(domains={TaxonomyDomain.PRODUCTS, TaxonomyDomain.MATERIALS}),
        )

        # Use MagicMock for result so .all() is synchronous (but returns value)
        mock_result = MagicMock()
        mock_result.all.return_value = [cat1, cat2]
        mock_session.exec.return_value = mock_result

        await validate_category_taxonomy_domains(mock_session, category_ids, expected_domain)

        # await db.exec(...) -> returns mock_result
        # mock_result.all() -> returns [cat1, cat2]
        # len() works on list
        mock_session.exec.assert_called_once()

    async def test_validate_domains_missing_category(self, mock_session: AsyncMock) -> None:
        """Test validation fails when category is missing."""
        category_ids = {CATEGORY_ID_1, CATEGORY_ID_2}
        expected_domain = TaxonomyDomain.PRODUCTS

        # Only return one category
        cat1 = CategoryFactory.build(
            id=CATEGORY_ID_1, taxonomy=TaxonomyFactory.build(domains={TaxonomyDomain.PRODUCTS})
        )

        mock_result = MagicMock()
        mock_result.all.return_value = [cat1]
        mock_session.exec.return_value = mock_result

        with pytest.raises(ValueError, match=MISSING_MSG) as exc:
            await validate_category_taxonomy_domains(mock_session, category_ids, expected_domain)

        # Match fuzzy since set representation might differ
        assert MISSING_MSG in str(exc.value)
        assert str(CATEGORY_ID_2) in str(exc.value)

    async def test_validate_domains_invalid_domain(self, mock_session: AsyncMock) -> None:
        """Test validation fails when category has wrong domain."""
        category_ids = {CATEGORY_ID_1}
        expected_domain = TaxonomyDomain.PRODUCTS

        # Category has wrong domain
        cat1 = CategoryFactory.build(
            id=CATEGORY_ID_1, taxonomy=TaxonomyFactory.build(domains={TaxonomyDomain.MATERIALS})
        )

        mock_result = MagicMock()
        mock_result.all.return_value = [cat1]
        mock_session.exec.return_value = mock_result

        with pytest.raises(ValueError, match=BELONG_OUTSIDE_MSG) as exc:
            await validate_category_taxonomy_domains(mock_session, category_ids, expected_domain)

        assert BELONG_OUTSIDE_MSG in str(exc.value)
