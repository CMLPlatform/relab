"""Integration tests for file storage endpoints."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest
from fastapi import status

from tests.factories.models import ProductFactory, ProductTypeFactory

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.api.auth.models import User
    from app.api.data_collection.models import Product

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


@pytest.fixture
async def setup_product_for_files(session: AsyncSession, superuser: User) -> Product:
    """Fixture to set up a product for file storage testing."""
    pt = await ProductTypeFactory.create_async(session=session)
    return await ProductFactory.create_async(
        session=session,
        owner_id=superuser.id,
        product_type_id=pt.id,
        name=PRODUCT_FILES_NAME,
    )


class TestFileStorageEndpoints:
    """Tests for file storage API endpoints."""

    async def test_upload_file(self, superuser_client: AsyncClient, setup_product_for_files: Product) -> None:
        """Test uploading a file to a product."""
        files = {"file": (FILE_NAME, FILE_CONTENT, FILE_MIMETYPE)}
        data = {"description": FILE_DESC}

        response = await superuser_client.post(
            f"/products/{setup_product_for_files.id}/files",
            files=files,
            data=data,
        )

        assert response.status_code == status.HTTP_201_CREATED, response.text
        resp_data = response.json()
        assert resp_data["filename"].endswith(FILE_NAME)
        assert resp_data["description"] == FILE_DESC
        assert "file_url" in resp_data
        assert "id" in resp_data

        # Test GET all files
        response_all = await superuser_client.get(f"/products/{setup_product_for_files.id}/files")
        assert response_all.status_code == status.HTTP_200_OK
        assert len(response_all.json()) >= 1

        # Test GET file by ID
        file_id = resp_data["id"]
        response_one = await superuser_client.get(f"/products/{setup_product_for_files.id}/files/{file_id}")
        assert response_one.status_code == status.HTTP_200_OK
        assert response_one.json()["id"] == file_id

        # Test DELETE file
        response_del = await superuser_client.delete(f"/products/{setup_product_for_files.id}/files/{file_id}")
        assert response_del.status_code == status.HTTP_204_NO_CONTENT

        # Verify it's deleted
        response_get_deleted = await superuser_client.get(f"/products/{setup_product_for_files.id}/files/{file_id}")
        assert response_get_deleted.status_code == status.HTTP_404_NOT_FOUND

    async def test_upload_image(self, superuser_client: AsyncClient, setup_product_for_files: Product) -> None:
        """Test uploading an image to a product."""
        files = {"file": (IMAGE_NAME, GIF_BYTES, IMAGE_MIMETYPE)}
        data = {"description": IMAGE_DESC, "image_metadata": json.dumps(IMAGE_METADATA)}

        response = await superuser_client.post(
            f"/products/{setup_product_for_files.id}/images",
            files=files,
            data=data,
        )

        assert response.status_code == status.HTTP_201_CREATED, response.text
        resp_data = response.json()
        assert resp_data["filename"].endswith(IMAGE_NAME)
        assert resp_data["description"] == IMAGE_DESC
        assert "image_url" in resp_data
        assert "id" in resp_data

        # Test GET all images
        response_all = await superuser_client.get(f"/products/{setup_product_for_files.id}/images")
        assert response_all.status_code == status.HTTP_200_OK
        assert len(response_all.json()) >= 1

        # Test GET image by ID
        image_id = resp_data["id"]
        response_one = await superuser_client.get(f"/products/{setup_product_for_files.id}/images/{image_id}")
        assert response_one.status_code == status.HTTP_200_OK
        assert response_one.json()["id"] == image_id

        # Test DELETE image
        response_del = await superuser_client.delete(f"/products/{setup_product_for_files.id}/images/{image_id}")
        assert response_del.status_code == status.HTTP_204_NO_CONTENT

        # Verify it's deleted
        response_get_deleted = await superuser_client.get(f"/products/{setup_product_for_files.id}/images/{image_id}")
        assert response_get_deleted.status_code == status.HTTP_404_NOT_FOUND
