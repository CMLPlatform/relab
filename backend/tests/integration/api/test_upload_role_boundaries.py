"""Role boundaries on upload: who may attach research files, and at what quota.

These go through the real app so the route dependency is exercised. Client-side
hiding of a file picker is not a control; this file is where the control lives.
"""

from io import BytesIO
from typing import TYPE_CHECKING

import pytest
from fastapi import status
from PIL import Image as PILImage
from sqlalchemy.exc import IntegrityError

from app.api.auth.roles import (
    UserRole,
    image_upload_max_mb_for_role,
    image_upload_max_pixels_for_role,
    upload_quota_bytes_for_role,
    upload_quota_files_for_role,
)
from app.core.config.core import settings
from scripts.seed.factories.models import ProductFactory, ProductTypeFactory, UserFactory

from .auth.shared import TEST_PASSWORD, hash_test_password, login_bearer

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User
    from app.api.data_collection.models.product import Product

pytestmark = pytest.mark.api

GIF_BYTES = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04"
    b"\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)
RESEARCH_FILE = {"file": ("cube.h5", b"\x89HDF\r\n\x1a\n", "application/x-hdf5")}
IMAGE_FILE = {"file": ("image.gif", GIF_BYTES, "image/gif")}


def _png_file(width: int, height: int) -> dict[str, tuple[str, bytes, str]]:
    buffer = BytesIO()
    PILImage.new("L", (width, height)).save(buffer, format="PNG")
    return {"file": ("image.png", buffer.getvalue(), "image/png")}


