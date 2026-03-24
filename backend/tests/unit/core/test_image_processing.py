"""Unit tests for image processing utilities."""
# spell-checker: ignore getexif, GPSIFD

import io
from pathlib import Path

import piexif
import pytest
from PIL import Image as PILImage

from app.core.images import (
    MAX_IMAGE_DIMENSION,
    apply_exif_orientation,
    process_image_for_storage,
    resize_image,
    strip_sensitive_exif,
    validate_image_dimensions,
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
    path: Path, width: int, height: int, orientation: int | None = None, *, gps: bool = False
) -> Path:
    """Save a JPEG with optional EXIF orientation and GPS tags."""
    img = PILImage.new("RGB", (width, height), color="green")
    exif_dict: dict = {"0th": {}, "Exif": {}, "1st": {}, "thumbnail": None}
    if orientation is not None:
        exif_dict["0th"][piexif.ImageIFD.Orientation] = orientation
    if gps:
        exif_dict["GPS"] = {piexif.GPSIFD.GPSLatitudeRef: b"N"}
    exif_bytes = piexif.dump(exif_dict)
    img.save(path, format="JPEG", exif=exif_bytes)
    return path


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


# ---------------------------------------------------------------------------
# validate_image_dimensions
# ---------------------------------------------------------------------------


def test_validate_dimensions_within_limit() -> None:
    """Images within the dimension limit should not raise."""
    img = PILImage.new("RGB", (100, 100))
    validate_image_dimensions(img)  # should not raise


def test_validate_dimensions_at_limit() -> None:
    """Images exactly at the limit should not raise."""
    img = PILImage.new("RGB", (MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION))
    validate_image_dimensions(img)  # should not raise


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
# apply_exif_orientation
# ---------------------------------------------------------------------------


def test_apply_exif_orientation_noop_for_normal(tmp_path: Path) -> None:
    """Images with orientation=1 (normal) should not be transformed."""
    path = _make_jpeg_with_exif(tmp_path / "normal.jpg", 400, 200, orientation=1)

    with PILImage.open(path) as img:
        corrected = apply_exif_orientation(img)

    assert corrected.width == 400
    assert corrected.height == 200


def test_apply_exif_orientation_noop_when_absent(tmp_path: Path) -> None:
    """Images without an orientation tag should not be transformed."""
    path = tmp_path / "no_exif.jpg"
    PILImage.new("RGB", (400, 200), color="red").save(path, format="JPEG")

    with PILImage.open(path) as img:
        corrected = apply_exif_orientation(img)

    assert corrected.width == 400
    assert corrected.height == 200


def test_apply_exif_orientation_6_rotates_dimensions(tmp_path: Path) -> None:
    """Orientation 6 (90° CW) should swap width and height."""
    # 100w x 200h image tagged as "rotated 90° CW" → corrected to 200w x 100h
    path = _make_jpeg_with_exif(tmp_path / "orient6.jpg", 100, 200, orientation=6)

    with PILImage.open(path) as img:
        corrected = apply_exif_orientation(img)

    assert corrected.width == 200
    assert corrected.height == 100


def test_apply_exif_orientation_8_rotates_dimensions(tmp_path: Path) -> None:
    """Orientation 8 (90° CCW) should swap width and height."""
    path = _make_jpeg_with_exif(tmp_path / "orient8.jpg", 100, 200, orientation=8)

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


def test_strip_sensitive_exif_removes_gps(tmp_path: Path) -> None:
    """GPS tag should be stripped from EXIF."""
    path = _make_jpeg_with_exif(tmp_path / "gps.jpg", 100, 100, gps=True)

    process_image_for_storage(path)

    with PILImage.open(path) as img:
        exif_bytes = img.info.get("exif")
        if exif_bytes:
            exif_dict = piexif.load(exif_bytes)
            # GPS IFD should be empty after processing
            assert exif_dict.get("GPS") == {}


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


def test_process_image_dimension_guard(tmp_path: Path) -> None:
    """Images exceeding MAX_IMAGE_DIMENSION should raise ValueError."""
    path = tmp_path / "huge.jpg"
    PILImage.new("RGB", (MAX_IMAGE_DIMENSION + 1, 100)).save(path, format="JPEG")

    with pytest.raises(ValueError, match="exceed the maximum"):
        process_image_for_storage(path)


def test_process_image_strips_gps(tmp_path: Path) -> None:
    """GPS data should be absent from the saved file after processing."""
    path = _make_jpeg_with_exif(tmp_path / "gps.jpg", 100, 100, gps=True)

    process_image_for_storage(path)

    with PILImage.open(path) as result:
        exif_bytes = result.info.get("exif")
        if exif_bytes:
            exif_dict = piexif.load(exif_bytes)
            assert exif_dict.get("GPS") == {}


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


def test_process_image_file_still_valid_after_processing(tmp_path: Path) -> None:
    """File saved by process_image_for_storage should be a valid image."""
    path = tmp_path / "plain.jpg"
    PILImage.new("RGB", (200, 200), color="red").save(path, format="JPEG")

    process_image_for_storage(path)

    with PILImage.open(path) as result:
        assert result.size == (200, 200)
