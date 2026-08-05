"""Integration tests for file storage endpoints."""

import json
from io import BytesIO
from typing import TYPE_CHECKING

import pytest
from fastapi import status
from PIL import Image as PILImage

from app.api.file_storage import upload_quota
from app.core.config import settings
from tests.factories.models import ProductFactory, ProductTypeFactory, UserFactory

if TYPE_CHECKING:
    from fastapi import FastAPI
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User
    from app.api.data_collection.models.product import Product
    from tests.fixtures.data import ProductGraph

from tests.fixtures.client import override_authenticated_user

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


def _tiff_bytes() -> bytes:
    """Return a tiny valid TIFF payload."""
    buffer = BytesIO()
    PILImage.new("RGB", (1, 1), color="red").save(buffer, format="TIFF")
    return buffer.getvalue()


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


async def test_upload_image_recomputes_stats_for_product_owner_not_uploader(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
    db_superuser: User,
) -> None:
    """A superuser uploading to another user's product must refresh the owner's stats, not their own.

    handle_upload_image previously recomputed profile_stats for current_user (the
    uploader) instead of db_product.owner_id, mirroring handle_delete_image's correct
    behavior.
    """
    owner = await UserFactory.create_async(session=db_session, is_active=True)
    product_type = await ProductTypeFactory.create_async(session=db_session)
    owned_product = await ProductFactory.create_async(
        session=db_session, owner_id=owner.id, product_type_id=product_type.id
    )
    owner.profile_stats_computed_at = None
    db_superuser.profile_stats_computed_at = None
    await db_session.flush()

    response = await api_client_superuser.post(
        f"/v1/products/{owned_product.id}/images",
        files={"file": (IMAGE_NAME, GIF_BYTES, IMAGE_MIMETYPE)},
        data={"description": IMAGE_DESC},
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text
    await db_session.refresh(owner)
    await db_session.refresh(db_superuser)
    assert owner.profile_stats_computed_at is not None
    assert db_superuser.profile_stats_computed_at is None


@pytest.mark.parametrize(
    ("kind", "description"),
    [("file", FILE_DESC), ("images", IMAGE_DESC)],
)
async def test_upload_media_returns_the_stored_contract(
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
    api_client_superuser: AsyncClient, setup_product_for_files: Product, kind: str, endpoint: str
) -> None:
    """Deleting uploaded media should make follow-up reads return 404."""
    _, files, data, _, _ = _upload_request(kind)
    create_response = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/{endpoint}",
        files=files,
        data=data,
    )
    media_id = create_response.json()["id"]

    response_del = await api_client_superuser.delete(f"/v1/products/{setup_product_for_files.id}/{endpoint}/{media_id}")
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
    ("filename", "content_type", "content"),
    [
        ("cube.hdr", "text/plain", b"ENVI\nsamples = 1\nlines = 1\nbands = 224\n"),
        ("cube.raw", "application/octet-stream", b"\x00\x01\x02\x03"),
        ("cube.h5", "application/x-hdf5", b"\x89HDF\r\n\x1a\n"),
        ("scene.ntf", "application/octet-stream", b"NITF02.10"),
        ("geocube.tif", "image/tiff", _tiff_bytes()),
    ],
)
async def test_upload_file_accepts_hyperspectral_research_formats(
    api_client_superuser: AsyncClient,
    setup_product_for_files: Product,
    filename: str,
    content_type: str,
    content: bytes,
) -> None:
    """Hyperspectral datasets are accepted as generic files."""
    response = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/files",
        files={"file": (filename, content, content_type)},
        data={"description": FILE_DESC},
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text
    body = response.json()
    assert body["filename"] == filename
    assert body["file_url"].startswith("/uploads/files/")
    assert filename not in body["file_url"]


async def test_list_product_files_returns_paginated_page(
    api_client_superuser: AsyncClient,
    api_client: AsyncClient,
    setup_product_for_files: Product,
) -> None:
    """The file list endpoint returns a fastapi-pagination Page envelope."""
    upload = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/files",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        data={"description": FILE_DESC},
    )
    assert upload.status_code == status.HTTP_201_CREATED, upload.text

    response = await api_client.get(f"/v1/products/{setup_product_for_files.id}/files")

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["total"] == 1
    assert [item["filename"] for item in body["items"]] == ["notes.txt"]


