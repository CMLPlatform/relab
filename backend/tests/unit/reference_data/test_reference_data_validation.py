"""Validation-focused tests for reference data CRUD helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.common.exceptions import BadRequestError
from app.api.reference_data.crud.categories import (
    get_category_trees,
    resolve_category_parents,
    validate_category_taxonomy_domains,
)
from app.api.reference_data.models import Category, Taxonomy, TaxonomyDomain
from tests.factories.models import CategoryFactory, TaxonomyFactory


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.execute = AsyncMock()
    return session


class TestCategoryParentResolution:
    """Cover parent resolution for category creation."""

    async def test_inherits_taxonomy_from_supercategory(self, mock_session: AsyncMock) -> None:
        """When a supercategory is supplied, its taxonomy wins over any passed-in value."""
        category_create = AsyncMock()
        category_create.taxonomy_id = 99
        category_create.supercategory_id = None
        super_category = CategoryFactory.build(id=1, taxonomy_id=10, name="Super")

        with patch("app.api.reference_data.crud.categories.require_model", return_value=super_category) as mock_get:
            result_id, result_cat = await resolve_category_parents(
                mock_session, category_create, taxonomy_id=99, supercategory_id=1
            )

        assert result_id == 10
        assert result_cat == super_category
        mock_get.assert_called_with(mock_session, Category, 1)

    async def test_top_level_requires_taxonomy(self, mock_session: AsyncMock) -> None:
        """Allows top-level categories when a taxonomy is provided."""
        category_create = AsyncMock()
        category_create.taxonomy_id = 10
        category_create.supercategory_id = None
        mock_taxonomy = TaxonomyFactory.build(id=10, name="Tax")

        with patch("app.api.reference_data.crud.categories.require_model", return_value=mock_taxonomy) as mock_get:
            result_id, result_cat = await resolve_category_parents(
                mock_session, category_create, taxonomy_id=None, supercategory_id=None
            )

        assert result_id == 10
        assert result_cat is None
        mock_get.assert_called_with(mock_session, Taxonomy, 10)

    async def test_top_level_missing_taxonomy_raises(self, mock_session: AsyncMock) -> None:
        """Rejects category creation without any taxonomy id."""
        category_create = AsyncMock()
        category_create.taxonomy_id = None
        category_create.supercategory_id = None

        with pytest.raises(BadRequestError, match="Taxonomy ID is required"):
            await resolve_category_parents(mock_session, category_create, taxonomy_id=None, supercategory_id=None)


class TestTaxonomyDomainValidation:
    """Cover taxonomy-domain validation helpers."""

    async def test_validate_domains_success(self, mock_session: AsyncMock) -> None:
        """Accepts categories whose taxonomies include the expected domain."""
        category_ids = {1, 2}
        expected_domain = TaxonomyDomain.PRODUCTS
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

    async def test_validate_domains_missing_category(self, mock_session: AsyncMock) -> None:
        """Raises when some requested categories are missing."""
        category_ids = {1, 2}
        expected_domain = TaxonomyDomain.PRODUCTS
        cat1 = CategoryFactory.build(id=1, taxonomy=TaxonomyFactory.build(domains={TaxonomyDomain.PRODUCTS}))
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [cat1]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(BadRequestError, match="not found"):
            await validate_category_taxonomy_domains(mock_session, category_ids, expected_domain)

    async def test_validate_domains_invalid_domain(self, mock_session: AsyncMock) -> None:
        """Raises when category taxonomies do not allow the target domain."""
        category_ids = {1}
        expected_domain = TaxonomyDomain.PRODUCTS
        cat1 = CategoryFactory.build(id=1, taxonomy=TaxonomyFactory.build(domains={TaxonomyDomain.MATERIALS}))
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [cat1]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(BadRequestError, match="belong to taxonomies outside of domains"):
            await validate_category_taxonomy_domains(mock_session, category_ids, expected_domain)


class TestGetCategoryTrees:
    """Cover category tree retrieval helpers."""

    async def test_raises_when_both_ids_provided(self) -> None:
        """Rejects requests that mix taxonomy and supercategory filters."""
        session = _make_session()
        with pytest.raises(BadRequestError, match="not both"):
            await get_category_trees(session, supercategory_id=1, taxonomy_id=2)

    async def test_returns_top_level_categories(self) -> None:
        """Returns top-level categories when no filters are provided."""
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
        """Filters category trees by taxonomy id."""
        session = _make_session()
        cat = CategoryFactory.build(id=1, taxonomy_id=10)
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [cat]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        session.execute.return_value = mock_result

        with patch("app.api.reference_data.crud.categories.require_model"):
            result = await get_category_trees(session, taxonomy_id=10)
        assert result == [cat]

    async def test_filters_by_supercategory_id(self) -> None:
        """Filters category trees by supercategory id."""
        session = _make_session()
        child_cat = CategoryFactory.build(id=2, supercategory_id=1)
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [child_cat]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        session.execute.return_value = mock_result

        with patch("app.api.reference_data.crud.categories.require_model"):
            result = await get_category_trees(session, supercategory_id=1)
        assert result == [child_cat]
