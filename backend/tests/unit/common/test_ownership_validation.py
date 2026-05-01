"""Unit tests for get_user_owned_object ownership enforcement."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.ownership import get_user_owned_object

if TYPE_CHECKING:
    from pytest_mock import MockerFixture


class TestGetUserOwnedObject:
    """get_user_owned_object enforces owner scoping and maps failures cleanly."""

    async def test_success_returns_object_and_filters_by_default_owner_fk(self, mocker: MockerFixture) -> None:
        """Happy path: returned object matches and the default FK is owner_id."""
        user_id = uuid4()
        model_id = uuid4()
        expected = MagicMock()
        expected.owner_id = user_id
        statement = MagicMock()
        statement.where.return_value = statement
        mocker.patch("app.api.common.ownership.select", return_value=statement)
        execute_result = MagicMock()
        execute_result.scalars.return_value.unique.return_value.one_or_none.return_value = expected
        db = AsyncMock(spec=AsyncSession)
        db.execute.return_value = execute_result
        mock_model = MagicMock()
        mock_model.id = MagicMock()
        mock_model.owner_id = MagicMock()

        result = await get_user_owned_object(db=db, model=mock_model, model_id=model_id, owner_id=user_id)

        assert result is expected
        assert len(statement.where.call_args.args) == 2
        db.execute.assert_awaited_once()

    async def test_success_respects_custom_owner_fk(self, mocker: MockerFixture) -> None:
        """Custom owner FK names should be checked and queried consistently."""
        user_id = uuid4()
        model_id = uuid4()
        expected = MagicMock()
        expected.created_by_id = user_id
        statement = MagicMock()
        statement.where.return_value = statement
        mocker.patch("app.api.common.ownership.select", return_value=statement)
        execute_result = MagicMock()
        execute_result.scalars.return_value.unique.return_value.one_or_none.return_value = expected
        db = AsyncMock(spec=AsyncSession)
        db.execute.return_value = execute_result
        mock_model = MagicMock()
        mock_model.id = MagicMock()
        mock_model.created_by_id = MagicMock()

        result = await get_user_owned_object(
            db=db, model=mock_model, model_id=model_id, owner_id=user_id, user_fk="created_by_id"
        )

        assert result is expected
        assert len(statement.where.call_args.args) == 2

    async def test_ownership_mismatch_raises_model_not_found(self, mocker: MockerFixture) -> None:
        """Mismatched owner IDs are hidden behind the same error as missing rows."""
        user_id = uuid4()
        model_id = uuid4()
        statement = MagicMock()
        statement.where.return_value = statement
        mocker.patch("app.api.common.ownership.select", return_value=statement)
        execute_result = MagicMock()
        execute_result.scalars.return_value.unique.return_value.one_or_none.return_value = None
        db = AsyncMock(spec=AsyncSession)
        db.execute.return_value = execute_result
        mock_model = MagicMock()
        mock_model.model_label = "Product"

        with pytest.raises(ModelNotFoundError):
            await get_user_owned_object(db=db, model=mock_model, model_id=model_id, owner_id=user_id)

    async def test_missing_object_raises_model_not_found(self, mocker: MockerFixture) -> None:
        """Missing owned objects should surface as ModelNotFoundError."""
        user_id = uuid4()
        model_id = uuid4()
        statement = MagicMock()
        statement.where.return_value = statement
        mocker.patch("app.api.common.ownership.select", return_value=statement)
        execute_result = MagicMock()
        execute_result.scalars.return_value.unique.return_value.one_or_none.return_value = None
        db = AsyncMock(spec=AsyncSession)
        db.execute.return_value = execute_result
        mock_model = MagicMock()
        mock_model.model_label = "Product"

        with pytest.raises(ModelNotFoundError):
            await get_user_owned_object(db=db, model=mock_model, model_id=model_id, owner_id=user_id)
