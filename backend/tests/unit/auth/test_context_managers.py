"""Unit tests for programmatic auth user-manager context wiring."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from app.api.auth.services.programmatic_user_crud import get_chained_async_user_manager_context


class TestGetChainedAsyncUserManagerContext:
    """Tests for get_chained_async_user_manager_context."""

    async def test_uses_provided_session(self) -> None:
        """Test that a provided session is used directly."""
        mock_session = AsyncMock()
        mock_user_db = MagicMock()
        mock_user_manager = MagicMock()

        with (
            patch("app.api.auth.services.programmatic_user_crud.get_async_user_db_context") as mock_db_ctx,
            patch("app.api.auth.services.programmatic_user_crud.get_async_user_manager_context") as mock_mgr_ctx,
        ):
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_user_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_mgr_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_user_manager)
            mock_mgr_ctx.return_value.__aexit__ = AsyncMock(return_value=False)

            async with get_chained_async_user_manager_context(session=mock_session) as user_manager:
                assert user_manager == mock_user_manager

            mock_db_ctx.assert_called_once_with(mock_session)

    async def test_creates_session_when_not_provided(self) -> None:
        """Test that a new session is created when none is provided."""
        mock_db_session = AsyncMock()
        mock_user_db = MagicMock()
        mock_user_manager = MagicMock()

        with (
            patch("app.api.auth.services.programmatic_user_crud.async_session_context") as mock_session_ctx,
            patch("app.api.auth.services.programmatic_user_crud.get_async_user_db_context") as mock_db_ctx,
            patch("app.api.auth.services.programmatic_user_crud.get_async_user_manager_context") as mock_mgr_ctx,
        ):
            mock_session_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db_session)
            mock_session_ctx.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_user_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_mgr_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_user_manager)
            mock_mgr_ctx.return_value.__aexit__ = AsyncMock(return_value=False)

            async with get_chained_async_user_manager_context() as user_manager:
                assert user_manager == mock_user_manager

            mock_session_ctx.assert_called_once()
