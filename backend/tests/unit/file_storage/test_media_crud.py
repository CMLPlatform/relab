"""Behavior-focused tests for file and image CRUD entrypoints."""

from io import BytesIO
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import UploadFile
from PIL import Image as PILImage
from PIL.ExifTags import GPS, IFD
from pydantic import ValidationError
from starlette.datastructures import Headers

from app.api.auth.roles import UserRole
from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.file_storage.crud import support_services
from app.api.file_storage.crud.support_services import file_storage_service, image_storage_service
from app.api.file_storage.exceptions import UploadTooLargeError
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.models.storage_s3 import S3Storage
from app.api.file_storage.schemas import FileCreate, ImageCreateInternal

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

    from pytest_mock import MockerFixture

TEST_FILE_DESC = "Test file"
TEST_FILENAME = "test.txt"
TEST_IMAGE_DESC = "Test image"
IMAGE_FILENAME = "image.png"
FAKE_PATH = "/fake/path/test.txt"
FAKE_IMAGE_PATH = "/fake/path/test.png"
CONTENT_TYPE_PNG = "image/png"
MB = 1024 * 1024


@pytest.fixture(autouse=True)
def _parent_exists() -> Iterator[None]:
    """The parent check runs before the size and content checks these tests exercise."""
    with patch.object(support_services, "ensure_parent_exists", AsyncMock()):
        yield


