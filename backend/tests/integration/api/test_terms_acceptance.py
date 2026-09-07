"""The self-service contributor-terms acceptance route.

Authenticates for real throughout: these routes hang off the same `/users/me`
router as fastapi-users' own, which builds its own `current_user` dependency that
the shared test override does not reach.
"""

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.auth.terms import CURRENT_TERMS_VERSION, MINIMUM_RELEASE_TERMS_VERSION
from tests.factories.models import UserFactory

from .auth.shared import TEST_PASSWORD, hash_test_password, login_bearer

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

pytestmark = pytest.mark.api

ACCEPT_TERMS = "/v1/users/me/accept-terms"


async def _user_with_token(
    api_client: AsyncClient,
    db_session: AsyncSession,
    *,
    slug: str,
    accepted_version: int | None,
) -> tuple[User, str]:
    """Create a verified account at a given acceptance state and log it in."""
    user = await UserFactory.create_async(
        db_session,
        email=f"{slug}@example.com",
        username=slug,
        is_active=True,
        is_verified=True,
        terms_accepted_version=accepted_version,
        hashed_password=hash_test_password(TEST_PASSWORD),
    )
    token = str((await login_bearer(api_client, email=user.email, password=TEST_PASSWORD))["access_token"])
    return user, token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class TestAcceptanceRequiredFlag:
    """`/users/me` tells the client whether to prompt, so the rule stays server-side."""

    async def test_account_that_never_accepted_is_flagged(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Every account predating acceptance tracking must be asked."""
        _, token = await _user_with_token(api_client, db_session, slug="terms_never", accepted_version=None)

        body = (await api_client.get("/v1/users/me", headers=_auth(token))).json()

        assert body["terms_acceptance_required"] is True
        assert body["terms_accepted_version"] is None

    async def test_account_that_accepted_the_granting_version_is_not_flagged(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """A grant already on record is not asked for twice."""
        _, token = await _user_with_token(
            api_client, db_session, slug="terms_ok", accepted_version=MINIMUM_RELEASE_TERMS_VERSION
        )

        body = (await api_client.get("/v1/users/me", headers=_auth(token))).json()

        assert body["terms_acceptance_required"] is False


class TestAcceptTerms:
    """Accepting records the grant server-side and settles the prompt."""

    async def test_acceptance_is_recorded_and_clears_the_flag(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """The route stamps the current version and the response reflects it."""
        user, token = await _user_with_token(api_client, db_session, slug="terms_accept", accepted_version=None)

        response = await api_client.post(ACCEPT_TERMS, headers=_auth(token))

        assert response.status_code == status.HTTP_200_OK, response.text
        body = response.json()
        assert body["terms_accepted_version"] == CURRENT_TERMS_VERSION
        assert body["terms_accepted_at"] is not None
        assert body["terms_acceptance_required"] is False

        # Persisted, not just reflected: the release tooling reads the column.
        await db_session.refresh(user)
        assert user.terms_accepted_version == CURRENT_TERMS_VERSION
        assert user.terms_accepted_at is not None

    async def test_the_version_is_server_chosen_not_client_supplied(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """A client must not be able to name the version it is granting under.

        The whole point of the column is evidence of what the person was shown.
        A client that picks the number could claim a grant under terms that did
        not exist when it accepted.
        """
        user, token = await _user_with_token(api_client, db_session, slug="terms_forge", accepted_version=None)

        response = await api_client.post(
            ACCEPT_TERMS, headers=_auth(token), json={"version": CURRENT_TERMS_VERSION + 99}
        )

        assert response.status_code == status.HTTP_200_OK, response.text
        await db_session.refresh(user)
        assert user.terms_accepted_version == CURRENT_TERMS_VERSION

    async def test_accepting_twice_is_harmless(self, api_client: AsyncClient, db_session: AsyncSession) -> None:
        """A double-tap must not error or move the record backwards."""
        user, token = await _user_with_token(api_client, db_session, slug="terms_twice", accepted_version=None)

        first = await api_client.post(ACCEPT_TERMS, headers=_auth(token))
        second = await api_client.post(ACCEPT_TERMS, headers=_auth(token))

        assert first.status_code == status.HTTP_200_OK
        assert second.status_code == status.HTTP_200_OK
        await db_session.refresh(user)
        assert user.terms_accepted_version == CURRENT_TERMS_VERSION

    async def test_a_later_acceptance_is_never_downgraded(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """An account already past the current version keeps its later grant.

        Guards the day CURRENT is rolled back or a test fixture sits ahead of it:
        overwriting would silently narrow a grant the contributor actually made.
        """
        ahead = CURRENT_TERMS_VERSION + 5
        user, token = await _user_with_token(api_client, db_session, slug="terms_ahead", accepted_version=ahead)

        response = await api_client.post(ACCEPT_TERMS, headers=_auth(token))

        assert response.status_code == status.HTTP_200_OK, response.text
        await db_session.refresh(user)
        assert user.terms_accepted_version == ahead

    async def test_unauthenticated_cannot_accept(self, api_client: AsyncClient) -> None:
        """Acceptance is an act by an identified account, never an anonymous one."""
        response = await api_client.post(ACCEPT_TERMS)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