async def test_upload_file_rejects_unsupported_extension(
    api_client_superuser: AsyncClient,
    setup_product_for_files: Product,
) -> None:
    """Unsupported generic files are rejected before they reach public storage."""
    response = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/files",
        files={"file": ("payload.svg", b"<svg><script>alert(1)</script></svg>", "image/svg+xml")},
        data={"description": FILE_DESC},
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "not supported" in response.text


async def test_upload_file_rejects_stable_format_content_mismatch(
    api_client_superuser: AsyncClient,
    setup_product_for_files: Product,
) -> None:
    """Stable generic file formats must match their expected content signature."""
    response = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/files",
        files={"file": ("manual.pdf", b"<html>not a pdf</html>", "application/pdf")},
        data={"description": FILE_DESC},
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "does not match" in response.text


async def test_upload_image_rejects_hyperspectral_data_file(
    api_client_superuser: AsyncClient,
    setup_product_for_files: Product,
) -> None:
    """Hyperspectral files must use file routes rather than image processing routes."""
    response = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/images",
        files={"file": ("cube.h5", b"\x89HDF\r\n\x1a\n", "application/x-hdf5")},
        data={"description": IMAGE_DESC},
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "not supported for image uploads" in response.text


async def test_upload_image_rejects_extension_mismatch(
    api_client_superuser: AsyncClient,
    setup_product_for_files: Product,
) -> None:
    """Image uploads require extension, MIME type, and signature to agree."""
    response = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/images",
        files={"file": ("image.png", GIF_BYTES, "image/png")},
        data={"description": IMAGE_DESC},
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "does not match" in response.text


