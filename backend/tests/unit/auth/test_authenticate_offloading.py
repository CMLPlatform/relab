"""Contract tests for the offloaded authenticate flow.

``UserManager._authenticate_offloading_hashes`` reimplements
``BaseUserManager.authenticate`` so the Argon2 work can run off the event loop.
Reimplementation means upstream behaviour is no longer inherited, so the parts
that matter for security are pinned here: an unknown account still costs a hash,
a wrong password is refused, and a stale hash is upgraded.
"""

import threading
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi_users import exceptions

from app.api.auth.services.user_manager import UserManager


def _manager(*, get_by_email: AsyncMock, verified: bool = True, updated_hash: str | None = None) -> UserManager:
    manager = MagicMock(spec=UserManager)
    manager.get_by_email = get_by_email
    manager.password_helper = MagicMock()
    manager.password_helper.hash = MagicMock(return_value="fresh-hash")
    manager.password_helper.verify_and_update = MagicMock(return_value=(verified, updated_hash))
    manager.user_db = MagicMock()
    manager.user_db.update = AsyncMock()
    # Bind the real coroutine to the mock so only its collaborators are doubled.
    manager._authenticate_offloading_hashes = UserManager._authenticate_offloading_hashes.__get__(manager)
    return manager


def _credentials(password: str = "correct horse battery staple") -> MagicMock:
    credentials = MagicMock()
    credentials.username = "someone@example.com"
    credentials.password = password
    return credentials


async def test_unknown_account_still_pays_for_a_hash() -> None:
    """Skipping the hash for a missing account leaks account existence through timing."""
    manager = _manager(get_by_email=AsyncMock(side_effect=exceptions.UserNotExists()))

    assert await manager._authenticate_offloading_hashes(_credentials()) is None
    manager.password_helper.hash.assert_called_once()


async def test_wrong_password_is_refused() -> None:
    """A failed verification must not return the user."""
    user = MagicMock(hashed_password="stored-hash")
    manager = _manager(get_by_email=AsyncMock(return_value=user), verified=False)

    assert await manager._authenticate_offloading_hashes(_credentials()) is None
    manager.user_db.update.assert_not_awaited()


async def test_correct_password_returns_the_user_without_rewriting_the_hash() -> None:
    """A current hash needs no upgrade write on every login."""
    user = MagicMock(hashed_password="stored-hash")
    manager = _manager(get_by_email=AsyncMock(return_value=user))

    assert await manager._authenticate_offloading_hashes(_credentials()) is user
    manager.user_db.update.assert_not_awaited()


async def test_outdated_hash_is_upgraded_on_successful_login() -> None:
    """The opportunistic rehash is the only way stored hashes ever get stronger."""
    user = MagicMock(hashed_password="old-hash")
    manager = _manager(get_by_email=AsyncMock(return_value=user), updated_hash="stronger-hash")

    assert await manager._authenticate_offloading_hashes(_credentials()) is user
    manager.user_db.update.assert_awaited_once_with(user, {"hashed_password": "stronger-hash"})


@pytest.mark.parametrize("method", ["hash", "verify_and_update"])
async def test_hashing_runs_off_the_event_loop(method: str) -> None:
    """The whole point: neither hashing call may execute on the calling thread."""
    calling_thread = threading.get_ident()
    seen: list[int] = []

    def record(*_args: object) -> object:
        seen.append(threading.get_ident())
        return (True, None) if method == "verify_and_update" else "fresh-hash"

    if method == "hash":
        manager = _manager(get_by_email=AsyncMock(side_effect=exceptions.UserNotExists()))
        manager.password_helper.hash = MagicMock(side_effect=record)
    else:
        manager = _manager(get_by_email=AsyncMock(return_value=MagicMock(hashed_password="h")))
        manager.password_helper.verify_and_update = MagicMock(side_effect=record)

    await manager._authenticate_offloading_hashes(_credentials())

    assert seen, "the hashing call was never made"
    assert seen[0] != calling_thread
