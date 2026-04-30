"""Unit tests for image processing utilities."""
# spell-checker: ignore getexif, GPSIFD

import io
from pathlib import Path

import pytest
from anyio import Path as AnyIOPath
from fastapi import UploadFile
from PIL import Image as PILImage
from starlette.datastructures import Headers

from app.core.images import (
    ALLOWED_IMAGE_MIME_TYPES,
    MAX_IMAGE_DIMENSION,
    THUMBNAIL_WIDTHS,
    apply_exif_orientation,
    delete_thumbnails,
    generate_thumbnails,
    process_image_for_storage,
    resize_image,
    strip_sensitive_exif,
    thumbnail_path_for,
    validate_image_dimensions,
    validate_image_file,
    validate_image_mime_type,
)


@pytest.fixture
def sample_image(tmp_path: Path) -> Path:
    """Create a sample image for testing."""
    image_path = tmp_path / "test_image.png"
    img = PILImage.new("RGB", (400, 200), color="red")
    img.save(image_path)
    return image_path


@pytest.fixture
def jpeg_image(tmp_path: Path) -> Path:
    """Create a sample JPEG image for testing."""
    image_path = tmp_path / "test_image.jpg"
    img = PILImage.new("RGB", (400, 200), color="blue")
    img.save(image_path, format="JPEG")
    return image_path


def _make_jpeg_with_exif(
    path: Path, width: int, height: int, orientation: int | None = None, *, camera_make: bool = False
) -> Path:
    """Save a JPEG with optional EXIF orientation and metadata tags."""
    img = PILImage.new("RGB", (width, height), color="green")
    exif = PILImage.Exif()
    if orientation is not None:
        exif[0x0112] = orientation
    if camera_make:
        exif[0x010F] = "Test Camera"
    img.save(path, format="JPEG", exif=exif)
    return path


def _make_upload_file(content_type: str) -> UploadFile:
    """Create a minimal UploadFile for MIME type validation tests."""
    return UploadFile(file=io.BytesIO(b""), filename="test.bin", headers=Headers({"content-type": content_type}))


# ---------------------------------------------------------------------------
# resize_image
# ---------------------------------------------------------------------------


def test_resize_image_width(sample_image: Path) -> None:
    """Test resizing by width only."""
    resized_bytes = resize_image(sample_image, width=100)

    with PILImage.open(io.BytesIO(resized_bytes)) as img:
        assert img.width == 100
        assert img.height == 50  # Aspect ratio 2:1 maintained


def test_resize_image_height(sample_image: Path) -> None:
    """Test resizing by height only."""
    resized_bytes = resize_image(sample_image, height=100)

    with PILImage.open(io.BytesIO(resized_bytes)) as img:
        assert img.height == 100
        assert img.width == 200  # Aspect ratio 2:1 maintained


def test_resize_image_both(sample_image: Path) -> None:
    """Test resizing by both width and height."""
    resized_bytes = resize_image(sample_image, width=50, height=50)

    with PILImage.open(io.BytesIO(resized_bytes)) as img:
        assert img.width == 50
        assert img.height == 50


def test_resize_image_none(sample_image: Path) -> None:
    """Test resizing with neither width nor height (should return original size)."""
    resized_bytes = resize_image(sample_image)

    with PILImage.open(io.BytesIO(resized_bytes)) as img:
        assert img.width == 400
        assert img.height == 200


def test_resize_image_not_found() -> None:
    """Test error when image file is not found."""
    with pytest.raises(FileNotFoundError):
        resize_image(Path("non_existent.png"), width=100)


def test_resize_image_accepts_anyio_path(sample_image: Path) -> None:
    """Resize should work with anyio.Path without touching async exists()."""
    async_path = AnyIOPath(str(sample_image))

    resized_bytes = resize_image(async_path, width=100)

    with PILImage.open(io.BytesIO(resized_bytes)) as img:
        assert img.width == 100
        assert img.height == 50


# ---------------------------------------------------------------------------
# validate_image_dimensions
# ---------------------------------------------------------------------------


def test_validate_dimensions_accepts_valid_images() -> None:
    """Images within the limit (and exactly at the limit) should not raise."""
    validate_image_dimensions(PILImage.new("RGB", (100, 100)))
    validate_image_dimensions(PILImage.new("RGB", (MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION)))


def test_validate_dimensions_exceeds_width() -> None:
    """Images exceeding max width should raise ValueError."""
    img = PILImage.new("RGB", (MAX_IMAGE_DIMENSION + 1, 100))
    with pytest.raises(ValueError, match="exceed the maximum"):
        validate_image_dimensions(img)


