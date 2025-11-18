"""Tests for common CRUD utility functions."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.crud.utils import db_get_model_with_id_if_it_exists, validate_linked_items_exist
from app.api.data_collection.models import Product
from tests.factories import MaterialFactory, ProductFactory, TaxonomyFactory, UserFactory


class TestModelExistenceValidation:
    """Test CRUD utilities that validate model existence."""

    async def test_get_model_with_valid_id(self, db_session: AsyncSession) -> None:
        """Test getting a model that exists."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        result = await db_get_model_with_id_if_it_exists(db_session, Product, product.id)

        assert result.id == product.id

    async def test_get_model_with_invalid_id_raises_error(self, db_session: AsyncSession) -> None:
        """Test that getting nonexistent model raises ModelNotFoundError."""
        with pytest.raises(ModelNotFoundError, match="not found"):
            await db_get_model_with_id_if_it_exists(db_session, Product, 99999)

    async def test_error_message_includes_model_type(self, db_session: AsyncSession) -> None:
        """Test that error message includes the model type."""
        with pytest.raises(ModelNotFoundError) as exc_info:
            await db_get_model_with_id_if_it_exists(db_session, Product, 99999)

        error_message = str(exc_info.value)
        assert "product" in error_message.lower()


class TestLinkedItemsValidation:
    """Test validation of linked items."""

    async def test_validate_linked_items_exist_with_valid_ids(self, db_session: AsyncSession) -> None:
        """Test validating that linked items exist."""
        from app.api.background_data.models import Material

        MaterialFactory._meta.sqlalchemy_session = db_session
        TaxonomyFactory._meta.sqlalchemy_session = db_session

        material1 = MaterialFactory.create()
        material2 = MaterialFactory.create()

        # Should not raise - both materials exist
        await validate_linked_items_exist(db_session, Material, [material1.id, material2.id])

    async def test_validate_linked_items_with_invalid_id_raises_error(self, db_session: AsyncSession) -> None:
        """Test that validation fails when linked item doesn't exist."""
        from app.api.background_data.models import Material

        MaterialFactory._meta.sqlalchemy_session = db_session
        TaxonomyFactory._meta.sqlalchemy_session = db_session

        material = MaterialFactory.create()

        # One valid, one invalid ID
        with pytest.raises(ModelNotFoundError):
            await validate_linked_items_exist(db_session, Material, [material.id, 99999])

    async def test_validate_empty_list_succeeds(self, db_session: AsyncSession) -> None:
        """Test that empty list passes validation."""
        from app.api.background_data.models import Material

        # Should not raise
        await validate_linked_items_exist(db_session, Material, [])


class TestDuplicateValidation:
    """Test duplicate validation utilities."""

    async def test_validate_no_duplicate_items(self) -> None:
        """Test validation of no duplicate items in list."""
        from app.api.common.crud.utils import validate_no_duplicate_linked_items

        # No duplicates - should not raise
        validate_no_duplicate_linked_items([1, 2, 3])

        # Has duplicates - should raise
        with pytest.raises(ValueError, match="duplicate"):
            validate_no_duplicate_linked_items([1, 2, 2, 3])

    async def test_validate_empty_list(self) -> None:
        """Test that empty list has no duplicates."""
        from app.api.common.crud.utils import validate_no_duplicate_linked_items

        # Should not raise
        validate_no_duplicate_linked_items([])
