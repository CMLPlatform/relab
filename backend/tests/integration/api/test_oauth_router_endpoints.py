"""Integration tests for small OAuth router endpoints."""

from typing import TYPE_CHECKING, cast

import pytest
from fastapi import FastAPI, status

from app.api.auth.models import OAuthAccount, User
from app.api.auth.services.password_hashing import build_password_helper
from tests.factories.models import UserFactory
from tests.fixtures.client import override_authenticated_user

KNOWN_PASSWORD = "correct-horse-battery-staple-v9"  # gitleaks:allow # test-only password, not a secret


def _link_google(user: User) -> OAuthAccount:
    """Build a linked Google OAuth account for a user."""
    return OAuthAccount(
        user_id=user.id,
        oauth_name="google",
        access_token="access-token",
        expires_at=None,
        refresh_token=None,
        account_id="provider-user-123",
        account_email=user.email,
    )


if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


def _detail_text(payload: dict[str, object]) -> str:
    """Return a comparable error-detail string across supported error shapes."""
    detail = payload["detail"]
    if isinstance(detail, dict):
        detail_dict = cast("dict[str, object]", detail)
        return str(detail_dict.get("message") or "")
    return str(detail)


@pytest.fixture
async def active_user(db_session: AsyncSession) -> User:
    """Create a regular active user for OAuth route tests."""
    return await UserFactory.create_async(session=db_session, is_superuser=False, is_active=True, is_verified=True)


@pytest.fixture
async def active_user_client(
    api_client: AsyncClient, active_user: User, test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    """Authenticated client acting as a regular active user."""
    with override_authenticated_user(test_app, active_user, optional=False):
        yield api_client


async def test_rejects_invalid_provider(active_user_client: AsyncClient) -> None:
    """Unsupported providers should return a stable 400 response."""
    response = await active_user_client.delete("/v1/oauth/discord/associate")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "invalid oauth provider" in _detail_text(response.json()).lower()


async def test_returns_404_when_account_not_linked(active_user_client: AsyncClient) -> None:
    """Deleting a missing OAuth association should return 404."""
    response = await active_user_client.delete("/v1/oauth/google/associate")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "not linked" in _detail_text(response.json()).lower()


async def test_oauth_only_user_unlinks_without_password(
    active_user_client: AsyncClient,
    active_user: User,
    db_session: AsyncSession,
) -> None:
    """An OAuth-only account (no usable password) unlinks without a password."""
    active_user.has_usable_password = False
    oauth_account = _link_google(active_user)
    db_session.add(oauth_account)
    await db_session.flush()

    response = await active_user_client.delete("/v1/oauth/google/associate")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert await db_session.get(OAuthAccount, oauth_account.id) is None


async def test_unlink_requires_password_when_account_has_one(
    active_user_client: AsyncClient,
    active_user: User,
    db_session: AsyncSession,
) -> None:
    """A password account must re-authenticate to unlink; missing password is 400."""
    active_user.has_usable_password = True
    oauth_account = _link_google(active_user)
    db_session.add(oauth_account)
    await db_session.flush()

    response = await active_user_client.delete("/v1/oauth/google/associate")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    # The link survives a rejected step-up.
    assert await db_session.get(OAuthAccount, oauth_account.id) is not None


async def test_unlink_rejects_wrong_password(
    active_user_client: AsyncClient,
    active_user: User,
    db_session: AsyncSession,
) -> None:
    """A wrong current password is a 401 and leaves the link in place."""
    active_user.has_usable_password = True
    active_user.hashed_password = build_password_helper().hash(KNOWN_PASSWORD)
    oauth_account = _link_google(active_user)
    db_session.add(oauth_account)
    await db_session.flush()

    response = await active_user_client.request(
        "DELETE", "/v1/oauth/google/associate", json={"current_password": "wrong-password"}
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert await db_session.get(OAuthAccount, oauth_account.id) is not None


async def test_unlink_succeeds_with_correct_password(
    active_user_client: AsyncClient,
    active_user: User,
    db_session: AsyncSession,
) -> None:
    """The correct current password unlinks the account."""
    active_user.has_usable_password = True
    active_user.hashed_password = build_password_helper().hash(KNOWN_PASSWORD)
    oauth_account = _link_google(active_user)
    db_session.add(oauth_account)
    await db_session.flush()

    response = await active_user_client.request(
        "DELETE", "/v1/oauth/google/associate", json={"current_password": KNOWN_PASSWORD}
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert await db_session.get(OAuthAccount, oauth_account.id) is None
