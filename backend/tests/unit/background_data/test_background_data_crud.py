from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.background_data.crud import validate_category_creation, validate_category_taxonomy_domains
from app.api.background_data.models import Category, Taxonomy, TaxonomyDomain


@pytest.fixture
def mock_session():
    return AsyncMock()


class TestCategoryValidation:
    async def test_validate_category_creation_with_supercategory(self, mock_session):
        """Test validation when supercategory is provided."""
        category_create = AsyncMock()
        category_create.taxonomy_id = 99  # Should be ignored if supercategory provided

        super_category = Category(id=1, taxonomy_id=10, name="Super")

        with patch(
            "app.api.background_data.crud.db_get_model_with_id_if_it_exists", return_value=super_category
        ) as mock_get:
            # Case 1: Matching taxonomy_id
            result_id, result_cat = await validate_category_creation(
                mock_session, category_create, taxonomy_id=10, supercategory_id=1
            )

            assert result_id == 10
            assert result_cat == super_category
            mock_get.assert_called_with(mock_session, Category, 1)

    async def test_validate_category_creation_supercategory_mismatch(self, mock_session):
        """Test validation fails when supercategory taxonomy mismatches."""
        category_create = AsyncMock()
        super_category = Category(id=1, taxonomy_id=10, name="Super")

        with patch("app.api.background_data.crud.db_get_model_with_id_if_it_exists", return_value=super_category):
            # Case 2: Mismatched taxonomy_id
            with pytest.raises(ValueError) as exc:
                await validate_category_creation(mock_session, category_create, taxonomy_id=20, supercategory_id=1)

            assert "does not belong to taxonomy with id 20" in str(exc.value)

    async def test_validate_category_creation_top_level(self, mock_session):
        """Test validation for top-level category info."""
        category_create = AsyncMock()
        category_create.taxonomy_id = 10

        mock_taxonomy = Taxonomy(id=10, name="Tax")

        with patch(
            "app.api.background_data.crud.db_get_model_with_id_if_it_exists", return_value=mock_taxonomy
        ) as mock_get:
            result_id, result_cat = await validate_category_creation(
                mock_session, category_create, taxonomy_id=None, supercategory_id=None
            )

            assert result_id == 10
            assert result_cat is None
            mock_get.assert_called_with(mock_session, Taxonomy, 10)

    async def test_validate_category_creation_missing_taxonomy(self, mock_session):
        """Test validation fails if no taxonomy ID for top-level."""
        category_create = AsyncMock()
        category_create.taxonomy_id = None

        with pytest.raises(ValueError) as exc:
            await validate_category_creation(mock_session, category_create, taxonomy_id=None, supercategory_id=None)

        assert "Taxonomy ID is required" in str(exc.value)


class TestTaxonomyDomainValidation:
    async def test_validate_domains_success(self, mock_session):
        """Test successful domain validation."""
        category_ids = {1, 2}
        expected_domain = TaxonomyDomain.PRODUCTS

        # Mock DB response
        cat1 = Category(id=1, taxonomy=Taxonomy(domains=[TaxonomyDomain.PRODUCTS]))
        cat2 = Category(id=2, taxonomy=Taxonomy(domains=[TaxonomyDomain.PRODUCTS, TaxonomyDomain.MATERIALS]))

        # Use MagicMock for result so .all() is synchronous (but returns value)
        mock_result = MagicMock()
        mock_result.all.return_value = [cat1, cat2]
        mock_session.exec.return_value = mock_result

        await validate_category_taxonomy_domains(mock_session, category_ids, expected_domain)

        # await db.exec(...) -> returns mock_result
        # mock_result.all() -> returns [cat1, cat2]
        # len() works on list
        mock_session.exec.assert_called_once()

    async def test_validate_domains_missing_category(self, mock_session):
        """Test validation fails when category is missing."""
        category_ids = {1, 2}
        expected_domain = TaxonomyDomain.PRODUCTS

        # Only return one category
        cat1 = Category(id=1, taxonomy=Taxonomy(domains=[TaxonomyDomain.PRODUCTS]))

        mock_result = MagicMock()
        mock_result.all.return_value = [cat1]
        mock_session.exec.return_value = mock_result

        with pytest.raises(ValueError) as exc:
            await validate_category_taxonomy_domains(mock_session, category_ids, expected_domain)

        # Match fuzzy since set representation might differ
        assert "not found" in str(exc.value)
        assert "2" in str(exc.value)

    async def test_validate_domains_invalid_domain(self, mock_session):
        """Test validation fails when category has wrong domain."""
        category_ids = {1}
        expected_domain = TaxonomyDomain.PRODUCTS

        # Category has wrong domain
        cat1 = Category(id=1, taxonomy=Taxonomy(domains=[TaxonomyDomain.MATERIALS]))

        mock_result = MagicMock()
        mock_result.all.return_value = [cat1]
        mock_session.exec.return_value = mock_result

        with pytest.raises(ValueError) as exc:
            await validate_category_taxonomy_domains(mock_session, category_ids, expected_domain)

        assert "belong to taxonomies outside of domains" in str(exc.value)
