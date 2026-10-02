"""Registration must cost the same work, and answer the same, whether or not the email is taken."""

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.auth.routers import register as register_module
from app.api.auth.schemas import UserRegister
from app.api.auth.services.user_manager import UserManager
from app.api.common.rate_limiting import RateLimitExceededError

if TYPE_CHECKING:
    from collections.abc import Iterator

USER = UserRegister(email="someone@example.com", password="correct horse battery staple", username="someone")


def _manager(*, existing_user: object | None) -> UserManager:
    user_db = MagicMock()
    user_db.get_by_email = AsyncMock(return_value=existing_user)
    user_db.create = AsyncMock(return_value=MagicMock(email=USER.email))
    manager = UserManager(user_db, http_client=None)
    manager.skip_password_validation = True
    manager.password_helper = MagicMock()
    manager.password_helper.hash = MagicMock(return_value="hash")
    manager.on_after_register = AsyncMock()
    manager.request_verify = AsyncMock()
    return manager


@pytest.fixture
def notify() -> Iterator[AsyncMock]:
    """Stub the request-scoped collaborators and capture the existing-account email."""
    with (
        patch.object(register_module, "get_email_checker", AsyncMock(return_value=None)),
        patch.object(register_module, "validate_user_create", AsyncMock(return_value=USER)),
        patch.object(register_module.limiter, "ahit_key", AsyncMock()),
        patch.object(register_module, "send_existing_account_notification", AsyncMock()) as mock_notify,
    ):
        yield mock_notify


@pytest.mark.usefixtures("notify")
@pytest.mark.parametrize("existing_user", [None, MagicMock()], ids=["fresh", "existing"])
async def test_both_paths_hash_the_password_once(existing_user: object | None) -> None:
    """A taken email skipping the hash would make registration a timing oracle for accounts."""
    manager = _manager(existing_user=existing_user)

    await register_module.register(MagicMock(), USER, manager)

    hasher = manager.password_helper.hash
    assert isinstance(hasher, MagicMock)
    hasher.assert_called_once_with(USER.password)


async def test_existing_account_email_respects_the_per_address_budget(notify: AsyncMock) -> None:
    """A spent budget skips the email silently and still answers with the uniform response."""
    manager = _manager(existing_user=MagicMock())

    with patch.object(register_module.limiter, "ahit_key", AsyncMock(side_effect=RateLimitExceededError())):
        response = await register_module.register(MagicMock(), USER, manager)

    assert response == register_module.RegistrationResponse()
    notify.assert_not_awaited()


async def test_existing_account_email_is_sent_within_budget(notify: AsyncMock) -> None:
    """The owner is told about the signup attempt while the budget lasts."""
    await register_module.register(MagicMock(), USER, _manager(existing_user=MagicMock()))

    notify.assert_awaited_once()
