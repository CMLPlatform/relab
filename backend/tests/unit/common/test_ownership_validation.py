"""Unit tests for get_user_owned_object ownership enforcement."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.auth.exceptions import UserOwnershipError
from app.api.auth.models import User
from app.api.common.crud.exceptions import DependentModelOwnershipError
from app.api.common.utils.ownership import get_user_owned_object

if TYPE_CHECKING:
    from pytest_mock import MockerFixture


def _ownership_error(user_id: int | UUID, model_id: int | UUID) -> DependentModelOwnershipError:
    return DependentModelOwnershipError(
        dependent_model=User,
        dependent_id=model_id,
        parent_model=User,
        parent_id=user_id,
    )


@pytest.mark.unit
class TestGetUserOwnedObject:
    """get_user_owned_object delegates to get_nested_model_by_id and maps ownership errors."""

    @pytest.mark.asyncio
    async def test_success_returns_object_and_passes_correct_params(self, mocker: MockerFixture) -> None:
        """Happy path: returned object matches, FK defaults to 'owner_id', custom FK forwarded."""
        user_id = uuid4()
        model_id = uuid4()
        expected = MagicMock()
        mock_get_nested = mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            return_value=expected,
        )
        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()

        # Default FK
        result = await get_user_owned_object(db=db, model=mock_model, model_id=model_id, owner_id=user_id)
        assert result is expected
        call = mock_get_nested.call_args
        assert call.kwargs["parent_model"] == User
        assert call.kwargs["parent_id"] == user_id
        assert call.kwargs["dependent_model"] == mock_model
        assert call.kwargs["dependent_id"] == model_id
        assert call.kwargs["parent_fk_name"] == "owner_id"

        # Custom FK
        await get_user_owned_object(
            db=db, model=mock_model, model_id=model_id, owner_id=user_id, user_fk="created_by_id"
        )
        assert mock_get_nested.call_args.kwargs["parent_fk_name"] == "created_by_id"

    @pytest.mark.asyncio
    async def test_ownership_error_raises_user_ownership_error(self, mocker: MockerFixture) -> None:
        """DependentModelOwnershipError is translated to UserOwnershipError (403, correct message)."""
        user_id = uuid4()
        model_id = uuid4()
        mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            side_effect=_ownership_error(user_id, model_id),
        )
        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.model_label = "Product"

        with pytest.raises(UserOwnershipError) as exc_info:
            await get_user_owned_object(db=db, model=mock_model, model_id=model_id, owner_id=user_id)

        err = exc_info.value
        assert err.http_status_code == 403
        assert str(user_id) in err.message
        assert str(model_id) in err.message
        assert "Product" in err.message

    @pytest.mark.asyncio
    async def test_exception_chain_suppressed(self, mocker: MockerFixture) -> None:
        """UserOwnershipError uses 'raise … from None' to hide internal CRUD error from clients."""
        user_id = uuid4()
        model_id = uuid4()
        original = _ownership_error(user_id, model_id)
        mocker.patch(
            "app.api.common.utils.ownership.get_nested_model_by_id",
            new_callable=AsyncMock,
            side_effect=original,
        )
        db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.model_label = "Model"

        with pytest.raises(UserOwnershipError) as exc_info:
            await get_user_owned_object(db=db, model=mock_model, model_id=model_id, owner_id=user_id)

        assert exc_info.value.__cause__ is None
        assert exc_info.value.__context__ is original
