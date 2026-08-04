"""Authorization + not-found behaviour for the admin user routes.

These go through the real app so the router-level ``Security(current_active_superuser)``
gate is actually exercised — the previous unit test called the handlers as plain
coroutines and never touched it.
"""

from unittest.mock import patch
from uuid import uuid4

import pytest

from app.api.auth.models import User
from app.api.common.audit import AuditAction

pytestmark = pytest.mark.api

ADMIN_USERS = "/v1/admin/users"


class TestAdminUsersAuthorization:
    """The admin routes are reachable only by an active superuser."""

    async def test_superuser_lists_users(self, api_client_superuser) -> None:
        """A superuser can list users."""
        response = await api_client_superuser.get(ADMIN_USERS)
        assert response.status_code == 200

    # Regression: the router-level superuser gate is the ONLY authorization on
    # these routes. Delete it and a regular user reaches the handler (200);
    # requiring a denial here fails that mutation. The fixture overrides the
    # regular-user deps but not the superuser one, so the real superuser dep
    # denies with 401 rather than 403 — either is a denial, 200 is the bug.
    @pytest.mark.parametrize(
        ("method", "path_suffix"),
        [
            ("get", ""),
            ("get", "/{uid}"),
            ("patch", "/{uid}"),
            ("delete", "/{uid}"),
            ("post", "/{uid}/mfa/reset"),
        ],
    )
    async def test_regular_user_is_denied(
        self, api_client_user, db_superuser: User, method: str, path_suffix: str
    ) -> None:
        """A non-superuser is denied every admin verb."""
        path = ADMIN_USERS + path_suffix.format(uid=db_superuser.id)
        kwargs = {"json": {}} if method == "patch" else {}
        response = await getattr(api_client_user, method)(path, **kwargs)
        assert response.status_code in (401, 403)

    async def test_guest_is_unauthorized(self, api_client, db_user: User) -> None:
        """An unauthenticated client is rejected."""
        response = await api_client.get(f"{ADMIN_USERS}/{db_user.id}")
        assert response.status_code == 401


class TestAdminUsersNotFound:
    """A well-formed but absent user id returns 404, not a 500."""

    # Regression: the handlers called user_manager.get directly, so a missing id
    # raised UserNotExists straight into the catch-all handler as a 500.
    @pytest.mark.parametrize(
        ("method", "path_suffix"),
        [("get", "/{uid}"), ("patch", "/{uid}"), ("delete", "/{uid}"), ("post", "/{uid}/mfa/reset")],
    )
    async def test_missing_user_returns_404(self, api_client_superuser, method: str, path_suffix: str) -> None:
        """Each admin verb maps a missing id to 404."""
        path = ADMIN_USERS + path_suffix.format(uid=uuid4())
        kwargs = {"json": {}} if method == "patch" else {}
        response = await getattr(api_client_superuser, method)(path, **kwargs)
        assert response.status_code == 404

    async def test_malformed_id_is_rejected_before_the_handler(self, api_client_superuser) -> None:
        """A non-UUID path segment is a 422 (path validation), never a 500."""
        response = await api_client_superuser.get(f"{ADMIN_USERS}/not-a-uuid")
        assert response.status_code == 422


class TestAdminUsersActions:
    """Delete, update, and MFA-reset perform their action and audit the acting superuser."""

    async def test_superuser_deletes_a_user_and_audits_the_actor(
        self, api_client_superuser, db_superuser: User, db_user: User
    ) -> None:
        """Deletion returns 204 and records the actor in the audit log."""
        with patch("app.api.auth.routers.admin.users.audit_event") as log_audit:
            response = await api_client_superuser.delete(f"{ADMIN_USERS}/{db_user.id}")

        assert response.status_code == 204
        log_audit.assert_called_once_with(db_superuser.id, AuditAction.DELETE, User, db_user.id)

    async def test_superuser_updates_a_user_and_audits_the_actor(
        self, api_client_superuser, db_superuser: User, db_user: User
    ) -> None:
        """Update returns the changed user without the target's password and audits the actor."""
        with patch("app.api.auth.routers.admin.users.audit_event") as log_audit:
            response = await api_client_superuser.patch(
                f"{ADMIN_USERS}/{db_user.id}",
                json={"username": "renamed_by_admin"},  # no current_password supplied — safe=False must not demand one
            )

        assert response.status_code == 200
        assert response.json()["username"] == "renamed_by_admin"
        log_audit.assert_called_once_with(db_superuser.id, AuditAction.UPDATE, User, db_user.id)

    async def test_superuser_resets_user_mfa(self, api_client_superuser, db_user: User) -> None:
        """MFA reset returns 204 and clears the target's TOTP enrolment."""
        with patch("app.api.auth.routers.admin.users.mfa_service.clear_totp") as clear_totp:
            response = await api_client_superuser.post(f"{ADMIN_USERS}/{db_user.id}/mfa/reset")

        assert response.status_code == 204
        clear_totp.assert_awaited_once()
