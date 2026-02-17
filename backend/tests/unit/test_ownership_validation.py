"""Tests for user ownership validation utilities.

Tests validate that get_user_owned_object correctly enforces user ownership
and raises appropriate exceptions when access is denied.
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from pydantic import UUID4
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.auth.exceptions import UserOwnershipError
from app.api.auth.models import User
from app.api.common.crud.exceptions import DependentModelOwnershipError
from app.api.common.utils.ownership import get_user_owned_object


@pytest.mark.unit
class TestGetUserOwnedObjectSuccess:
    """Tests for successful get_user_owned_object calls."""

    @pytest.mark.asyncio
    async def test_returns_object_when_user_owns_it(self, mocker):
        """Verify function returns object when user owns it."""
        user_id = uuid4()
        model_id = uuid4()
        expected_object = MagicMock()

        # Mock the get_nested_model_by_id to return the object
        mock_get_nested = mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            return_value=expected_object,
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()

        result = await get_user_owned_object(
            db=db,
            model=mock_model,
            model_id=model_id,
            owner_id=user_id,
        )

        assert result == expected_object
        mock_get_nested.assert_called_once()

    @pytest.mark.asyncio
    async def test_passes_correct_parameters_to_get_nested_model(self, mocker):
        """Verify correct parameters are passed to get_nested_model_by_id."""
        user_id = uuid4()
        model_id = uuid4()
        expected_object = MagicMock()

        mock_get_nested = mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            return_value=expected_object,
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()

        await get_user_owned_object(
            db=db,
            model=mock_model,
            model_id=model_id,
            owner_id=user_id,
        )

        # Verify call with default user_fk="owner_id"
        call_args = mock_get_nested.call_args
        assert call_args.kwargs["parent_model"] == User
        assert call_args.kwargs["parent_id"] == user_id
        assert call_args.kwargs["dependent_model"] == mock_model
        assert call_args.kwargs["dependent_id"] == model_id
        assert call_args.kwargs["parent_fk_name"] == "owner_id"

    @pytest.mark.asyncio
    async def test_uses_custom_user_fk_parameter(self, mocker):
        """Verify custom user_fk parameter is passed through."""
        user_id = uuid4()
        model_id = uuid4()
        custom_fk = "custom_owner_field"
        expected_object = MagicMock()

        mock_get_nested = mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            return_value=expected_object,
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()

        await get_user_owned_object(
            db=db,
            model=mock_model,
            model_id=model_id,
            owner_id=user_id,
            user_fk=custom_fk,
        )

        call_args = mock_get_nested.call_args
        assert call_args.kwargs["parent_fk_name"] == custom_fk


@pytest.mark.unit
class TestGetUserOwnedObjectFailure:
    """Tests for get_user_owned_object error handling."""

    @pytest.mark.asyncio
    async def test_raises_user_ownership_error_on_dependent_model_error(self, mocker):
        """Verify UserOwnershipError is raised when DependentModelOwnershipError occurs."""
        user_id = uuid4()
        model_id = uuid4()

        # Mock get_nested_model_by_id to raise DependentModelOwnershipError
        mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            side_effect=DependentModelOwnershipError(
                dependent_model=MagicMock(),
                dependent_id=model_id,
                parent_model=User,
                parent_id=user_id,
            ),
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.get_api_model_name.return_value.name_capital = "TestModel"

        with pytest.raises(UserOwnershipError) as exc_info:
            await get_user_owned_object(
                db=db,
                model=mock_model,
                model_id=model_id,
                owner_id=user_id,
            )

        error = exc_info.value
        assert error.http_status_code == 403
        assert str(user_id) in error.message
        assert str(model_id) in error.message

    @pytest.mark.asyncio
    async def test_error_message_contains_model_name(self, mocker):
        """Verify error message includes the model name."""
        user_id = uuid4()
        model_id = uuid4()

        mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            side_effect=DependentModelOwnershipError(
                dependent_model=MagicMock(),
                dependent_id=model_id,
                parent_model=User,
                parent_id=user_id,
            ),
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        model_name = "DataCollection"
        mock_model.get_api_model_name.return_value.name_capital = model_name

        with pytest.raises(UserOwnershipError) as exc_info:
            await get_user_owned_object(
                db=db,
                model=mock_model,
                model_id=model_id,
                owner_id=user_id,
            )

        assert model_name in exc_info.value.message

    @pytest.mark.asyncio
    async def test_error_contains_forbidden_status_code(self, mocker):
        """Verify UserOwnershipError has 403 Forbidden status code."""
        user_id = uuid4()
        model_id = uuid4()

        mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            side_effect=DependentModelOwnershipError(
                dependent_model=MagicMock(),
                dependent_id=model_id,
                parent_model=User,
                parent_id=user_id,
            ),
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.get_api_model_name.return_value.name_capital = "Model"

        with pytest.raises(UserOwnershipError) as exc_info:
            await get_user_owned_object(
                db=db,
                model=mock_model,
                model_id=model_id,
                owner_id=user_id,
            )

        assert exc_info.value.http_status_code == 403


@pytest.mark.unit
class TestGetUserOwnedObjectParameterVariations:
    """Tests for various parameter combinations."""

    @pytest.mark.asyncio
    async def test_with_uuid4_ids(self, mocker):
        """Verify function works with various UUID4 IDs."""
        uuid_ids = [uuid4() for _ in range(3)]

        mock_get_nested = mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            return_value=MagicMock(),
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()

        for user_id in uuid_ids:
            for model_id in uuid_ids:
                await get_user_owned_object(
                    db=db,
                    model=mock_model,
                    model_id=model_id,
                    owner_id=user_id,
                )

        assert mock_get_nested.call_count == len(uuid_ids) ** 2

    @pytest.mark.asyncio
    async def test_with_integer_model_id(self, mocker):
        """Verify function works with integer model IDs."""
        user_id = uuid4()
        model_id = 12345

        mock_get_nested = mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            return_value=MagicMock(),
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()

        await get_user_owned_object(
            db=db,
            model=mock_model,
            model_id=model_id,
            owner_id=user_id,
        )

        call_args = mock_get_nested.call_args
        assert call_args.kwargs["dependent_id"] == model_id

    @pytest.mark.asyncio
    async def test_with_string_user_fk(self, mocker):
        """Verify function works with different string user_fk values."""
        user_id = uuid4()
        model_id = uuid4()
        fk_values = ["owner_id", "created_by_id", "responsible_user_id", "author_id"]

        mock_get_nested = mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            return_value=MagicMock(),
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()

        for fk_name in fk_values:
            await get_user_owned_object(
                db=db,
                model=mock_model,
                model_id=model_id,
                owner_id=user_id,
                user_fk=fk_name,
            )

        assert mock_get_nested.call_count == len(fk_values)

        # Verify each call used different user_fk
        for i, fk_name in enumerate(fk_values):
            call_args = mock_get_nested.call_args_list[i]
            assert call_args.kwargs["parent_fk_name"] == fk_name


@pytest.mark.unit
class TestGetUserOwnedObjectIntegration:
    """Tests for integration aspects of ownership validation."""

    @pytest.mark.asyncio
    async def test_chain_of_responsibility_flow(self, mocker):
        """Verify correct flow: valid object -> returned, invalid -> UserOwnershipError."""
        user_id = uuid4()
        model_id = uuid4()
        expected_object = MagicMock()

        mock_get_nested = mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.get_api_model_name.return_value.name_capital = "TestResource"

        # First call: valid ownership
        mock_get_nested.return_value = expected_object
        result = await get_user_owned_object(
            db=db,
            model=mock_model,
            model_id=model_id,
            owner_id=user_id,
        )
        assert result == expected_object

        # Second call: invalid ownership
        mock_get_nested.side_effect = DependentModelOwnershipError(
            dependent_model=mock_model,
            dependent_id=model_id,
            parent_model=User,
            parent_id=user_id,
        )

        with pytest.raises(UserOwnershipError):
            await get_user_owned_object(
                db=db,
                model=mock_model,
                model_id=model_id,
                owner_id=user_id,
            )

    @pytest.mark.asyncio
    async def test_preserves_exception_chain(self, mocker):
        """Verify exception chain suppression with 'from None'."""
        user_id = uuid4()
        model_id = uuid4()

        original_error = DependentModelOwnershipError(
            dependent_model=MagicMock(),
            dependent_id=model_id,
            parent_model=User,
            parent_id=user_id,
        )

        mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            side_effect=original_error,
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.get_api_model_name.return_value.name_capital = "ModelName"

        with pytest.raises(UserOwnershipError) as exc_info:
            await get_user_owned_object(
                db=db,
                model=mock_model,
                model_id=model_id,
                owner_id=user_id,
            )

        # The exception should have __cause__ set to None (from None)
        assert exc_info.value.__cause__ is None
        assert exc_info.value.__context__ is original_error

    @pytest.mark.asyncio
    async def test_async_context_is_maintained(self, mocker):
        """Verify async execution context is maintained."""
        user_id = uuid4()
        model_id = uuid4()

        async_call_counter = AsyncMock(return_value=None)

        async def mock_get_nested(*args, **kwargs):
            await async_call_counter()
            return MagicMock()

        mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            side_effect=mock_get_nested,
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()

        await get_user_owned_object(
            db=db,
            model=mock_model,
            model_id=model_id,
            owner_id=user_id,
        )

        async_call_counter.assert_called_once()

    @pytest.mark.asyncio
    async def test_database_session_not_modified(self, mocker):
        """Verify database session is passed through without modification."""
        user_id = uuid4()
        model_id = uuid4()

        mock_get_nested = mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            return_value=MagicMock(),
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()

        await get_user_owned_object(
            db=db,
            model=mock_model,
            model_id=model_id,
            owner_id=user_id,
        )

        # Verify the exact same db instance was passed
        call_args = mock_get_nested.call_args
        assert call_args.kwargs["db"] is db


@pytest.mark.unit
class TestGetUserOwnedObjectEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_with_many_consecutive_calls(self, mocker):
        """Verify function handles many consecutive calls correctly."""
        mock_get_nested = mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            return_value=MagicMock(),
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()

        for _ in range(100):
            user_id = uuid4()
            model_id = uuid4()
            await get_user_owned_object(
                db=db,
                model=mock_model,
                model_id=model_id,
                owner_id=user_id,
            )

        assert mock_get_nested.call_count == 100

    @pytest.mark.asyncio
    async def test_error_on_first_call(self, mocker):
        """Verify error handling on first call."""
        user_id = uuid4()
        model_id = uuid4()

        mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            side_effect=DependentModelOwnershipError(
                dependent_model=MagicMock(),
                dependent_id=model_id,
                parent_model=User,
                parent_id=user_id,
            ),
        )

        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.get_api_model_name.return_value.name_capital = "Model"

        with pytest.raises(UserOwnershipError):
            await get_user_owned_object(
                db=db,
                model=mock_model,
                model_id=model_id,
                owner_id=user_id,
            )

    @pytest.mark.asyncio
    async def test_same_user_and_model_ids_different_models(self, mocker):
        """Verify function works correctly with multiple different model types."""
        user_id = uuid4()
        model_id = uuid4()

        mock_get_nested = mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            return_value=MagicMock(),
        )

        db = AsyncMock(spec=AsyncSession)

        # Different model types
        model_types = [
            MagicMock(name="ModelA"),
            MagicMock(name="ModelB"),
            MagicMock(name="ModelC"),
        ]

        for model_type in model_types:
            await get_user_owned_object(
                db=db,
                model=model_type,
                model_id=model_id,
                owner_id=user_id,
            )

        # Verify all calls were made with different models but same IDs
        assert mock_get_nested.call_count == 3
        for i, call in enumerate(mock_get_nested.call_args_list):
            assert call.kwargs["dependent_model"] == model_types[i]
            assert call.kwargs["dependent_id"] == model_id
            assert call.kwargs["parent_id"] == user_id
