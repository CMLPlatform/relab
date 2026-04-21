"""OAuth callback and association flow tests."""
# ruff: noqa: SLF001 # Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException, status
from fastapi_users.exceptions import UserAlreadyExists
from fastapi_users.router.common import ErrorCode

from ._oauth_support import (
    TEST_EMAIL,
    make_associate_builder,
    make_associate_request_with_valid_state,
    make_auth_builder,
    make_request_with_valid_state,
)
from .shared import USER1_EMAIL, USER2_EMAIL

if TYPE_CHECKING:
    from collections.abc import Mapping


class TestOAuthCallbackLinkingPolicy:
    """Cover account-linking rules in the OAuth callback flow."""

    async def test_callback_passes_associate_by_email_false(self) -> None:
        """Disables implicit email-based account linking."""
        builder = make_auth_builder()
        request, access_token_state = make_request_with_valid_state()

        user = MagicMock()
        user.is_active = True

        user_manager = MagicMock()
        user_manager.oauth_callback = AsyncMock(return_value=user)
        user_manager.on_after_login = AsyncMock()

        strategy = MagicMock()

        response = await builder._get_callback_handler(request, access_token_state, user_manager, strategy)
        assert response.status_code == status.HTTP_200_OK
        assert user_manager.oauth_callback.await_args is not None
        assert user_manager.oauth_callback.await_args.kwargs["associate_by_email"] is False

    async def test_callback_returns_stable_existing_user_error(self) -> None:
        """Maps duplicate-user errors to the stable OAuth error code."""
        builder = make_auth_builder()
        request, access_token_state = make_request_with_valid_state()

        user_manager = MagicMock()
        user_manager.oauth_callback = AsyncMock(side_effect=UserAlreadyExists())
        user_manager.on_after_login = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_callback_handler(request, access_token_state, user_manager, MagicMock())

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == ErrorCode.OAUTH_USER_ALREADY_EXISTS


class TestOAuthAssociateFlow:
    """Cover linking an OAuth provider to the current user."""

    async def test_associate_callback_links_provider_for_current_user(self) -> None:
        """Associates the provider when it is not already linked elsewhere."""
        builder = make_associate_builder()
        current_user = MagicMock()
        current_user.id = USER1_EMAIL
        current_user.email = TEST_EMAIL

        request, access_token_state = make_associate_request_with_valid_state(str(current_user.id))
        mock_session = MagicMock()
        mock_scalars_result = MagicMock()
        mock_scalars_result.first.return_value = None
        mock_exec_result = MagicMock()
        mock_exec_result.scalars.return_value = mock_scalars_result
        mock_session.execute = AsyncMock(return_value=mock_exec_result)

        user_manager = MagicMock()
        user_manager.user_db.session = mock_session
        user_manager.oauth_associate_callback = AsyncMock(return_value=current_user)

        result = cast(
            "Mapping[str, Any]",
            await builder._get_callback_handler(request, current_user, access_token_state, user_manager),
        )

        assert result["email"] == TEST_EMAIL
        assert user_manager.oauth_associate_callback.await_count == 1

    async def test_associate_callback_rejects_provider_linked_to_other_user(self) -> None:
        """Rejects association when the provider belongs to a different user."""
        builder = make_associate_builder()
        current_user = MagicMock()
        current_user.id = USER1_EMAIL
        current_user.email = TEST_EMAIL

        request, access_token_state = make_associate_request_with_valid_state(str(current_user.id))
        existing_account = MagicMock()
        existing_account.user_id = USER2_EMAIL

        mock_session = MagicMock()
        mock_scalars_result = MagicMock()
        mock_scalars_result.first.return_value = existing_account
        mock_exec_result = MagicMock()
        mock_exec_result.scalars.return_value = mock_scalars_result
        mock_session.execute = AsyncMock(return_value=mock_exec_result)

        user_manager = MagicMock()
        user_manager.user_db.session = mock_session
        user_manager.oauth_associate_callback = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_callback_handler(request, current_user, access_token_state, user_manager)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == "This account is already linked to another user."
