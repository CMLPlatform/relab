"""Self-service account deletion: ``DELETE /v1/users/me``.

Goes through the real bearer login so the step-up password check, session revocation,
and cookie clearing run end to end.
"""

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any
from unittest.mock import ANY, AsyncMock, patch

import pytest
from fastapi import status
from sqlalchemy import Select, select

from app.api.application.account_erasure import ANONYMOUS_USER_EMAIL
from app.api.auth.models import OAuthAccount, User
from app.api.auth.services import mfa_service
from app.api.auth.services.account_security import RECENT_SIGN_IN_WINDOW
from app.api.auth.services.session_flow import SESSION_LOGOUT_CLEAR_SITE_DATA
from app.api.common.audit import AuditAction, AuditContext
from app.api.common.rate_limiting import Limiter
from app.api.data_collection.models.product import Product
from app.api.plugins.rpi_cam.models import Camera
from scripts.seed.factories.models import CameraFactory, UserFactory
from tests.fixtures.auth import totp_code
from tests.fixtures.client import override_authenticated_user
from tests.integration.api.auth.shared import (
    TEST_PASSWORD,
    assert_refresh_session_revoked,
    create_password_user,
    login_bearer,
)

if TYPE_CHECKING:
    from fastapi import FastAPI
    from httpx import AsyncClient
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.reference_data.models import ProductType

pytestmark = pytest.mark.api

ME = "/v1/users/me"
ROUTER = "app.api.application.routers.account_erasure"
BUDGET = "app.api.auth.services.rate_limiter"


async def _row_exists(session: AsyncSession, statement: Select[tuple[Any]]) -> bool:
    return (await session.execute(statement)).first() is not None


async def _login(api_client: AsyncClient, user: User) -> tuple[dict[str, str], str]:
    tokens = await login_bearer(api_client, email=user.email, password=TEST_PASSWORD)
    return {"Authorization": f"Bearer {tokens['access_token']}"}, str(tokens["refresh_token"])


