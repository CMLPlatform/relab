"""Authorization + not-found behaviour for the admin user routes.

These go through the real app so the router-level ``Security(current_active_superuser)``
gate is actually exercised — the previous unit test called the handlers as plain
coroutines and never touched it.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.api.auth.models import OAuthAccount, User
from app.api.auth.services.account_erasure import ANONYMOUS_USER_EMAIL, get_or_create_anonymous_user
from app.api.common.audit import AuditAction, AuditContext
from app.api.data_collection.models.product import Product
from app.api.plugins.rpi_cam.models import Camera
from tests.factories.models import CameraFactory, UserFactory

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.reference_data.models import ProductType

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
        log_audit.assert_called_once_with(
            db_superuser.id,
            AuditAction.DELETE,
            User,
            db_user.id,
            context=AuditContext(operation="erase_anonymize"),
        )

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


@dataclass(slots=True)
class ErasureSubject:
    """A user together with everything that used to block their deletion."""

    user: User
    product: Product
    component: Product
    camera: Camera


@pytest.fixture
async def erasure_subject(db_session: AsyncSession, db_product_type: ProductType) -> ErasureSubject:
    """Seed a user owning a product subtree, a camera, and a linked OAuth account."""
    user = await UserFactory.create_async(session=db_session, is_active=True, is_superuser=False)
    product = Product(owner_id=user.id, name="Owned product", product_type=db_product_type)
    component = Product(owner_id=user.id, name="Owned component", parent=product, amount_in_parent=1)
    oauth_account = OAuthAccount(
        user_id=user.id,
        oauth_name="google",
        access_token="access-token",  # test fixture value, not a credential
        account_id="oauth-account-1",
        account_email="owner@example.com",
    )
    db_session.add_all([product, component, oauth_account])
    camera = await CameraFactory.create_async(session=db_session, owner_id=user.id)
    await db_session.flush()
    return ErasureSubject(user=user, product=product, component=component, camera=camera)


async def _row_exists(session: AsyncSession, statement) -> bool:  # any Select works here
    """Return whether a select matches a live row, bypassing the identity map."""
    return (await session.execute(statement)).first() is not None


class TestAdminUserErasure:
    """Deleting a user erases their personal data and applies the chosen content policy."""

    async def test_anonymize_reassigns_content_and_erases_the_account(
        self,
        api_client_superuser,
        db_session: AsyncSession,
        erasure_subject: ErasureSubject,
    ) -> None:
        """The default mode keeps the products, reassigned to the anonymous system account."""
        subject = erasure_subject

        response = await api_client_superuser.delete(f"{ADMIN_USERS}/{subject.user.id}")

        assert response.status_code == 204
        anonymous_id: UUID = (
            await db_session.execute(select(User.id).where(User.email == ANONYMOUS_USER_EMAIL))
        ).scalar_one()
        owners = (
            (
                await db_session.execute(
                    select(Product.owner_id).where(Product.id.in_([subject.product.id, subject.component.id]))
                )
            )
            .scalars()
            .all()
        )
        assert list(owners) == [anonymous_id, anonymous_id]
        assert not await _row_exists(db_session, select(User.id).where(User.id == subject.user.id))
        assert not await _row_exists(db_session, select(Camera.id).where(Camera.id == subject.camera.id))
        assert not await _row_exists(db_session, select(OAuthAccount.id).where(OAuthAccount.user_id == subject.user.id))

        readable = await api_client_superuser.get(f"/v1/products/{subject.product.id}")
        assert readable.status_code == 200

    async def test_delete_mode_removes_the_owned_product_subtree(
        self,
        api_client_superuser,
        db_session: AsyncSession,
        erasure_subject: ErasureSubject,
    ) -> None:
        """``content=delete`` erases the products as well as the account."""
        subject = erasure_subject

        response = await api_client_superuser.delete(f"{ADMIN_USERS}/{subject.user.id}?content=delete")

        assert response.status_code == 204
        assert not await _row_exists(
            db_session, select(Product.id).where(Product.id.in_([subject.product.id, subject.component.id]))
        )
        assert not await _row_exists(db_session, select(User.id).where(User.id == subject.user.id))
        assert not await _row_exists(db_session, select(Camera.id).where(Camera.id == subject.camera.id))

    async def test_unknown_content_mode_is_rejected(
        self, api_client_superuser, erasure_subject: ErasureSubject
    ) -> None:
        """Only the two documented content policies are accepted."""
        response = await api_client_superuser.delete(f"{ADMIN_USERS}/{erasure_subject.user.id}?content=purge")

        assert response.status_code == 422

    async def test_anonymous_account_stays_listable(self, api_client_superuser, db_session: AsyncSession) -> None:
        """The system account's address must survive UserRead's EmailStr validation."""
        await get_or_create_anonymous_user(db_session)
        await db_session.flush()

        response = await api_client_superuser.get(ADMIN_USERS)

        assert response.status_code == 200
        assert ANONYMOUS_USER_EMAIL in [item["email"] for item in response.json()["items"]]

    async def test_anonymous_system_account_cannot_be_deleted(
        self, api_client_superuser, db_session: AsyncSession
    ) -> None:
        """The account that owns anonymized content is not itself deletable."""
        anonymous = await get_or_create_anonymous_user(db_session)
        await db_session.flush()

        response = await api_client_superuser.delete(f"{ADMIN_USERS}/{anonymous.id}")

        assert response.status_code == 409
        assert await _row_exists(db_session, select(User.id).where(User.id == anonymous.id))
