"""The MFA login challenge and every signed-in re-authentication share one per-account budget.

A wrong password, TOTP or recovery code on any of these routes counts against the account,
not only against the client IP, so an attacker with a stolen session cannot rotate IPs or
routes to keep guessing. Signs in for real: several of these routes resolve the user through
fastapi-users' own dependency, which the shared override does not reach.
"""

from typing import TYPE_CHECKING, Any
from unittest.mock import patch

import pyotp
import pytest
from fastapi import status

from app.api.auth.models import OAuthAccount
from app.api.auth.services import mfa_service
from app.api.common.rate_limiting import Limiter

from .shared import TEST_PASSWORD, create_password_user, login_bearer

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

pytestmark = pytest.mark.api

WRONG_PASSWORD = "not-the-password-42"
WRONG_CODE = "000000"
BUDGET = "app.api.auth.services.rate_limiter.limiter"


async def _signed_in(api_client: AsyncClient, db_session: AsyncSession, name: str) -> tuple[User, dict[str, str]]:
    user = await create_password_user(db_session, email=f"{name}@example.com", username=name)
    tokens = await login_bearer(api_client, email=user.email, password=TEST_PASSWORD)
    return user, {"Authorization": f"Bearer {tokens['access_token']}"}


async def _enrol_mfa(db_session: AsyncSession, user: User) -> None:
    """Enrol MFA after sign-in, so the login above needed no challenge."""
    user.mfa_enabled = True
    user.mfa_totp_secret = pyotp.random_base32()
    await db_session.flush()


async def _link_google(db_session: AsyncSession, user: User) -> None:
    db_session.add(
        OAuthAccount(
            user_id=user.id,
            oauth_name="google",
            access_token="access-token",
            expires_at=None,
            refresh_token=None,
            account_id="provider-user-123",
            account_email=user.email,
        )
    )
    await db_session.flush()


async def _start_totp_setup(api_client: AsyncClient, headers: dict[str, str]) -> dict[str, Any]:
    response = await api_client.post("/v1/auth/mfa/totp/setup", headers=headers)
    assert response.status_code == status.HTTP_200_OK, response.text
    return {"setup_token": response.json()["setup_token"], "code": WRONG_CODE, "password": WRONG_PASSWORD}


# (method, path, body); a body of None is built by a setup step in the test.
ROUTES = {
    "email change": ("PATCH", "/v1/users/me", {"email": "moved@example.com", "current_password": WRONG_PASSWORD}),
    "password change": (
        "PATCH",
        "/v1/users/me",
        {"password": "An0ther-long-passphrase!", "current_password": WRONG_PASSWORD},
    ),
    "social link": ("POST", "/v1/oauth/google/associate/authorize", {"current_password": WRONG_PASSWORD}),
    "social unlink": ("DELETE", "/v1/oauth/google/associate", {"current_password": WRONG_PASSWORD}),
    "mfa confirm": ("POST", "/v1/auth/mfa/totp/confirm", None),
    "mfa disable": ("POST", "/v1/auth/mfa/totp/disable", {"code": WRONG_CODE}),
    "recovery codes": ("POST", "/v1/auth/mfa/recovery-codes/regenerate", {"code": WRONG_CODE}),
}


@pytest.mark.parametrize("route", list(ROUTES))
async def test_wrong_guesses_are_limited_per_account(
    api_client: AsyncClient, db_session: AsyncSession, route: str
) -> None:
    """Three wrong guesses are refused as such; the fourth attempt hits the account budget."""
    method, path, body = ROUTES[route]
    user, headers = await _signed_in(api_client, db_session, route.replace(" ", "_"))
    if route == "social unlink":
        await _link_google(db_session, user)
    if route in {"mfa disable", "recovery codes"}:
        await _enrol_mfa(db_session, user)

    with patch(BUDGET, new=Limiter(storage_uri="memory://")):
        if body is None:
            body = await _start_totp_setup(api_client, headers)
        statuses = [(await api_client.request(method, path, json=body, headers=headers)).status_code for _ in range(4)]

    assert statuses == [status.HTTP_403_FORBIDDEN] * 3 + [status.HTTP_429_TOO_MANY_REQUESTS]


async def test_the_budget_is_shared_across_routes(api_client: AsyncClient, db_session: AsyncSession) -> None:
    """Spreading guesses over different step-up routes does not buy more of them."""
    user, headers = await _signed_in(api_client, db_session, "spread_guesser")
    await _link_google(db_session, user)

    with patch(BUDGET, new=Limiter(storage_uri="memory://")):
        for route in ("email change", "social link", "social unlink"):
            method, path, body = ROUTES[route]
            response = await api_client.request(method, path, json=body, headers=headers)
            assert response.status_code == status.HTTP_403_FORBIDDEN, route
        method, path, body = ROUTES["password change"]
        blocked = await api_client.request(method, path, json=body, headers=headers)

    assert blocked.status_code == status.HTTP_429_TOO_MANY_REQUESTS


async def test_a_missing_credential_costs_nothing(api_client: AsyncClient, db_session: AsyncSession) -> None:
    """Only a wrong credential counts; a request that omits it (400) does not."""
    _user, headers = await _signed_in(api_client, db_session, "forgetful_user")

    with patch(BUDGET, new=Limiter(storage_uri="memory://")):
        statuses = [
            (
                await api_client.request("PATCH", "/v1/users/me", json={"email": "moved@example.com"}, headers=headers)
            ).status_code
            for _ in range(4)
        ]

    assert statuses == [status.HTTP_400_BAD_REQUEST] * 4


async def test_fresh_login_challenges_do_not_reset_the_budget(
    api_client: AsyncClient, db_session: AsyncSession
) -> None:
    """Knowing the password buys a new challenge token, but not new guesses at the TOTP code."""
    user = await create_password_user(
        db_session,
        email="challenge_guesser@example.com",
        username="challenge_guesser",
        mfa_enabled=True,
        mfa_totp_secret=mfa_service.generate_totp_secret(),
    )

    async def _guess_on_a_fresh_challenge() -> int:
        login = await api_client.post("/v1/auth/bearer/login", data={"username": user.email, "password": TEST_PASSWORD})
        challenge = {"mfa_token": login.json()["mfa_token"], "code": WRONG_CODE}
        return (await api_client.post("/v1/auth/mfa/challenge", json=challenge)).status_code

    with patch(BUDGET, new=Limiter(storage_uri="memory://")):
        statuses = [await _guess_on_a_fresh_challenge() for _ in range(4)]

    assert statuses == [status.HTTP_401_UNAUTHORIZED] * 3 + [status.HTTP_429_TOO_MANY_REQUESTS]
