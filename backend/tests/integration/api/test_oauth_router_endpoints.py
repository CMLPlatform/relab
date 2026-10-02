"""Integration tests for small OAuth router endpoints."""

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, cast

import pyotp
import pytest
from fastapi import FastAPI, status

from app.api.auth.models import OAuthAccount, User
from app.api.auth.services import mfa_service
from app.api.auth.services.account_security import RECENT_SIGN_IN_WINDOW
from app.api.auth.services.password_hashing import build_password_helper
from scripts.seed.factories.models import UserFactory
from tests.fixtures.auth import totp_code
from tests.fixtures.client import override_authenticated_user
from tests.integration.api.auth.shared import TEST_PASSWORD, create_password_user, link_google, login_bearer

KNOWN_PASSWORD = "correct-horse-battery-staple-v9"  # gitleaks:allow # test-only password, not a secret


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
    """An OAuth-only account (no usable password) unlinks without a password after a recent sign-in."""
    active_user.has_usable_password = False
    active_user.last_login_at = datetime.now(UTC)
    oauth_account = await link_google(db_session, active_user)

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
    oauth_account = await link_google(db_session, active_user)

    response = await active_user_client.delete("/v1/oauth/google/associate")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    # The link survives a rejected step-up.
    assert await db_session.get(OAuthAccount, oauth_account.id) is not None


async def test_unlink_rejects_wrong_password(
    active_user_client: AsyncClient,
    active_user: User,
    db_session: AsyncSession,
) -> None:
    """A wrong current password is a 403 and leaves the link in place."""
    active_user.has_usable_password = True
    active_user.hashed_password = build_password_helper().hash(KNOWN_PASSWORD)
    oauth_account = await link_google(db_session, active_user)

    response = await active_user_client.request(
        "DELETE", "/v1/oauth/google/associate", json={"current_password": "wrong-password"}
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert await db_session.get(OAuthAccount, oauth_account.id) is not None


async def test_unlink_succeeds_with_correct_password(
    active_user_client: AsyncClient,
    active_user: User,
    db_session: AsyncSession,
) -> None:
    """The correct current password unlinks the account."""
    active_user.has_usable_password = True
    active_user.hashed_password = build_password_helper().hash(KNOWN_PASSWORD)
    oauth_account = await link_google(db_session, active_user)

    response = await active_user_client.request(
        "DELETE", "/v1/oauth/google/associate", json={"current_password": KNOWN_PASSWORD}
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert await db_session.get(OAuthAccount, oauth_account.id) is None


@pytest.mark.parametrize(
    ("method", "path"),
    [("POST", "/v1/oauth/google/associate/authorize"), ("DELETE", "/v1/oauth/google/associate")],
    ids=["link", "unlink"],
)
async def test_passwordless_account_with_stale_sign_in_cannot_change_social_logins(
    api_client: AsyncClient, db_session: AsyncSession, method: str, path: str
) -> None:
    """With no password to re-enter, linking or unlinking needs a recent sign-in, not just a live session."""
    user = await create_password_user(
        db_session, email=f"stale-{method.lower()}@example.com", username=f"stale_{method.lower()}"
    )
    tokens = await login_bearer(api_client, email=user.email, password=TEST_PASSWORD)
    user.has_usable_password = False
    user.last_login_at = datetime.now(UTC) - RECENT_SIGN_IN_WINDOW - timedelta(minutes=1)
    oauth_account = await link_google(db_session, user)

    response = await api_client.request(method, path, headers={"Authorization": f"Bearer {tokens['access_token']}"})

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert "sign in again" in _detail_text(response.json()).lower()
    assert await db_session.get(OAuthAccount, oauth_account.id) is not None


SOCIAL_LOGIN_ROUTES = [("POST", "/v1/oauth/google/associate/authorize"), ("DELETE", "/v1/oauth/google/associate")]


async def _signed_in_mfa_user(
    api_client: AsyncClient, db_session: AsyncSession, name: str
) -> tuple[User, str, dict[str, str], OAuthAccount]:
    """Sign in for real (link resolves the user through fastapi-users), then enrol MFA and link Google."""
    user = await create_password_user(db_session, email=f"{name}@example.com", username=name)
    tokens = await login_bearer(api_client, email=user.email, password=TEST_PASSWORD)
    secret = pyotp.random_base32()
    user.mfa_enabled = True
    user.mfa_totp_secret = secret
    oauth_account = await link_google(db_session, user)
    return user, secret, {"Authorization": f"Bearer {tokens['access_token']}"}, oauth_account


@pytest.mark.parametrize(("method", "path"), SOCIAL_LOGIN_ROUTES, ids=["link", "unlink"])
async def test_mfa_account_needs_a_code_to_change_social_logins(
    api_client: AsyncClient, db_session: AsyncSession, method: str, path: str
) -> None:
    """With MFA on, the password alone does not link or unlink a sign-in provider."""
    _user, secret, headers, oauth_account = await _signed_in_mfa_user(api_client, db_session, f"mfa_{method.lower()}")
    wrong = "000000" if totp_code(secret) != "000000" else "000001"

    missing = await api_client.request(method, path, json={"current_password": TEST_PASSWORD}, headers=headers)
    wrong_code = await api_client.request(
        method, path, json={"current_password": TEST_PASSWORD, "mfa_code": wrong}, headers=headers
    )

    assert missing.status_code == status.HTTP_400_BAD_REQUEST
    assert wrong_code.status_code == status.HTTP_403_FORBIDDEN
    assert await db_session.get(OAuthAccount, oauth_account.id) is not None

    ok = await api_client.request(
        method, path, json={"current_password": TEST_PASSWORD, "mfa_code": totp_code(secret)}, headers=headers
    )
    assert ok.status_code in {status.HTTP_200_OK, status.HTTP_204_NO_CONTENT}, ok.text


async def test_recovery_code_spent_on_unlink_cannot_be_reused(
    api_client: AsyncClient, db_session: AsyncSession
) -> None:
    """A recovery code used as the unlink step-up is burned, unlike deletion where the account goes."""
    user, _secret, headers, _oauth_account = await _signed_in_mfa_user(api_client, db_session, "mfa_recovery_unlink")
    codes, hashes = mfa_service.generate_recovery_codes()
    user.mfa_recovery_codes = hashes
    await db_session.flush()
    body = {"current_password": TEST_PASSWORD, "mfa_code": codes[0]}

    first = await api_client.request("DELETE", "/v1/oauth/google/associate", json=body, headers=headers)
    await link_google(db_session, user, account_id="provider-user-456")
    second = await api_client.request("DELETE", "/v1/oauth/google/associate", json=body, headers=headers)

    assert first.status_code == status.HTTP_204_NO_CONTENT
    assert second.status_code == status.HTTP_403_FORBIDDEN
