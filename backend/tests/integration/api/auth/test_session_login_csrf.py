"""Cookie-authenticated writes and the session login refuse requests sent from another site."""

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.core.config.core import settings

from .shared import TEST_PASSWORD, create_password_user, login_bearer, login_session

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.api

FOREIGN_ORIGIN = "https://elsewhere.example.net"
APP_ORIGIN = settings.allowed_origins[1]


def _credentials(email: str) -> dict[str, str]:
    return {"username": email, "password": TEST_PASSWORD}


async def test_session_login_rejects_cross_site_origin(api_client: AsyncClient, db_session: AsyncSession) -> None:
    """A login form posted from a foreign page cannot sign the browser in."""
    user = await create_password_user(db_session, email="csrf-login@example.com", username="csrf_login")

    foreign_origin = await api_client.post(
        "/v1/auth/session/login", data=_credentials(user.email), headers={"Origin": FOREIGN_ORIGIN}
    )
    cross_site = await api_client.post(
        "/v1/auth/session/login", data=_credentials(user.email), headers={"Sec-Fetch-Site": "cross-site"}
    )

    assert foreign_origin.status_code == status.HTTP_403_FORBIDDEN, foreign_origin.text
    assert cross_site.status_code == status.HTTP_403_FORBIDDEN, cross_site.text
    assert not api_client.cookies


async def test_session_login_from_the_app_origin_passes(api_client: AsyncClient, db_session: AsyncSession) -> None:
    """The app's own origin, and a client that sends neither header, can sign in."""
    user = await create_password_user(db_session, email="csrf-same@example.com", username="csrf_same")

    from_app = await api_client.post(
        "/v1/auth/session/login",
        data=_credentials(user.email),
        headers={"Origin": APP_ORIGIN, "Sec-Fetch-Site": "same-site"},
    )
    api_client.cookies.clear()
    no_headers = await api_client.post("/v1/auth/session/login", data=_credentials(user.email))

    assert from_app.status_code == status.HTTP_204_NO_CONTENT, from_app.text
    assert no_headers.status_code == status.HTTP_204_NO_CONTENT, no_headers.text


async def test_cookie_authenticated_write_rejects_cross_site_origin(
    api_client: AsyncClient, db_session: AsyncSession
) -> None:
    """A signed-in browser's cookies cannot carry a write sent from a foreign page."""
    user = await create_password_user(db_session, email="csrf-cookie@example.com", username="csrf_cookie")
    await login_session(api_client, email=user.email, password=TEST_PASSWORD)

    foreign = await api_client.patch(
        "/v1/users/me", json={"username": "csrf_moved"}, headers={"Origin": FOREIGN_ORIGIN}
    )
    from_app = await api_client.patch("/v1/users/me", json={"username": "csrf_kept"}, headers={"Origin": APP_ORIGIN})

    assert foreign.status_code == status.HTTP_403_FORBIDDEN, foreign.text
    assert from_app.status_code == status.HTTP_200_OK, from_app.text


async def test_bearer_write_from_another_origin_passes(api_client: AsyncClient, db_session: AsyncSession) -> None:
    """A bearer token is not sent by the browser on its own, so its origin does not matter."""
    user = await create_password_user(db_session, email="csrf-bearer@example.com", username="csrf_bearer")
    tokens = await login_bearer(api_client, email=user.email, password=TEST_PASSWORD)

    response = await api_client.patch(
        "/v1/users/me",
        json={"username": "csrf_bearer_moved"},
        headers={"Authorization": f"Bearer {tokens['access_token']}", "Origin": FOREIGN_ORIGIN},
    )

    assert response.status_code == status.HTTP_200_OK, response.text