async def test_self_deletion_anonymizes_content_and_erases_the_account(
    api_client: AsyncClient, db_session: AsyncSession, db_product_type: ProductType
) -> None:
    """Products move to the anonymous account; personal data, cameras, links and sessions go."""
    user = await create_password_user(db_session, email="leaving@example.com", username="leaving_user")
    product = Product(owner_id=user.id, name="Owned product", product_type=db_product_type)
    component = Product(owner_id=user.id, name="Owned component", parent=product, amount_in_parent=1)
    oauth_account = OAuthAccount(
        user_id=user.id,
        oauth_name="google",
        access_token="access-token",  # test fixture value, not a credential
        account_id="oauth-account-self",
        account_email="leaving@example.com",
    )
    db_session.add_all([product, component, oauth_account])
    camera = await CameraFactory.create_async(session=db_session, owner_id=user.id)
    await db_session.flush()
    user_id = user.id
    headers, refresh_token = await _login(api_client, user)

    with (
        patch(f"{ROUTER}.audit_event") as log_audit,
        patch(f"{ROUTER}.send_account_deleted_notification", new=AsyncMock()) as notify,
    ):
        response = await api_client.request("DELETE", ME, json={"current_password": TEST_PASSWORD}, headers=headers)

    assert response.status_code == status.HTTP_204_NO_CONTENT
    anonymous_id = (await db_session.execute(select(User.id).where(User.email == ANONYMOUS_USER_EMAIL))).scalar_one()
    owners = (
        (await db_session.execute(select(Product.owner_id).where(Product.id.in_([product.id, component.id]))))
        .scalars()
        .all()
    )
    assert list(owners) == [anonymous_id, anonymous_id]
    assert not await _row_exists(db_session, select(User.id).where(User.id == user_id))
    assert not await _row_exists(db_session, select(Camera.id).where(Camera.id == camera.id))
    assert not await _row_exists(db_session, select(OAuthAccount.id).where(OAuthAccount.user_id == user_id))
    log_audit.assert_called_once_with(
        user_id, AuditAction.DELETE, User, user_id, context=AuditContext(operation="erase_anonymize", flow="self")
    )
    # Out-of-band notice to the former address, so a deletion never goes unnoticed.
    notify.assert_awaited_once_with("leaving@example.com", "leaving_user", background_tasks=ANY)
    # Signed out everywhere: cookies cleared here, refresh sessions revoked, token dead.
    assert response.headers["Clear-Site-Data"] == SESSION_LOGOUT_CLEAR_SITE_DATA
    assert "set-cookie" in response.headers
    await assert_refresh_session_revoked(api_client, refresh_token)
    assert (await api_client.get(ME, headers=headers)).status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        (None, status.HTTP_400_BAD_REQUEST),
        ({}, status.HTTP_400_BAD_REQUEST),
        ({"current_password": "not-the-password-42"}, status.HTTP_403_FORBIDDEN),
    ],
    ids=["no-body", "no-password", "wrong-password"],
)
async def test_self_deletion_requires_the_current_password(
    api_client: AsyncClient, db_session: AsyncSession, body: dict[str, str] | None, expected: int
) -> None:
    """Without a valid step-up password the account and its sessions stay untouched."""
    user = await create_password_user(db_session, email="staying@example.com", username="staying_user")
    headers, refresh_token = await _login(api_client, user)

    with patch(f"{ROUTER}.revoke_user_refresh_tokens") as revoke:
        response = await api_client.request("DELETE", ME, json=body, headers=headers)

    assert response.status_code == expected
    assert await _row_exists(db_session, select(User.id).where(User.id == user.id))
    revoke.assert_not_called()
    refreshed = await api_client.post("/v1/auth/bearer/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == status.HTTP_200_OK


@pytest.mark.parametrize("fresh", [True, False], ids=["fresh-sign-in", "stale-sign-in"])
async def test_oauth_only_account_without_mfa_needs_a_recent_sign_in(
    api_client: AsyncClient, db_session: AsyncSession, db_user: User, test_app: FastAPI, *, fresh: bool
) -> None:
    """With no password and no MFA to re-enter, only a fresh sign-in can delete the account."""
    db_user.has_usable_password = False
    age = timedelta(minutes=1) if fresh else RECENT_SIGN_IN_WINDOW + timedelta(minutes=1)
    db_user.last_login_at = datetime.now(UTC) - age
    await db_session.flush()
    user_id = db_user.id

    with (
        override_authenticated_user(test_app, db_user),
        patch(f"{ROUTER}.revoke_user_refresh_tokens") as revoke,
    ):
        response = await api_client.delete(ME)

    if fresh:
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not await _row_exists(db_session, select(User.id).where(User.id == user_id))
    else:
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.json()["code"] == "RecentSignInRequiredError"
        assert await _row_exists(db_session, select(User.id).where(User.id == user_id))
        revoke.assert_not_called()


async def test_failed_step_ups_are_limited_per_account(
    api_client: AsyncClient, db_session: AsyncSession, test_app: FastAPI
) -> None:
    """Wrong passwords spend a per-account budget; once spent, even the right one waits."""
    user = await create_password_user(db_session, email="guessed@example.com", username="guessed_user")

    with (
        override_authenticated_user(test_app, user),
        patch(f"{BUDGET}.limiter", new=Limiter(storage_uri="memory://")),
    ):
        wrong = [
            (await api_client.request("DELETE", ME, json={"current_password": "not-the-password-42"})).status_code
            for _ in range(3)
        ]
        blocked = await api_client.request("DELETE", ME, json={"current_password": TEST_PASSWORD})

    assert wrong == [status.HTTP_403_FORBIDDEN] * 3
    assert blocked.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert await _row_exists(db_session, select(User.id).where(User.id == user.id))


@pytest.mark.parametrize("other_admin", [False, True], ids=["last-admin", "another-admin-active"])
async def test_superuser_self_deletion_is_blocked_only_for_the_last_admin(
    api_client: AsyncClient, db_session: AsyncSession, *, other_admin: bool
) -> None:
    """The only remaining admin keeps their account and sessions; with another admin active, deletion proceeds."""
    admin = await create_password_user(db_session, email="admin@example.com", username="admin_user", is_superuser=True)
    if other_admin:
        await UserFactory.create_async(session=db_session, is_active=True, is_superuser=True)
        await db_session.flush()
    headers, _ = await _login(api_client, admin)

    with patch(f"{ROUTER}.revoke_user_refresh_tokens") as revoke:
        response = await api_client.request("DELETE", ME, json={"current_password": TEST_PASSWORD}, headers=headers)

    if other_admin:
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not await _row_exists(db_session, select(User.id).where(User.id == admin.id))
    else:
        assert response.status_code == status.HTTP_409_CONFLICT
        assert await _row_exists(db_session, select(User.id).where(User.id == admin.id))
        revoke.assert_not_called()


async def _mfa_user(db_session: AsyncSession, **overrides: Any) -> tuple[User, str, list[str]]:
    """Create an MFA-enabled password user; return it with its TOTP secret and recovery codes."""
    secret = mfa_service.generate_totp_secret()
    codes, hashes = mfa_service.generate_recovery_codes()
    user = await create_password_user(
        db_session,
        email="mfa-leaving@example.com",
        username="mfa_leaving",
        mfa_enabled=True,
        mfa_totp_secret=secret,
        mfa_recovery_codes=hashes,
        **overrides,
    )
    return user, secret, codes


@pytest.mark.parametrize("factor", ["totp", "recovery"])
async def test_mfa_account_deletes_with_a_valid_code(
    api_client: AsyncClient, db_session: AsyncSession, test_app: FastAPI, factor: str
) -> None:
    """With MFA on, the password plus a current TOTP or a recovery code deletes the account."""
    user, secret, recovery_codes = await _mfa_user(db_session)
    user_id = user.id
    code = totp_code(secret) if factor == "totp" else recovery_codes[0]

    with override_authenticated_user(test_app, user):
        response = await api_client.request("DELETE", ME, json={"current_password": TEST_PASSWORD, "mfa_code": code})

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not await _row_exists(db_session, select(User.id).where(User.id == user_id))


async def test_oauth_only_mfa_account_still_needs_the_code(
    api_client: AsyncClient, db_session: AsyncSession, test_app: FastAPI
) -> None:
    """No password to re-enter does not waive the second factor."""
    user, secret, _ = await _mfa_user(db_session, has_usable_password=False)
    user_id = user.id

    with override_authenticated_user(test_app, user):
        missing = await api_client.delete(ME)
        response = await api_client.request("DELETE", ME, json={"mfa_code": totp_code(secret)})

    assert missing.status_code == status.HTTP_400_BAD_REQUEST
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not await _row_exists(db_session, select(User.id).where(User.id == user_id))


@pytest.mark.parametrize("case", ["missing", "wrong", "replayed", "wrong-password"])
async def test_mfa_account_deletion_rejects_without_a_valid_code(
    api_client: AsyncClient,
    db_session: AsyncSession,
    test_app: FastAPI,
    mock_redis_dependency: Redis,
    case: str,
) -> None:
    """A missing, wrong or already-used code leaves the account and its sessions untouched."""
    user, secret, _ = await _mfa_user(db_session)
    valid = totp_code(secret)
    body: dict[str, str] = {"current_password": TEST_PASSWORD, "mfa_code": valid}
    expected = status.HTTP_403_FORBIDDEN
    if case == "missing":
        del body["mfa_code"]
        expected = status.HTTP_400_BAD_REQUEST
    elif case == "wrong":
        body["mfa_code"] = "000000" if valid != "000000" else "000001"
    elif case == "replayed":
        # The same code already spent elsewhere (e.g. to sign in) must not count again.
        assert await mfa_service.verify_totp_code_once(
            mock_redis_dependency, user_id=user.id, secret=secret, code=valid
        )
    else:
        # The password step-up runs first, so a wrong password never spends the code.
        body["current_password"] = "not-the-password-42"
        expected = status.HTTP_403_FORBIDDEN

    with (
        override_authenticated_user(test_app, user),
        patch(f"{ROUTER}.revoke_user_refresh_tokens") as revoke,
    ):
        response = await api_client.request("DELETE", ME, json=body)

    assert response.status_code == expected
    if case == "missing":
        assert "authentication code" in response.json()["detail"].lower()
    assert await _row_exists(db_session, select(User.id).where(User.id == user.id))
    revoke.assert_not_called()
    if case == "wrong-password":
        # The code survived: the right password with the same code now deletes the account.
        with override_authenticated_user(test_app, user):
            retry = await api_client.request("DELETE", ME, json={"current_password": TEST_PASSWORD, "mfa_code": valid})
        assert retry.status_code == status.HTTP_204_NO_CONTENT


async def test_refused_deletion_does_not_spend_the_mfa_code(
    api_client: AsyncClient, db_session: AsyncSession, test_app: FastAPI, mock_redis_dependency: Redis
) -> None:
    """The last-superuser guard runs before the MFA step-up, so a 409 leaves the TOTP code unused."""
    user, secret, _ = await _mfa_user(db_session, is_superuser=True)
    code = totp_code(secret)

    with override_authenticated_user(test_app, user):
        response = await api_client.request("DELETE", ME, json={"current_password": TEST_PASSWORD, "mfa_code": code})

    assert response.status_code == status.HTTP_409_CONFLICT
    assert await mfa_service.verify_totp_code_once(mock_redis_dependency, user_id=user.id, secret=secret, code=code)