def test_validate_dimensions_exceeds_height() -> None:
    """Images exceeding max height should raise ValueError."""
    img = PILImage.new("RGB", (100, MAX_IMAGE_DIMENSION + 1))
    with pytest.raises(ValueError, match="exceed the maximum"):
        validate_image_dimensions(img)


def test_validate_dimensions_custom_limit() -> None:
    """Custom max_dimension parameter should be respected."""
    img = PILImage.new("RGB", (500, 500))
    with pytest.raises(ValueError, match="exceed the maximum"):
        validate_image_dimensions(img, max_dimension=400)


# ---------------------------------------------------------------------------
# image upload validation
# ---------------------------------------------------------------------------


def test_validate_image_mime_type_accepts_allowed_types() -> None:
    """Allowed MIME types should pass through unchanged."""
    for mime_type in ALLOWED_IMAGE_MIME_TYPES:
        file = _make_upload_file(mime_type)
        assert validate_image_mime_type(file) == file


def test_validate_image_mime_type_rejects_disallowed_type() -> None:
    """Disallowed MIME types should raise ValueError."""
    file = _make_upload_file("text/plain")

    with pytest.raises(ValueError, match="Invalid file type"):
        validate_image_mime_type(file)


def test_validate_image_file_accepts_valid_image() -> None:
    """A real image byte stream should be accepted."""
    buf = io.BytesIO()
    PILImage.new("RGB", (10, 10), color="red").save(buf, format="PNG")

    validate_image_file(buf)


def test_validate_image_file_rejects_invalid_image() -> None:
    """Non-image bytes should raise ValueError."""
    with pytest.raises(ValueError, match="Invalid image file"):
        validate_image_file(io.BytesIO(b"not an image"))


# ---------------------------------------------------------------------------
# apply_exif_orientation
# ---------------------------------------------------------------------------


def test_apply_exif_orientation_noop_for_un_rotated(tmp_path: Path) -> None:
    """Images with orientation=1 or no orientation tag should not be transformed."""
    for path in [
        _make_jpeg_with_exif(tmp_path / "normal.jpg", 400, 200, orientation=1),
        (tmp_path / "no_exif.jpg"),
    ]:
        if not path.exists():
            PILImage.new("RGB", (400, 200), color="red").save(path, format="JPEG")
        with PILImage.open(path) as img:
            corrected = apply_exif_orientation(img)
        assert corrected.width == 400
        assert corrected.height == 200


@pytest.mark.parametrize("orientation", [6, 8])
def test_apply_exif_orientation_90deg_swaps_dimensions(tmp_path: Path, orientation: int) -> None:
    """Orientations 6 (90° CW) and 8 (90° CCW) should both swap width and height."""
    path = _make_jpeg_with_exif(tmp_path / f"orient{orientation}.jpg", 100, 200, orientation=orientation)

    with PILImage.open(path) as img:
        corrected = apply_exif_orientation(img)

    assert corrected.width == 200
    assert corrected.height == 100


def test_apply_exif_orientation_3_preserves_dimensions(tmp_path: Path) -> None:
    """Orientation 3 (180°) should preserve width and height."""
    path = _make_jpeg_with_exif(tmp_path / "orient3.jpg", 400, 200, orientation=3)

    with PILImage.open(path) as img:
        corrected = apply_exif_orientation(img)

    assert corrected.width == 400
    assert corrected.height == 200


# ---------------------------------------------------------------------------
# strip_sensitive_exif
# ---------------------------------------------------------------------------


def test_strip_sensitive_exif_removes_orientation(tmp_path: Path) -> None:
    """Orientation tag should be stripped (callers must apply it first)."""
    path = _make_jpeg_with_exif(tmp_path / "oriented.jpg", 100, 100, orientation=6)

    with PILImage.open(path) as img:
        assert img.getexif().get(0x0112) is not None
        strip_sensitive_exif(img)
        assert img.getexif().get(0x0112) is None


# ---------------------------------------------------------------------------
# process_image_for_storage
# ---------------------------------------------------------------------------


def test_process_image_not_found() -> None:
    """Should raise FileNotFoundError for a missing file."""
    with pytest.raises(FileNotFoundError):
        process_image_for_storage(Path("non_existent.jpg"))


def test_process_image_accepts_anyio_path(tmp_path: Path) -> None:
    """Process should work with anyio.Path without touching async exists()."""
    path = tmp_path / "anyio.jpg"
    PILImage.new("RGB", (100, 100), color="green").save(path, format="JPEG")
    async_path = AnyIOPath(str(path))

    process_image_for_storage(async_path)

    with PILImage.open(path) as result:
        assert result.size == (100, 100)


def test_process_image_dimension_guard(tmp_path: Path) -> None:
    """Images exceeding MAX_IMAGE_DIMENSION should raise ValueError."""
    path = tmp_path / "huge.jpg"
    PILImage.new("RGB", (MAX_IMAGE_DIMENSION + 1, 100)).save(path, format="JPEG")

    with pytest.raises(ValueError, match="exceed the maximum"):
        process_image_for_storage(path)