@pytest.mark.parametrize(
    ("kind", "endpoint"),
    [("file", "files"), ("image", "images")],
)
async def test_product_media_routes_reject_component_ids(
    api_client_superuser: AsyncClient,
    setup_product_graph,
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
    api_client_superuser: AsyncClient,
    setup_product_graph,
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
    api_client_superuser: AsyncClient,
    setup_product_graph,
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


@pytest.mark.parametrize(
    ("kind", "endpoint", "resource"),
    [
        ("file", "files", "products"),
        ("image", "images", "products"),
        ("file", "files", "components"),
        ("image", "images", "components"),
    ],
)
async def test_non_owner_cannot_upload_media(
    api_client_user: AsyncClient,
    setup_product_for_files: Product,
    setup_product_graph: ProductGraph,
    kind: str,
    endpoint: str,
    resource: str,
) -> None:
    """Media upload routes hide products/components owned by another user."""
    target_id = setup_product_graph.component.id if resource == "components" else setup_product_for_files.id
    _, files, data, _, _ = _upload_request(kind)
    response = await api_client_user.post(
        f"/v1/{resource}/{target_id}/{endpoint}",
        files=files,
        data=data,
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.parametrize(
    ("kind", "endpoint", "resource"),
    [
        ("file", "files", "products"),
        ("image", "images", "products"),
        ("file", "files", "components"),
        ("image", "images", "components"),
    ],
)
async def test_non_owner_cannot_delete_media(
    api_client: AsyncClient,
    test_app: FastAPI,
    db_user: User,
    db_superuser: User,
    setup_product_for_files: Product,
    setup_product_graph: ProductGraph,
    kind: str,
    endpoint: str,
    resource: str,
) -> None:
    """Media delete routes hide products/components owned by another user."""
    target_id = setup_product_graph.component.id if resource == "components" else setup_product_for_files.id
    _, files, data, _, _ = _upload_request(kind)
    with override_authenticated_user(test_app, db_superuser, superuser=True):
        create_response = await api_client.post(
            f"/v1/{resource}/{target_id}/{endpoint}",
            files=files,
            data=data,
        )
    media_id = create_response.json()["id"]

    with override_authenticated_user(test_app, db_user):
        response = await api_client.delete(f"/v1/{resource}/{target_id}/{endpoint}/{media_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_upload_rejected_at_quota_then_succeeds_after_release(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
    db_superuser: User,
    setup_product_for_files: Product,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Hitting the per-user upload-count quota rejects the next upload with 413.

    Deleting the counted media item must release the ledger so a further upload succeeds —
    this exercises reserve/release against the real ledger columns, not a mocked session.
    """
    monkeypatch.setattr(settings, "max_upload_files_per_user", 1)

    first = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/files",
        files={"file": ("first.txt", b"hello", "text/plain")},  # 5 bytes
        data={"description": FILE_DESC},
    )
    assert first.status_code == status.HTTP_201_CREATED, first.text
    media_id = first.json()["id"]
    await db_session.refresh(db_superuser)
    assert db_superuser.upload_file_count == 1
    assert db_superuser.upload_total_bytes == 5

    rejected = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/files",
        files={"file": ("second.txt", b"world", "text/plain")},  # 5 bytes
        data={"description": FILE_DESC},
    )
    assert rejected.status_code == status.HTTP_413_CONTENT_TOO_LARGE, rejected.text
    assert "quota" in rejected.json()["detail"].lower()
    await db_session.refresh(db_superuser)
    # rejected upload must not touch the ledger
    assert db_superuser.upload_file_count == 1
    assert db_superuser.upload_total_bytes == 5

    delete_response = await api_client_superuser.delete(f"/v1/products/{setup_product_for_files.id}/files/{media_id}")
    assert delete_response.status_code == status.HTTP_204_NO_CONTENT
    await db_session.refresh(db_superuser)
    assert db_superuser.upload_file_count == 0
    assert db_superuser.upload_total_bytes == 0

    retried = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/files",
        files={"file": ("third.txt", b"again", "text/plain")},  # 5 bytes
        data={"description": FILE_DESC},
    )
    assert retried.status_code == status.HTTP_201_CREATED, retried.text
    await db_session.refresh(db_superuser)
    assert db_superuser.upload_file_count == 1
    assert db_superuser.upload_total_bytes == 5


async def test_upload_rejected_at_byte_quota_then_succeeds_after_release(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
    db_superuser: User,
    setup_product_for_files: Product,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Hitting the per-user byte quota rejects the next upload with 413.

    Sibling of the file-count test above: pins the ``upload_total_bytes`` predicate and
    release decrement specifically, with the file-count limit left at its generous default
    so only the byte budget can be the cause of the 413.
    """
    monkeypatch.setattr(upload_quota, "_max_upload_bytes", lambda: 8)

    first = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/files",
        files={"file": ("first.txt", b"hello", "text/plain")},  # 5 bytes, fits the 8-byte budget
        data={"description": FILE_DESC},
    )
    assert first.status_code == status.HTTP_201_CREATED, first.text
    media_id = first.json()["id"]
    await db_session.refresh(db_superuser)
    assert db_superuser.upload_total_bytes == 5

    rejected = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/files",
        files={"file": ("second.txt", b"world", "text/plain")},  # 5 more bytes would exceed the 8-byte budget
        data={"description": FILE_DESC},
    )
    assert rejected.status_code == status.HTTP_413_CONTENT_TOO_LARGE, rejected.text
    assert "quota" in rejected.json()["detail"].lower()
    await db_session.refresh(db_superuser)
    assert db_superuser.upload_total_bytes == 5  # rejected upload must not touch the ledger

    delete_response = await api_client_superuser.delete(f"/v1/products/{setup_product_for_files.id}/files/{media_id}")
    assert delete_response.status_code == status.HTTP_204_NO_CONTENT
    await db_session.refresh(db_superuser)
    assert db_superuser.upload_total_bytes == 0

    retried = await api_client_superuser.post(
        f"/v1/products/{setup_product_for_files.id}/files",
        files={"file": ("third.txt", b"again", "text/plain")},  # 5 bytes, fits again after release
        data={"description": FILE_DESC},
    )
    assert retried.status_code == status.HTTP_201_CREATED, retried.text
    await db_session.refresh(db_superuser)
    assert db_superuser.upload_total_bytes == 5
