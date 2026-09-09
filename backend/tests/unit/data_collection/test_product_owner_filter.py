"""Unit tests for the ``owner`` query value on the product list."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api.data_collection.routers.product_read_routers import resolve_owner_id
from tests.factories.models import UserFactory


def _session_returning(user: object) -> AsyncMock:
    session = AsyncMock()
    session.execute.return_value = MagicMock(
        unique=MagicMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=user)))
    )
    return session


async def test_me_requires_auth() -> None:
    """``me`` without a viewer is a 401."""
    with pytest.raises(HTTPException) as exc:
        await resolve_owner_id(AsyncMock(), "me", None)
    assert exc.value.status_code == 401


async def test_me_resolves_to_viewer() -> None:
    """``me`` maps to the viewer id without a lookup."""
    viewer = UserFactory.build()
    assert await resolve_owner_id(AsyncMock(), "me", viewer) == viewer.id


async def test_username_resolves_public_owner_for_guest() -> None:
    """A public owner resolves for guests; the username is normalized first."""
    owner = UserFactory.build(preferences={"profile_visibility": "public"})
    assert await resolve_owner_id(_session_returning(owner), " Alice ", None) == owner.id


@pytest.mark.parametrize(
    ("visibility", "viewer"),
    [("private", None), ("private", "other"), ("community", None)],
)
async def test_hidden_or_unknown_owner_is_404(visibility: str, viewer: str | None) -> None:
    """Hidden and unknown owners are indistinguishable: both 404."""
    owner = UserFactory.build(preferences={"profile_visibility": visibility})
    viewer_user = UserFactory.build() if viewer else None
    for session in (_session_returning(owner), _session_returning(None)):
        with pytest.raises(HTTPException) as exc:
            await resolve_owner_id(session, "alice", viewer_user)
        assert exc.value.status_code == 404