def test_process_image_strips_all_exif(tmp_path: Path) -> None:
    """Stored images should not retain EXIF metadata."""
    path = _make_jpeg_with_exif(tmp_path / "metadata.jpg", 100, 100, camera_make=True)

    process_image_for_storage(path)

    with PILImage.open(path) as result:
        assert not result.info.get("exif")
        assert not result.getexif()


def test_process_image_applies_orientation_and_strips_tag(tmp_path: Path) -> None:
    """Orientation should be baked into pixels and the orientation tag removed."""
    # 100w x 200h tagged orientation 6 → after processing: 200w x 100h, no orientation tag
    path = _make_jpeg_with_exif(tmp_path / "orient.jpg", 100, 200, orientation=6)

    process_image_for_storage(path)

    with PILImage.open(path) as result:
        assert result.width == 200
        assert result.height == 100
        assert result.getexif().get(0x0112) is None


def test_process_image_normal_orientation_unchanged(tmp_path: Path) -> None:
    """Images with no orientation issue should preserve their dimensions."""
    path = _make_jpeg_with_exif(tmp_path / "normal.jpg", 400, 200, orientation=1)

    process_image_for_storage(path)

    with PILImage.open(path) as result:
        assert result.width == 400
        assert result.height == 200


# ---------------------------------------------------------------------------
# thumbnail_path_for
# ---------------------------------------------------------------------------


def test_thumbnail_path_for(tmp_path: Path) -> None:
    """Should return the expected derivative path."""
    image_path = tmp_path / "abc123_photo.jpg"
    result = thumbnail_path_for(image_path, 200)
    assert result == tmp_path / "abc123_photo_thumb_200.webp"


# ---------------------------------------------------------------------------
# generate_thumbnails
# ---------------------------------------------------------------------------


@pytest.fixture
def large_image(tmp_path: Path) -> Path:
    """Create a 2000x1000 image suitable for thumbnail generation."""
    path = tmp_path / "large.jpg"
    PILImage.new("RGB", (2000, 1000), color="blue").save(path, format="JPEG")
    return path


def test_generate_thumbnails_creates_standard_sizes(large_image: Path) -> None:
    """Should create WebP thumbnails for all standard widths smaller than the original."""
    generated = generate_thumbnails(large_image)

    expected_widths = [w for w in THUMBNAIL_WIDTHS if w < 2000]
    assert len(generated) == len(expected_widths)

    for w in expected_widths:
        thumb = thumbnail_path_for(large_image, w)
        assert thumb.exists()
        with PILImage.open(thumb) as img:
            assert img.format == "WEBP"
            assert img.width == w
            # Aspect ratio maintained (2:1)
            assert img.height == w // 2


def test_generate_thumbnails_skips_larger_than_original(tmp_path: Path) -> None:
    """Should skip thumbnail widths that exceed the original image width."""
    path = tmp_path / "small.jpg"
    PILImage.new("RGB", (150, 100), color="red").save(path, format="JPEG")

    generated = generate_thumbnails(path)

    assert generated == []
    for w in THUMBNAIL_WIDTHS:
        assert not thumbnail_path_for(path, w).exists()


def test_generate_thumbnails_custom_widths(large_image: Path) -> None:
    """Should respect custom width tuples."""
    generated = generate_thumbnails(large_image, widths=(300, 600))

    assert len(generated) == 2
    with PILImage.open(thumbnail_path_for(large_image, 300)) as img:
        assert img.width == 300
    with PILImage.open(thumbnail_path_for(large_image, 600)) as img:
        assert img.width == 600


def test_generate_thumbnails_not_found() -> None:
    """Should raise FileNotFoundError for a missing source image."""
    with pytest.raises(FileNotFoundError):
        generate_thumbnails(Path("nonexistent.jpg"))


# ---------------------------------------------------------------------------
# delete_thumbnails
# ---------------------------------------------------------------------------


def test_delete_thumbnails_removes_generated_files(large_image: Path) -> None:
    """Should remove all generated thumbnail files."""
    generate_thumbnails(large_image)

    # Verify they exist first
    for w in THUMBNAIL_WIDTHS:
        if w < 2000:
            assert thumbnail_path_for(large_image, w).exists()

    delete_thumbnails(large_image)

    for w in THUMBNAIL_WIDTHS:
        assert not thumbnail_path_for(large_image, w).exists()


def test_delete_thumbnails_noop_when_none_exist(large_image: Path) -> None:
    """Should not raise when no thumbnails exist."""
    delete_thumbnails(large_image)  # Should not raise
