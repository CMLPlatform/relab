"""Validation tests for ownership utility functions."""

import pytest
from pydantic import UUID4
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.exceptions import UserOwnershipError
from app.api.common.utils.ownership import get_user_owned_object
from app.api.data_collection.models import Product
from tests.factories import ProductFactory, UserFactory


class TestOwnershipValidation:
    """Test ownership validation utilities."""

    async def test_get_user_owned_object_with_correct_owner(self, db_session: AsyncSession) -> None:
        """Test getting object owned by the correct user."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        product = ProductFactory.create(owner=user)

        # Should succeed - user owns the product
        result = await get_user_owned_object(
            db=db_session, model=Product, model_id=product.id, owner_id=user.id, user_fk="owner_id"
        )

        assert result.id == product.id
        assert result.owner_id == user.id

    async def test_get_user_owned_object_with_wrong_owner(self, db_session: AsyncSession) -> None:
        """Test that getting object owned by different user raises error."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        owner = UserFactory.create()
        other_user = UserFactory.create()
        product = ProductFactory.create(owner=owner)

        # Should fail - other_user doesn't own the product
        with pytest.raises(UserOwnershipError) as exc_info:
            await get_user_owned_object(
                db=db_session, model=Product, model_id=product.id, owner_id=other_user.id, user_fk="owner_id"
            )

        assert str(product.id) in str(exc_info.value)
        assert str(other_user.id) in str(exc_info.value)

    async def test_get_user_owned_object_with_nonexistent_object(self, db_session: AsyncSession) -> None:
        """Test that getting nonexistent object raises error."""
        UserFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()

        # Should fail - product doesn't exist
        with pytest.raises(UserOwnershipError):
            await get_user_owned_object(
                db=db_session, model=Product, model_id=99999, owner_id=user.id, user_fk="owner_id"
            )

    async def test_get_user_owned_object_validates_ownership_consistently(self, db_session: AsyncSession) -> None:
        """Test that ownership validation is consistent across multiple calls."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        owner = UserFactory.create()
        other_user = UserFactory.create()
        product = ProductFactory.create(owner=owner)

        # First call - should succeed
        result1 = await get_user_owned_object(
            db=db_session, model=Product, model_id=product.id, owner_id=owner.id, user_fk="owner_id"
        )

        assert result1.id == product.id

        # Second call with wrong owner - should fail
        with pytest.raises(UserOwnershipError):
            await get_user_owned_object(
                db=db_session, model=Product, model_id=product.id, owner_id=other_user.id, user_fk="owner_id"
            )

        # Third call with correct owner again - should succeed
        result3 = await get_user_owned_object(
            db=db_session, model=Product, model_id=product.id, owner_id=owner.id, user_fk="owner_id"
        )

        assert result3.id == product.id


class TestOwnershipErrorMessages:
    """Test that ownership errors have meaningful messages."""

    async def test_ownership_error_includes_model_type(self, db_session: AsyncSession) -> None:
        """Test that error message includes the model type."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        owner = UserFactory.create()
        other_user = UserFactory.create()
        product = ProductFactory.create(owner=owner)

        with pytest.raises(UserOwnershipError) as exc_info:
            await get_user_owned_object(
                db=db_session, model=Product, model_id=product.id, owner_id=other_user.id, user_fk="owner_id"
            )

        error_message = str(exc_info.value)
        assert "product" in error_message.lower()

    async def test_ownership_error_includes_ids(self, db_session: AsyncSession) -> None:
        """Test that error message includes relevant IDs."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        owner = UserFactory.create()
        other_user = UserFactory.create()
        product = ProductFactory.create(owner=owner)

        with pytest.raises(UserOwnershipError) as exc_info:
            await get_user_owned_object(
                db=db_session, model=Product, model_id=product.id, owner_id=other_user.id, user_fk="owner_id"
            )

        error_message = str(exc_info.value)
        # Should include product ID and user ID
        assert str(product.id) in error_message or str(other_user.id) in error_message
