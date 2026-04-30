"""Unit tests for the create_user script."""

from __future__ import annotations

from argparse import Namespace
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

import pytest
from fastapi_users.exceptions import UserAlreadyExists

from scripts.users import create_user as create_user_script

SCRIPT_TEST_PASSWORD = "correct-horse-battery-staple-v42"

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from pytest_mock import MockerFixture


class TestCreateUserScript:
    """Verify the create_user script contract."""

    async def test_create_user_requires_credentials(self) -> None:
        """The function should fail fast when credentials are missing."""
        with pytest.raises(ValueError, match="email and password must be provided"):
            await create_user_script.create_normal_user("", None, "pw")

    async def test_create_user_forwards_optional_name(
        self,
        monkeypatch: pytest.MonkeyPatch,
        mocker: MockerFixture,
    ) -> None:
        """The function should include the provided username when present."""
        session = object()

        @asynccontextmanager
        async def fake_session_context() -> AsyncIterator[object]:
            yield session

        create_user_mock = mocker.AsyncMock()

        monkeypatch.setattr(create_user_script, "async_session_context", fake_session_context)
        monkeypatch.setattr(create_user_script, "create_user", create_user_mock)

        await create_user_script.create_normal_user("user@example.com", "alice", SCRIPT_TEST_PASSWORD)

        kwargs = create_user_mock.await_args.kwargs
        user_create = kwargs["user_create"]

        assert user_create.username == "alice"

    async def test_create_user_creates_expected_user(
        self,
        monkeypatch: pytest.MonkeyPatch,
        mocker: MockerFixture,
    ) -> None:
        """The function should pass the expected payload to create_user."""
        session = object()

        @asynccontextmanager
        async def fake_session_context() -> AsyncIterator[object]:
            yield session

        create_user_mock = mocker.AsyncMock()

        monkeypatch.setattr(create_user_script, "async_session_context", fake_session_context)
        monkeypatch.setattr(create_user_script, "create_user", create_user_mock)

        await create_user_script.create_normal_user("user@example.com", None, SCRIPT_TEST_PASSWORD)

        create_user_mock.assert_awaited_once()
        kwargs = create_user_mock.await_args.kwargs
        user_create = kwargs["user_create"]

        assert kwargs["async_session"] is session
        assert kwargs["send_registration_email"] is False
        assert user_create.email == "user@example.com"
        assert user_create.username is None
        assert user_create.password == SCRIPT_TEST_PASSWORD
        assert user_create.organization_id is None
        assert user_create.is_superuser is False
        assert user_create.is_verified is True

    async def test_create_user_swallows_duplicate_user_errors(
        self,
        monkeypatch: pytest.MonkeyPatch,
        mocker: MockerFixture,
    ) -> None:
        """Existing users should not make the function crash."""

        @asynccontextmanager
        async def fake_session_context() -> AsyncIterator[object]:
            yield object()

        warning_mock = mocker.patch.object(create_user_script.logger, "warning")
        create_user_mock = mocker.AsyncMock(side_effect=UserAlreadyExists())

        monkeypatch.setattr(create_user_script, "async_session_context", fake_session_context)
        monkeypatch.setattr(create_user_script, "create_user", create_user_mock)

        await create_user_script.create_normal_user("user@example.com", "alice", SCRIPT_TEST_PASSWORD)

        warning_mock.assert_called_once()

    def test_main_runs_async_entrypoint(self, mocker: MockerFixture) -> None:
        """The CLI entrypoint should delegate to anyio.run with parsed args."""
        run_mock = mocker.patch.object(create_user_script.anyio, "run")

        monkeypatch_ns = Namespace(email="x@y.com", username="bob", password="pw")
        mocker.patch.object(create_user_script, "parse_args", return_value=monkeypatch_ns)

        create_user_script.main()

        run_mock.assert_called_once_with(create_user_script.create_normal_user, "x@y.com", "bob", "pw")
