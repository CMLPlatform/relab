"""Integration tests for file storage endpoints."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest
from fastapi import status

from tests.factories.models import ProductFactory, ProductTypeFactory

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User
    from app.api.data_collection.models.product import Product

# Constants for test values
PRODUCT_FILES_NAME = "Test Product Files"
FILE_NAME = "test.txt"
FILE_CONTENT = b"test content"
FILE_MIMETYPE = "text/plain"
FILE_DESC = "A test file description"
IMAGE_NAME = "image.gif"
IMAGE_MIMETYPE = "image/gif"
IMAGE_DESC = "A test image description"
IMAGE_METADATA = {"category": "test"}

# 1x1 pixel transparent GIF (broken into parts to avoid long lines)
GIF_BYTES = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04"
    b"\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)


def _upload_request(kind: str) -> tuple[str, dict[str, tuple[str, bytes, str]], dict[str, str], str, str]:
    """Return the endpoint and multipart payload for a file/image upload."""
    if kind == "file":
        return (
            "files",
            {"file": (FILE_NAME, FILE_CONTENT, FILE_MIMETYPE)},
            {"description": FILE_DESC},
            FILE_NAME,
            "file_url",
        )
    return (
        "images",
        {"file": (IMAGE_NAME, GIF_BYTES, IMAGE_MIMETYPE)},
        {"description": IMAGE_DESC, "image_metadata": json.dumps(IMAGE_METADATA)},
        IMAGE_NAME,
        "image_url",
    )


@pytest.fixture
async def setup_product_for_files(db_session: AsyncSession, db_superuser: User) -> Product:
    """Fixture to set up a product for file storage testing."""
    pt = await ProductTypeFactory.create_async(session=db_session)
    return await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=pt.id,
        name=PRODUCT_FILES_NAME,
    )


class TestFileStorageEndpoints:
    """Tests for file storage API endpoints."""

    @pytest.mark.parametrize(
        ("kind", "description"),
        [("file", FILE_DESC), ("images", IMAGE_DESC)],
    )
    async def test_upload_media_returns_the_stored_contract(
        self,
        api_client_superuser: AsyncClient,
        setup_product_for_files: Product,
        kind: str,
        description: str,
    ) -> None:
        """Uploading media should return the stored file/image contract."""
        request_kind = "file" if kind == "file" else "image"
        endpoint, files, data, filename, url_field = _upload_request(request_kind)
        response = await api_client_superuser.post(
            f"/v1/products/{setup_product_for_files.id}/{endpoint}",
            files=files,
            data=data,
        )

        assert response.status_code == status.HTTP_201_CREATED, response.text
        resp_data = response.json()
        assert resp_data["filename"].endswith(filename)
        assert resp_data["description"] == description
        assert url_field in resp_data
        assert "id" in resp_data

    @pytest.mark.parametrize(
        ("kind", "endpoint"),
        [("file", "files"), ("image", "images")],
    )
    async def test_delete_uploaded_media_removes_the_resource(
        self, api_client_superuser: AsyncClient, setup_product_for_files: Product, kind: str, endpoint: str
    ) -> None:
        """Deleting uploaded media should make follow-up reads return 404."""
        _, files, data, _, _ = _upload_request(kind)
        create_response = await api_client_superuser.post(
            f"/v1/products/{setup_product_for_files.id}/{endpoint}",
            files=files,
            data=data,
        )
        media_id = create_response.json()["id"]

        response_del = await api_client_superuser.delete(
            f"/v1/products/{setup_product_for_files.id}/{endpoint}/{media_id}"
        )
        response_get_deleted = await api_client_superuser.get(
            f"/v1/products/{setup_product_for_files.id}/{endpoint}/{media_id}"
        )

        assert response_del.status_code == status.HTTP_204_NO_CONTENT
        assert response_get_deleted.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.parametrize(
        ("image_metadata", "expected_detail"),
        [
            ("{", "image_metadata must be valid JSON"),
            ("[]", "image_metadata must be a JSON object"),
        ],
    )
    async def test_upload_image_rejects_invalid_metadata_json(
        self,
        api_client_superuser: AsyncClient,
        setup_product_for_files: Product,
        image_metadata: str,
        expected_detail: str,
    ) -> None:
        """Image metadata form fields must be JSON objects."""
        response = await api_client_superuser.post(
            f"/v1/products/{setup_product_for_files.id}/images",
            files={"file": (IMAGE_NAME, GIF_BYTES, IMAGE_MIMETYPE)},
            data={"description": IMAGE_DESC, "image_metadata": image_metadata},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["detail"].startswith(expected_detail)

    @pytest.mark.parametrize(
        ("kind", "endpoint"),
        [("file", "files"), ("image", "images")],
    )
    async def test_product_media_routes_reject_component_ids(
        self,
        api_client_superuser: AsyncClient,
        setup_product_graph,  # noqa: ANN001 — fixture-typed in conftest
        kind: str,
        endpoint: str,
    ) -> None:
        """``/products/{id}/{files,images}`` 404s when the id is a component."""
        _, files, data, _, _ = _upload_request(kind)
        response = await api_client_superuser.post(
            f"/v1/products/{setup_product_graph.component.id}/{endpoint}",
            files=files,
            data=data,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.parametrize(
        ("kind", "endpoint"),
        [("file", "files"), ("image", "images")],
    )
    async def test_component_media_upload_and_delete(
        self,
        api_client_superuser: AsyncClient,
        setup_product_graph,  # noqa: ANN001 — fixture-typed in conftest
        kind: str,
        endpoint: str,
    ) -> None:
        """``/components/{id}/{files,images}`` round-trips upload + delete."""
        _, files, data, filename, url_field = _upload_request(kind)
        create = await api_client_superuser.post(
            f"/v1/components/{setup_product_graph.component.id}/{endpoint}",
            files=files,
            data=data,
        )
        assert create.status_code == status.HTTP_201_CREATED, create.text
        created = create.json()
        assert created["filename"].endswith(filename)
        assert url_field in created

        delete = await api_client_superuser.delete(
            f"/v1/components/{setup_product_graph.component.id}/{endpoint}/{created['id']}"
        )
        follow_up = await api_client_superuser.get(
            f"/v1/components/{setup_product_graph.component.id}/{endpoint}/{created['id']}"
        )

        assert delete.status_code == status.HTTP_204_NO_CONTENT
        assert follow_up.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.parametrize(
        ("kind", "endpoint"),
        [("file", "files"), ("image", "images")],
    )
    async def test_component_media_routes_reject_base_product_ids(
        self,
        api_client_superuser: AsyncClient,
        setup_product_graph,  # noqa: ANN001 — fixture-typed in conftest
        kind: str,
        endpoint: str,
    ) -> None:
        """``/components/{id}/{files,images}`` 404s when the id is a base product."""
        _, files, data, _, _ = _upload_request(kind)
        response = await api_client_superuser.post(
            f"/v1/components/{setup_product_graph.product.id}/{endpoint}",
            files=files,
            data=data,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
