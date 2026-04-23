"""Unit tests for shared test-factory behaviour."""

from typing import TYPE_CHECKING

import pytest

from tests.factories.models import CategoryFactory, MaterialFactory, UserFactory

if TYPE_CHECKING:
    from unittest.mock import AsyncMock


class TestBaseModelFactory:
    """Regression tests for shared SQLAlchemy factory defaults."""

    def test_build_skips_material_search_vector(self) -> None:
        """Generated TSVECTOR columns should be left for Postgres to populate."""
        material = MaterialFactory.build(name="Steel")
        assert material.search_vector is None

    def test_build_skips_category_search_vector(self) -> None:
        """Skipping computed fields should apply across all models using the base factory."""
        category = CategoryFactory.build(name="Metals")
        assert category.search_vector is None

    @pytest.mark.asyncio
    async def test_create_async_skips_refresh_by_default(self, mock_session: AsyncMock) -> None:
        """Factory inserts should avoid an unnecessary refresh unless a test opts in."""
        await UserFactory.create_async(session=mock_session, email="factory@example.com")

        mock_session.refresh.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_create_async_supports_opt_in_refresh(self, mock_session: AsyncMock) -> None:
        """Tests can still request a refresh when server-generated fields are needed immediately."""
        instance = await UserFactory.create_async(
            session=mock_session,
            email="factory-refresh@example.com",
            refresh_instance=True,
        )

        mock_session.refresh.assert_awaited_once_with(instance)