def test_file_create_rejects_quota_user_fields() -> None:
    """Upload payload schemas should not expose quota-accounting fields."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = TEST_FILENAME

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        # quota_user_id was deliberately removed from the schema; this pins that
        # pydantic rejects it at runtime as an unknown field.
        FileCreate(
            file=mock_file,
            description=TEST_FILE_DESC,
            parent_id=1,
            parent_type=MediaParentType.PRODUCT,
            quota_user_id=uuid4(),  # ty: ignore[unknown-argument]
        )


async def test_create_file_rejects_oversized_upload(mock_session: AsyncMock) -> None:
    """Rejects file uploads above the size limit."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = TEST_FILENAME
    mock_file.size = 51 * MB
    mock_file.file = BytesIO(b"")

    file_create = FileCreate(
        file=mock_file, description=TEST_FILE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with pytest.raises(UploadTooLargeError, match="Maximum size: 50 MB"):
        await file_storage_service.create(mock_session, file_create, caps_role=UserRole.CONTRIBUTOR)


async def test_create_file_uses_configured_upload_size_limit(
    mock_session: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Generic file uploads should use the configured limit instead of a module constant."""
    monkeypatch.setattr("app.api.file_storage.crud.support_services.settings.max_file_upload_size_mb", 2)
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = TEST_FILENAME
    mock_file.size = 3 * MB
    mock_file.file = BytesIO(b"")

    file_create = FileCreate(
        file=mock_file, description=TEST_FILE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with pytest.raises(UploadTooLargeError, match="Maximum size: 2 MB"):
        await file_storage_service.create(mock_session, file_create, caps_role=UserRole.CONTRIBUTOR)


async def test_delete_product_file_releases_upload_quota(mock_session: AsyncMock) -> None:
    """Deleting product-owned files should release the owner's upload ledger."""
    file_id = uuid4()
    mock_db_file = MagicMock(spec=File)
    mock_db_file.file.path = FAKE_PATH
    mock_db_file.parent_type = MediaParentType.PRODUCT
    mock_db_file.parent_id = 1
    mock_db_file.upload_size_bytes = 1024

    with (
        patch("app.api.file_storage.crud.support_services.require_locked_model", return_value=mock_db_file),
        patch("app.api.file_storage.crud.support_services.delete_file_from_storage"),
        patch(
            "app.api.file_storage.crud.support_services.release_product_upload_quota_for_media",
            new=AsyncMock(),
        ) as release_quota,
    ):
        await file_storage_service.delete(mock_session, file_id)

    release_quota.assert_awaited_once_with(mock_session, mock_db_file)


def test_image_create_rejects_quota_user_fields() -> None:
    """Image upload payload schemas should not expose quota-accounting fields."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = IMAGE_FILENAME

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        # quota_user_id was deliberately removed from the schema; this pins that
        # pydantic rejects it at runtime as an unknown field.
        ImageCreateInternal(
            file=mock_file,
            description=TEST_IMAGE_DESC,
            parent_id=1,
            parent_type=MediaParentType.PRODUCT,
            quota_user_id=uuid4(),  # ty: ignore[unknown-argument]
        )


@pytest.mark.parametrize(
    ("caps_role", "size_mb", "limit_mb"),
    [
        (UserRole.CONTRIBUTOR, 11, 10),
        (UserRole.LAB, 21, 20),
    ],
)
async def test_create_image_rejects_upload_over_the_uploader_role_cap(
    mock_session: AsyncMock, caps_role: UserRole, size_mb: int, limit_mb: int
) -> None:
    """The per-image size cap follows the tier the caller passes for the uploader."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = IMAGE_FILENAME
    mock_file.content_type = CONTENT_TYPE_PNG
    mock_file.size = size_mb * MB
    mock_file.file = BytesIO(b"")

    image_create = ImageCreateInternal(
        file=mock_file, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with pytest.raises(UploadTooLargeError, match=f"Maximum size: {limit_mb} MB"):
        await image_storage_service.create(mock_session, image_create, caps_role=caps_role)


async def test_create_image_on_a_missing_product_is_not_found_before_any_cap(mock_session: AsyncMock) -> None:
    """A missing parent answers 404, not a size error."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = IMAGE_FILENAME
    mock_file.content_type = CONTENT_TYPE_PNG
    mock_file.size = 30 * MB
    mock_file.file = BytesIO(b"")

    image_create = ImageCreateInternal(
        file=mock_file, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with (
        patch.object(support_services, "ensure_parent_exists", AsyncMock(side_effect=ModelNotFoundError())),
        pytest.raises(ModelNotFoundError),
    ):
        await image_storage_service.create(mock_session, image_create, caps_role=UserRole.CONTRIBUTOR)


async def test_create_image_uses_configured_upload_size_limit(
    mock_session: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Image uploads should use the configured limit instead of a module constant."""
    monkeypatch.setattr("app.api.auth.roles.settings.max_image_upload_size_mb", 2)
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = IMAGE_FILENAME
    mock_file.content_type = CONTENT_TYPE_PNG
    mock_file.size = 3 * MB
    mock_file.file = BytesIO(b"")

    image_create = ImageCreateInternal(
        file=mock_file, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with pytest.raises(UploadTooLargeError, match="Maximum size: 2 MB"):
        await image_storage_service.create(mock_session, image_create, caps_role=UserRole.CONTRIBUTOR)


async def test_delete_image_removes_the_row_and_its_stored_files(mock_session: AsyncMock) -> None:
    """Deleting an image drops the row and its original and derived files."""
    image_id = uuid4()
    mock_db_image = MagicMock(spec=Image)
    mock_db_image.file.path = FAKE_IMAGE_PATH

    with (
        patch("app.api.file_storage.crud.support_services.require_locked_model", return_value=mock_db_image),
        patch(
            "app.api.file_storage.crud.support_services.delete_image_from_storage",
            new=AsyncMock(),
        ) as mock_delete_image,
        patch("app.api.file_storage.crud.support_services.release_product_upload_quota_for_media", new=AsyncMock()),
    ):
        await image_storage_service.delete(mock_session, image_id)

    mock_session.delete.assert_called_once_with(mock_db_image)
    mock_delete_image.assert_awaited_once_with(mock_db_image)


async def test_thumbnails_are_generated_for_a_local_image(tmp_path: Path) -> None:
    """A filesystem-stored image gets the full default thumbnail set before the response."""
    image_path = tmp_path / "shot.png"
    PILImage.new("RGB", (2001, 1234), color="red").save(image_path)
    db_image = Image(id=uuid4())

    with (
        patch.object(support_services, "stored_file_path", return_value=image_path),
        patch.object(support_services, "generate_thumbnails") as mock_generate,
    ):
        await support_services._generate_image_thumbnails(db_image)

    # Called with no widths, so the upload generates the full default set inline.
    mock_generate.assert_called_once_with(image_path)


def _jpeg_upload(**save_kwargs: object) -> tuple[UploadFile, bytes]:
    """Return a 40x60 JPEG upload saved with ``save_kwargs``, and its original bytes."""
    original = BytesIO()
    PILImage.new("RGB", (40, 60), "red").save(original, format="JPEG", **save_kwargs)
    upload = UploadFile(
        file=BytesIO(original.getvalue()),
        filename="photo.jpg",
        size=len(original.getvalue()),
        headers=Headers({"content-type": "image/jpeg"}),
    )
    return upload, original.getvalue()


async def test_create_image_strips_metadata_before_an_s3_upload(mock_session: AsyncMock, mocker: MockerFixture) -> None:
    """The S3 backend receives the stripped, rotated bytes, and the row records their size.

    S3 has no local path to post-process, so stripping has to happen on the upload itself,
    before it reaches any storage backend.
    """
    exif = PILImage.Exif()
    exif[0x0112] = 6
    exif.get_ifd(IFD.GPSInfo)[GPS.GPSLatitudeRef] = "N"
    upload, _ = _jpeg_upload(exif=exif)

    uploaded: list[bytes] = []
    client = MagicMock()
    client.upload_fileobj.side_effect = lambda fileobj, **_: uploaded.append(fileobj.read())
    storage = S3Storage(bucket="bucket", prefix="images")
    mocker.patch.object(storage, "_get_client", return_value=client)
    mocker.patch.object(image_storage_service, "get_storage", return_value=storage)

    image_create = ImageCreateInternal(
        file=upload, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )
    db_image = await image_storage_service.create(mock_session, image_create, caps_role=UserRole.CONTRIBUTOR)

    [stored] = uploaded
    with PILImage.open(BytesIO(stored)) as result:
        assert result.size == (60, 40)
        assert not result.getexif().get_ifd(IFD.GPSInfo)
    assert (db_image.width_px, db_image.height_px) == (60, 40)


async def test_create_image_charges_the_quota_for_the_stored_size(
    mock_session: AsyncMock, mocker: MockerFixture
) -> None:
    """The quota and the row count the stripped bytes, not the original upload.

    Otherwise metadata the backend throws away (here a large XMP packet) still uses up
    the owner's quota, and deleting the image releases the same inflated amount.
    """
    upload, original = _jpeg_upload(xmp=b'<x:xmpmeta xmlns:x="adobe:ns:meta/">' + b"x" * 50_000 + b"</x:xmpmeta>")

    uploaded: list[bytes] = []
    storage = MagicMock()

    async def write_upload(upload_file: UploadFile, stored_filename: str) -> str:
        uploaded.append(upload_file.file.read())
        return stored_filename

    storage.write_upload.side_effect = write_upload
    mocker.patch.object(image_storage_service, "get_storage", return_value=storage)
    mock_reserve = mocker.patch.object(support_services, "reserve_product_upload_quota", AsyncMock())

    image_create = ImageCreateInternal(
        file=upload, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )
    db_image = await image_storage_service.create(
        mock_session, image_create, caps_role=UserRole.CONTRIBUTOR, quota_user_id=uuid4()
    )

    [stored] = uploaded
    assert len(stored) < len(original) - 40_000
    mock_reserve.assert_awaited_once_with(mock_session, parent_id=1, upload_size_bytes=len(stored))
    assert db_image.upload_size_bytes == len(stored)