async def _product_owned_by(db_session: AsyncSession, owner: User) -> Product:
    """Create a base product owned by ``owner``."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    return await ProductFactory.create_async(
        session=db_session,
        owner_id=owner.id,
        product_type_id=product_type.id,
        name="Role boundary product",
    )


async def _component_owned_by(db_session: AsyncSession, owner: User) -> Product:
    """Create a component (a child product row) owned by ``owner``."""
    parent = await _product_owned_by(db_session, owner)
    return await ProductFactory.create_async(
        session=db_session,
        owner_id=owner.id,
        product_type_id=parent.product_type_id,
        parent_id=parent.id,
        amount_in_parent=1,
        name="Role boundary component",
    )


class TestResearchFileUploadRequiresLab:
    """Non-image upload is a lab capability, on products and components alike."""

    async def test_lab_user_uploads_a_research_file(
        self, api_client_lab_user: AsyncClient, db_session: AsyncSession, db_lab_user: User
    ) -> None:
        """A lab account may attach a research file to its own product."""
        product = await _product_owned_by(db_session, db_lab_user)

        response = await api_client_lab_user.post(f"/v1/products/{product.id}/files", files=RESEARCH_FILE)

        assert response.status_code == status.HTTP_201_CREATED, response.text

    async def test_contributor_is_refused_on_their_own_product(
        self, api_client_user: AsyncClient, db_session: AsyncSession, db_user: User
    ) -> None:
        """Owning the product is not enough; the tier gates the capability."""
        product = await _product_owned_by(db_session, db_user)

        response = await api_client_user.post(f"/v1/products/{product.id}/files", files=RESEARCH_FILE)

        assert response.status_code == status.HTTP_403_FORBIDDEN, response.text

    async def test_contributor_is_refused_on_a_component(
        self, api_client_user: AsyncClient, db_session: AsyncSession, db_user: User
    ) -> None:
        """The component route carries the same gate as the product route.

        Both are thin wrappers over one handler, so a gate applied to only one of
        them would leave the other reachable with the same payload. The component
        is genuinely owned by the caller, so a 403 here is the role check and not
        the ownership dependency, which resolves first and would 404.
        """
        component = await _component_owned_by(db_session, db_user)

        response = await api_client_user.post(f"/v1/components/{component.id}/files", files=RESEARCH_FILE)

        assert response.status_code == status.HTTP_403_FORBIDDEN, response.text

    async def test_superuser_uploads_a_research_file(
        self, api_client_superuser: AsyncClient, db_session: AsyncSession, db_superuser: User
    ) -> None:
        """Every superuser holds the lab tier, so an administrator can exercise every upload path."""
        product = await _product_owned_by(db_session, db_superuser)

        response = await api_client_superuser.post(f"/v1/products/{product.id}/files", files=RESEARCH_FILE)

        assert response.status_code == status.HTTP_201_CREATED, response.text

    async def test_database_refuses_a_superuser_below_lab(self, db_session: AsyncSession) -> None:
        """ck_user_superuser_is_lab holds even for writes that bypass the role route."""
        with pytest.raises(IntegrityError, match="ck_user_superuser_is_lab"):
            await UserFactory.create_async(
                session=db_session, is_superuser=True, is_active=True, role=UserRole.CONTRIBUTOR
            )

    async def test_role_route_refuses_to_demote_a_superuser(
        self, api_client_superuser: AsyncClient, db_superuser: User
    ) -> None:
        """Demoting a superuser is a 400 with a reason, not a constraint error."""
        response = await api_client_superuser.put(
            f"/v1/admin/users/{db_superuser.id}/role", json={"role": "contributor"}
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text
        assert response.json()["detail"] == "Superusers always hold the lab tier."


class TestImageUploadIsUnchanged:
    """Images stay open to every verified contributor; only files moved."""

    async def test_contributor_uploads_an_image(
        self, api_client_user: AsyncClient, db_session: AsyncSession, db_user: User
    ) -> None:
        """A contributor may still attach images to their own product."""
        product = await _product_owned_by(db_session, db_user)

        response = await api_client_user.post(f"/v1/products/{product.id}/images", files=IMAGE_FILE)

        assert response.status_code == status.HTTP_201_CREATED, response.text


class TestImageCapsFollowTheUploaderRole:
    """Per-image caps are tiered by the uploader's role, enforced on the server.

    The app fits photos to the caps /users/me reports, but that is a convenience; a
    direct API call must meet the same limit. The contributor pixel cap is lowered
    so a small PNG crosses it.
    """

    @pytest.fixture(autouse=True)
    def _small_contributor_pixel_cap(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "max_image_upload_pixels", 1_000)

    async def test_contributor_is_held_to_the_contributor_cap(
        self, api_client_user: AsyncClient, db_session: AsyncSession, db_user: User
    ) -> None:
        """An image over the contributor pixel cap is refused before it is stored."""
        product = await _product_owned_by(db_session, db_user)

        response = await api_client_user.post(f"/v1/products/{product.id}/images", files=_png_file(40, 40))

        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text
        assert response.json()["detail"] == "Image has 1600 pixels, exceeding the maximum allowed 1000."

    async def test_lab_user_gets_the_lab_cap(
        self, api_client_lab_user: AsyncClient, db_session: AsyncSession, db_lab_user: User
    ) -> None:
        """The same image is within the lab tier."""
        product = await _product_owned_by(db_session, db_lab_user)

        response = await api_client_lab_user.post(f"/v1/products/{product.id}/images", files=_png_file(40, 40))

        assert response.status_code == status.HTTP_201_CREATED, response.text

    async def test_cap_follows_the_uploader_not_the_owner(
        self, api_client_superuser: AsyncClient, db_session: AsyncSession, db_user: User
    ) -> None:
        """A superuser adding a photo to a contributor's product gets the caps the app fitted it to.

        The quota is still charged to the owner; only the per-image caps follow the uploader.
        """
        product = await _product_owned_by(db_session, db_user)

        response = await api_client_superuser.post(f"/v1/products/{product.id}/images", files=_png_file(40, 40))

        assert response.status_code == status.HTTP_201_CREATED, response.text


class TestQuotaFollowsTheRole:
    """The reported quota is the role's tier, and the tiers actually differ."""

    # Logs in for real rather than overriding a dependency: /users/me is served by
    # fastapi-users' own router, which builds its own current_user dependency that
    # the shared override does not reach.
    async def _me(self, api_client: AsyncClient, db_session: AsyncSession, *, role: UserRole) -> dict:
        user = await UserFactory.create_async(
            db_session,
            email=f"quota-{role.value}@example.com",
            username=f"quota_{role.value}",
            role=role,
            is_verified=True,
            is_active=True,
            hashed_password=hash_test_password(TEST_PASSWORD),
        )
        token = str((await login_bearer(api_client, email=user.email, password=TEST_PASSWORD))["access_token"])
        response = await api_client.get("/v1/users/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == status.HTTP_200_OK, response.text
        return dict(response.json())

    async def test_contributor_and_lab_report_their_own_tiers(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """`/users/me` reports the limits the account's role grants, not one global figure."""
        contributor_body = await self._me(api_client, db_session, role=UserRole.CONTRIBUTOR)
        lab_body = await self._me(api_client, db_session, role=UserRole.LAB)

        assert contributor_body["role"] == UserRole.CONTRIBUTOR.value
        assert contributor_body["upload_quota_files"] == upload_quota_files_for_role(UserRole.CONTRIBUTOR)
        assert contributor_body["upload_quota_bytes"] == upload_quota_bytes_for_role(UserRole.CONTRIBUTOR)

        assert lab_body["role"] == UserRole.LAB.value
        assert lab_body["upload_quota_files"] == upload_quota_files_for_role(UserRole.LAB)
        assert lab_body["upload_quota_bytes"] == upload_quota_bytes_for_role(UserRole.LAB)

        assert lab_body["upload_quota_bytes"] > contributor_body["upload_quota_bytes"]

        for body, role in ((contributor_body, UserRole.CONTRIBUTOR), (lab_body, UserRole.LAB)):
            assert body["image_upload_max_bytes"] == image_upload_max_mb_for_role(role) * 1024 * 1024
            assert body["image_upload_max_pixels"] == image_upload_max_pixels_for_role(role)

    async def test_usage_is_reported_alongside_the_limit(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Usage ships with the limit so a client can explain which one was hit."""
        body = await self._me(api_client, db_session, role=UserRole.CONTRIBUTOR)

        assert body["upload_file_count"] == 0
        assert body["upload_total_bytes"] == 0


class TestRoleAssignment:
    """Only a superuser may set a role, and only through the dedicated route."""

    async def test_superuser_promotes_a_user_to_lab(
        self, api_client_superuser: AsyncClient, db_session: AsyncSession, db_user: User
    ) -> None:
        """Promotion takes effect on the stored account, not just in the response."""
        response = await api_client_superuser.put(f"/v1/admin/users/{db_user.id}/role", json={"role": "lab"})

        assert response.status_code == status.HTTP_200_OK, response.text
        assert response.json()["role"] == UserRole.LAB.value
        await db_session.refresh(db_user)
        assert db_user.role == UserRole.LAB

    async def test_regular_user_cannot_set_a_role(self, api_client_user: AsyncClient, db_user: User) -> None:
        """A contributor cannot promote themselves through the admin route."""
        response = await api_client_user.put(f"/v1/admin/users/{db_user.id}/role", json={"role": "lab"})

        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    async def test_self_service_patch_cannot_set_a_role(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """`PATCH /users/me` must not be a path to the lab tier.

        The schema forbids extras, so this is a 422 rather than a silently ignored
        field, and the stored role is checked too, in case that ever changes.
        Authenticates for real: the self-service router is fastapi-users' own.
        """
        user = await UserFactory.create_async(
            db_session,
            email="self-promote@example.com",
            username="self_promote",
            role=UserRole.CONTRIBUTOR,
            is_verified=True,
            is_active=True,
            hashed_password=hash_test_password(TEST_PASSWORD),
        )
        token = str((await login_bearer(api_client, email=user.email, password=TEST_PASSWORD))["access_token"])

        response = await api_client.patch(
            "/v1/users/me", json={"role": "lab"}, headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT, response.text
        await db_session.refresh(user)
        assert user.role == UserRole.CONTRIBUTOR

    async def test_unknown_role_is_rejected(self, api_client_superuser: AsyncClient, db_user: User) -> None:
        """A value outside the enum is refused before it can reach the check constraint."""
        response = await api_client_superuser.put(f"/v1/admin/users/{db_user.id}/role", json={"role": "admin"})

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT, response.text
