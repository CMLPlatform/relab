"""Unit tests for the create_superuser script."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

import pytest
from fastapi_users.exceptions import UserAlreadyExists
from pydantic import SecretStr

from scripts import create_superuser as create_superuser_script

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from pytest_mock import MockerFixture


@pytest.mark.unit
class TestCreateSuperuserScript:
    """Verify the create_superuser script contract."""

    async def test_create_superuser_requires_credentials(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The script should fail fast when credentials are missing."""
        monkeypatch.setattr(create_superuser_script.settings, "superuser_email", "")
        monkeypatch.setattr(create_superuser_script.settings, "superuser_password", SecretStr(""))

        with pytest.raises(ValueError, match="SUPERUSER_EMAIL and SUPERUSER_PASSWORD"):
            await create_superuser_script.create_superuser()

    async def test_create_superuser_creates_expected_user(
        self,
        monkeypatch: pytest.MonkeyPatch,
        mocker: MockerFixture,
    ) -> None:
        """The script should pass the expected superuser payload to create_user."""
        session = object()

        @asynccontextmanager
        async def fake_session_context() -> AsyncIterator[object]:
            yield session

        create_user_mock = mocker.AsyncMock()

        monkeypatch.setattr(create_superuser_script.settings, "superuser_email", "admin@example.com")
        monkeypatch.setattr(create_superuser_script.settings, "superuser_password", SecretStr("very-secret"))
        monkeypatch.setattr(create_superuser_script, "async_session_context", fake_session_context)
        monkeypatch.setattr(create_superuser_script, "create_user", create_user_mock)

        await create_superuser_script.create_superuser()

        create_user_mock.assert_awaited_once()
        kwargs = create_user_mock.await_args.kwargs
        user_create = kwargs["user_create"]

        assert kwargs["async_session"] is session
        assert kwargs["send_registration_email"] is False
        assert user_create.email == "admin@example.com"
        assert user_create.password == "very-secret"
        assert user_create.organization_id is None
        assert user_create.is_superuser is True
        assert user_create.is_verified is True

    async def test_create_superuser_swallows_duplicate_user_errors(
        self,
        monkeypatch: pytest.MonkeyPatch,
        mocker: MockerFixture,
    ) -> None:
        """Existing users should not make the script crash."""

        @asynccontextmanager
        async def fake_session_context() -> AsyncIterator[object]:
            yield object()

        warning_mock = mocker.patch.object(create_superuser_script.logger, "warning")
        create_user_mock = mocker.AsyncMock(side_effect=UserAlreadyExists())

        monkeypatch.setattr(create_superuser_script.settings, "superuser_email", "admin@example.com")
        monkeypatch.setattr(create_superuser_script.settings, "superuser_password", SecretStr("very-secret"))
        monkeypatch.setattr(create_superuser_script, "async_session_context", fake_session_context)
        monkeypatch.setattr(create_superuser_script, "create_user", create_user_mock)

        await create_superuser_script.create_superuser()

        warning_mock.assert_called_once()

    def test_main_runs_async_entrypoint(self, mocker: MockerFixture) -> None:
        """The CLI entrypoint should delegate to anyio.run."""
        run_mock = mocker.patch.object(create_superuser_script.anyio, "run")

        create_superuser_script.main()

        run_mock.assert_called_once_with(create_superuser_script.create_superuser)
