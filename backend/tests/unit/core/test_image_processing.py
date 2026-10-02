"""Unit tests for image processing utilities."""

import io
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from fastapi import UploadFile
from PIL import Image as PILImage
from PIL import ImageCms, PngImagePlugin
from PIL.ExifTags import GPS, IFD
from starlette.datastructures import Headers

from app.core.images import (
    ALLOWED_IMAGE_MIME_TYPES,
    MAX_IMAGE_DIMENSION,
    THUMBNAIL_WIDTHS,
    apply_exif_orientation,
    delete_thumbnails,
    filter_exif,
    generate_thumbnails,
    process_image_for_storage,
    thumbnail_path_for,
    validate_image_dimensions,
    validate_image_file,
    validate_image_mime_type,
)

if TYPE_CHECKING:
    from typing import Any


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


def _make_jpeg_with_rich_exif(path: Path, width: int = 40, height: int = 60, orientation: int | None = None) -> Path:
    """Save a JPEG carrying both preserved capture parameters and identifying metadata."""
    img = PILImage.new("RGB", (width, height), color=(1, 2, 3))
    exif = img.getexif()
    exif[0x010F] = "Test Camera"  # Make (preserved)
    exif[0x0110] = "Model X"  # Model (preserved)
    exif[0x0131] = "SecretSoftware"  # Software (dropped)
    if orientation is not None:
        exif[0x0112] = orientation
    sub_ifd = exif.get_ifd(IFD.Exif)
    sub_ifd[0x920A] = 35.0  # FocalLength (preserved)
    sub_ifd[0x8827] = 400  # ISOSpeedRatings (preserved)
    sub_ifd[0x927C] = b"MAKERNOTE-SECRET"  # MakerNote (dropped)
    sub_ifd[0xA431] = "SERIAL123"  # BodySerialNumber (dropped)
    exif.get_ifd(IFD.GPSInfo)[GPS.GPSLatitudeRef] = "N"
    img.save(path, format="JPEG", exif=exif)
    return path


def _process(path: Path) -> tuple[int, int]:
    """Run ``process_image_for_storage`` on a file on disk, rewriting it in place."""
    with path.open("r+b") as image:
        return process_image_for_storage(image)


def _make_upload_file(content_type: str) -> UploadFile:
    """Create a minimal UploadFile for MIME type validation tests."""
    return UploadFile(file=io.BytesIO(b""), filename="test.bin", headers=Headers({"content-type": content_type}))


# ---------------------------------------------------------------------------
# validate_image_dimensions
# ---------------------------------------------------------------------------


def test_validate_dimensions_accepts_valid_images() -> None:
    """Images within both the per-side and total-pixel limits should not raise."""
    validate_image_dimensions(PILImage.new("RGB", (100, 100)))
    # At the per-side limit but within the pixel cap (a square at the per-side max would
    # be 100 MPx, over the 50 MPx bomb guard, and is rejected by the pixel-flood test).
    validate_image_dimensions(PILImage.new("L", (MAX_IMAGE_DIMENSION, 3000)))


@pytest.mark.parametrize(
    "size",
    [
        (8000, 6000),  # 48 MP phone mode
        (8192, 5464),  # 45 MP full-frame body
        (8256, 5504),  # 45.7 MP full-frame body
    ],
)
def test_validate_dimensions_accepts_high_resolution_sensors(size: tuple[int, int]) -> None:
    """Untouched originals from 48 MP phones and 45 MP cameras fit both caps, either way up."""
    validate_image_dimensions(PILImage.new("L", size))
    validate_image_dimensions(PILImage.new("L", size[::-1]))
    # Both limits are inclusive: exactly at the per-side and total-pixel caps is allowed.
    validate_image_dimensions(PILImage.new("RGB", (10, 20)), max_dimension=20, max_pixels=200)


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
# filter_exif
# ---------------------------------------------------------------------------


def test_filter_exif_keeps_only_allowlisted_tags(tmp_path: Path) -> None:
    """Capture parameters survive; identifying tags are never copied across."""
    path = _make_jpeg_with_rich_exif(tmp_path / "rich.jpg", orientation=6)

    with PILImage.open(path) as img:
        filtered = filter_exif(img)

    assert filtered[0x010F] == "Test Camera"
    assert filtered[0x0110] == "Model X"
    assert filtered[IFD.Exif] == {0x920A: 35.0, 0x8827: 400}
    assert 0x0131 not in filtered  # Software
    assert IFD.GPSInfo not in filtered
    # Orientation is baked into the pixels by the caller; re-writing it double-rotates.
    assert 0x0112 not in filtered


def test_filter_exif_leaves_source_image_untouched(tmp_path: Path) -> None:
    """Filtering builds a new Exif rather than mutating the opened image."""
    path = _make_jpeg_with_rich_exif(tmp_path / "rich.jpg")

    with PILImage.open(path) as img:
        filter_exif(img)
        assert img.getexif().get_ifd(IFD.GPSInfo)


# ---------------------------------------------------------------------------
# process_image_for_storage
# ---------------------------------------------------------------------------


def test_process_image_returns_the_stored_size(tmp_path: Path) -> None:
    """The size is read off the header the validation already parsed, not by a second open."""
    path = tmp_path / "plain.jpg"
    PILImage.new("RGB", (640, 480), color="green").save(path, format="JPEG")

    assert _process(path) == (640, 480)


def test_process_image_dimension_guard(tmp_path: Path) -> None:
    """Images exceeding MAX_IMAGE_DIMENSION should raise ValueError."""
    path = tmp_path / "huge.jpg"
    PILImage.new("RGB", (MAX_IMAGE_DIMENSION + 1, 100)).save(path, format="JPEG")

    with pytest.raises(ValueError, match="exceed the maximum"):
        _process(path)


def test_process_image_keeps_capture_parameters_and_drops_the_rest(tmp_path: Path) -> None:
    """Stored images keep the capture parameters CV research needs, nothing else."""
    path = _make_jpeg_with_rich_exif(tmp_path / "metadata.jpg")

    _process(path)

    with PILImage.open(path) as result:
        exif = result.getexif()
        assert exif[0x0110] == "Model X"
        assert exif.get_ifd(IFD.Exif) == {0x920A: 35.0, 0x8827: 400}
        assert not exif.get_ifd(IFD.GPSInfo)
        assert 0x0131 not in exif  # Software
    # Sub-IFD tags can survive as raw bytes even when Pillow stops reporting them.
    stored = path.read_bytes()
    assert b"MAKERNOTE-SECRET" not in stored
    assert b"SERIAL123" not in stored
    assert b"SecretSoftware" not in stored


def test_process_image_normal_orientation_unchanged(tmp_path: Path) -> None:
    """Images with no orientation issue should preserve their dimensions."""
    path = _make_jpeg_with_exif(tmp_path / "normal.jpg", 400, 200, orientation=1)

    _process(path)

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


def test_generate_thumbnails_handles_extreme_aspect_ratios(tmp_path: Path) -> None:
    """A height that rounds to 0 must clamp to 1 px rather than abort the remaining widths."""
    path = tmp_path / "panorama.png"
    PILImage.new("RGB", (10000, 40), color="red").save(path, format="PNG")

    generated = generate_thumbnails(path)

    assert len(generated) == len(THUMBNAIL_WIDTHS)
    with PILImage.open(thumbnail_path_for(path, min(THUMBNAIL_WIDTHS))) as img:
        assert img.height == 1


def test_generate_thumbnails_custom_widths(large_image: Path) -> None:
    """Should respect custom width tuples."""
    generated = generate_thumbnails(large_image, widths=(300, 600))

    assert len(generated) == 2
    with PILImage.open(thumbnail_path_for(large_image, 300)) as img:
        assert img.width == 300
    with PILImage.open(thumbnail_path_for(large_image, 600)) as img:
        assert img.width == 600


def test_generate_thumbnails_resizes_non_jpeg_from_the_previous_width(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A non-JPEG resizes each width from the next larger thumbnail, not the original.

    Output sizes must match the per-width target computed from the original.
    """
    path = tmp_path / "large.png"
    PILImage.new("RGB", (3001, 1999), (40, 80, 120)).save(path, format="PNG")
    sources: list[int] = []
    original_resize = PILImage.Image.resize

    def recording_resize(self: PILImage.Image, *args: object, **kwargs: object) -> PILImage.Image:
        sources.append(self.width)
        return original_resize(self, *args, **kwargs)  # ty: ignore[invalid-argument-type]

    monkeypatch.setattr(PILImage.Image, "resize", recording_resize)

    generated = generate_thumbnails(path)

    assert generated == [thumbnail_path_for(path, w) for w in THUMBNAIL_WIDTHS]
    assert sources == [3001, *sorted(THUMBNAIL_WIDTHS, reverse=True)[:-1]]
    for w in THUMBNAIL_WIDTHS:
        with PILImage.open(thumbnail_path_for(path, w)) as img:
            assert img.size == (w, int((w / 3001) * 1999))


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


def test_multiframe_gif_without_exif_is_left_untouched(tmp_path: Path) -> None:
    """A non-JPEG with no EXIF and no rotation must not be re-encoded.

    Regression: process_image_for_storage re-saved every non-JPEG single-frame, which
    flattened animated GIFs to one frame and re-encoded lossless WebP lossily.
    """
    path = tmp_path / "animated.gif"
    frames = [PILImage.new("RGB", (48, 48), color).convert("P") for color in ((200, 0, 0), (0, 200, 0), (0, 0, 200))]
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=100, loop=0)

    before = path.read_bytes()
    _process(path)

    assert path.read_bytes() == before, "GIF was re-encoded despite needing no processing"
    with PILImage.open(path) as reopened:
        # n_frames is added by GifImagePlugin at runtime; Pillow's stub only types the
        # base ImageFile.
        assert reopened.n_frames == 3  # ty: ignore[unresolved-attribute]


_ANIMATION_COLORS = ((201, 13, 7), (11, 197, 23), (5, 19, 203))
_ANIMATION_DURATIONS = [100, 200, 300]


def _gps_exif() -> PILImage.Exif:
    exif = PILImage.Exif()
    exif[IFD.GPSInfo] = {GPS.GPSLatitudeRef: "N"}
    return exif


def _animation_frames() -> list[PILImage.Image]:
    return [PILImage.new("RGB", (48, 48), color) for color in _ANIMATION_COLORS]


def _frame_summary(path: Path) -> tuple[int, list[int], list[tuple[int, ...]]]:
    """Return the frame count, per-frame durations and per-frame corner colour."""
    with PILImage.open(path) as img:
        durations, colors = [], []
        # n_frames and seek are added by the format plugins at runtime; Pillow's stub only
        # types the base ImageFile.
        for index in range(img.n_frames):  # ty: ignore[unresolved-attribute]
            img.seek(index)
            colors.append(img.convert("RGB").getpixel((0, 0)))
            # WebP sets a frame's duration only once the frame is decoded.
            durations.append(img.info.get("duration"))
        return img.n_frames, durations, colors  # ty: ignore[unresolved-attribute]


@pytest.mark.parametrize(
    ("filename", "save_kwargs", "loop"),
    [
        # Lossless input must stay lossless, so every pixel comes back exactly.
        ("animated.webp", {"lossless": True, "exif": _gps_exif(), "xmp": b"<x:xmpmeta>GPS</x:xmpmeta>"}, 3),
        ("animated.png", {"exif": _gps_exif()}, 2),
        ("animated.gif", {"comment": b"home address"}, 0),
    ],
    ids=["webp", "apng", "gif"],
)
def test_animation_metadata_is_stripped_and_frames_kept(
    tmp_path: Path, filename: str, save_kwargs: dict[str, Any], loop: int
) -> None:
    """An animation is re-saved frame by frame without its EXIF, XMP or comment.

    Regression: animated originals were never re-saved, so GPS EXIF and XMP survived
    storage.
    """
    path = tmp_path / filename
    frames = _animation_frames()
    if path.suffix == ".gif":
        frames = [frame.convert("P") for frame in frames]
    frames[0].save(
        path, save_all=True, append_images=frames[1:], duration=_ANIMATION_DURATIONS, loop=loop, **save_kwargs
    )
    with PILImage.open(path) as before:
        assert before.getexif().get_ifd(IFD.GPSInfo) or before.info.get("comment")
    expected = _frame_summary(path)

    _process(path)

    with PILImage.open(path) as result:
        assert not result.getexif()
        assert not result.info.get("xmp")
        assert not result.info.get("comment")
        assert result.info["loop"] == loop
    assert _frame_summary(path) == expected
    assert expected[:2] == (3, _ANIMATION_DURATIONS)
    if path.suffix != ".gif":  # GIF quantizes to a palette; the others are lossless.
        assert expected[2] == list(_ANIMATION_COLORS)


def _commented_gif(path: Path) -> Path:
    """Save a three-frame 48x48 GIF (6912 pixels across frames) carrying a comment."""
    frames = [PILImage.new("RGB", (48, 48), color).convert("P") for color in _ANIMATION_COLORS]
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=100, comment=b"home address")
    return path


@pytest.mark.parametrize(("max_pixels", "refused"), [(6911, True), (6912, False)], ids=["over", "at"])
def test_animation_frame_total_cap(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, max_pixels: int, *, refused: bool
) -> None:
    """Re-saving decodes every frame, so the pixel cap applies to all frames combined."""
    monkeypatch.setattr("app.core.images.validation.MAX_IMAGE_PIXELS", max_pixels)
    path = _commented_gif(tmp_path / "animated.gif")
    before = path.read_bytes()

    if refused:
        with pytest.raises(ValueError, match="across all frames"):
            _process(path)
        assert path.read_bytes() == before
        return

    _process(path)
    with PILImage.open(path) as result:
        assert not result.info.get("comment")
        assert result.n_frames == 3  # ty: ignore[unresolved-attribute]


def test_lossless_webp_without_exif_is_left_untouched(tmp_path: Path) -> None:
    """A lossless WebP with no EXIF must be preserved byte-for-byte, not re-encoded."""
    path = tmp_path / "image.webp"
    PILImage.new("RGB", (64, 64), (10, 20, 30)).save(path, format="WEBP", lossless=True)

    before = path.read_bytes()
    _process(path)

    assert path.read_bytes() == before


def test_validate_image_dimensions_rejects_pixel_flood() -> None:
    """An image within the per-side cap but over the pixel cap must be rejected.

    9000x9000 = 81 MPx is under the per-side limit but over the total-pixel cap, so
    the decompression-bomb guard now fires before any decode.
    """
    img = PILImage.new("L", (9000, 9000))
    with pytest.raises(ValueError, match="pixels"):
        validate_image_dimensions(img)


def test_process_image_strips_gps_tags(tmp_path: Path) -> None:
    """A GPS-bearing upload must not retain location data after storage processing."""
    path = tmp_path / "gps.jpg"
    img = PILImage.new("RGB", (50, 50), (1, 2, 3))
    exif = img.getexif()
    exif.get_ifd(IFD.GPSInfo)[GPS.GPSLatitudeRef] = "N"
    img.save(path, format="JPEG", exif=exif)

    # has_exif fast path must actually detect the GPS-only EXIF payload; if it
    # didn't, the file would be left untouched below with GPS data intact.
    with PILImage.open(path) as before:
        assert bool(before.info.get("exif"))

    _process(path)

    with PILImage.open(path) as result:
        assert not result.getexif().get_ifd(IFD.GPSInfo)


def test_process_image_strips_exif_only_exposed_through_getexif(tmp_path: Path) -> None:
    """Formats whose EXIF lives outside ``info["exif"]`` (TIFF) must still be filtered."""
    path = tmp_path / "artist.tiff"
    img = PILImage.new("RGB", (20, 10))
    exif = PILImage.Exif()
    exif[0x013B] = "Jane Doe"  # Artist: personal data, not on the allowlist
    img.save(path, exif=exif)
    with PILImage.open(path) as before:
        assert not before.info.get("exif")
        assert before.getexif().get(0x013B) == "Jane Doe"

    _process(path)

    with PILImage.open(path) as result:
        assert 0x013B not in result.getexif()


# ---------------------------------------------------------------------------
# originals uploaded untouched from phones
# ---------------------------------------------------------------------------


def test_process_image_stores_an_mpo_as_its_primary_jpeg(tmp_path: Path) -> None:
    """An Ultra HDR or depth-map JPEG keeps its primary image as a plain JPEG, EXIF filtered."""
    exif = PILImage.Exif()
    exif[0x0110] = "Model X"
    exif.get_ifd(IFD.GPSInfo)[GPS.GPSLatitudeRef] = "N"
    path = tmp_path / "hdr.jpg"
    PILImage.new("RGB", (64, 48), (200, 10, 10)).save(
        path, format="MPO", save_all=True, append_images=[PILImage.new("L", (32, 24))], exif=exif.tobytes()
    )

    assert _process(path) == (64, 48)

    with PILImage.open(path) as stored:
        assert stored.format == "JPEG"
        assert getattr(stored, "n_frames", 1) == 1
        assert stored.getexif()[0x0110] == "Model X"
        assert not stored.getexif().get_ifd(IFD.GPSInfo)


def test_process_image_drops_a_jpeg_comment(tmp_path: Path) -> None:
    """A JPEG comment is free text; it does not survive storage, even with no EXIF to trigger the re-save."""
    path = tmp_path / "photo.jpg"
    PILImage.new("RGB", (40, 30)).save(path, format="JPEG", comment=b"shot at Home Street 1")
    assert b"Home Street" in path.read_bytes()

    _process(path)

    assert b"Home Street" not in path.read_bytes()


def test_process_image_keeps_the_colour_profile(tmp_path: Path) -> None:
    """A wide-gamut phone photo must keep its ICC profile, or its colours shift."""
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    path = _make_jpeg_with_exif(tmp_path / "p3.jpg", 40, 30, camera_make=True)
    with PILImage.open(path) as img:
        img.save(path, format="JPEG", exif=img.info["exif"], icc_profile=icc)

    _process(path)

    with PILImage.open(path) as stored:
        assert stored.info["icc_profile"] == icc


def test_process_image_skips_the_transpose_copy_when_upright(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Without a rotation the re-save holds one decode, not a transposed second copy."""
    path = _make_jpeg_with_exif(tmp_path / "upright.jpg", 40, 30, orientation=1, camera_make=True)

    def _fail(_img: object) -> None:
        raise AssertionError

    monkeypatch.setattr("app.core.images.exif.ImageOps.exif_transpose", _fail)

    assert _process(path) == (40, 30)


# ---------------------------------------------------------------------------
# metadata outside EXIF: PNG text chunks, eXIf and XMP
# ---------------------------------------------------------------------------

_XMP_PACKET = b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><exif:GPSLatitude>52,9.6N</exif:GPSLatitude></x:xmpmeta>'


def _allowlisted_and_personal_exif(orientation: int | None = None) -> PILImage.Exif:
    exif = PILImage.Exif()
    exif[0x0110] = "Model X"  # Model (preserved)
    exif[0x013B] = "Jane Doe"  # Artist (dropped)
    if orientation is not None:
        exif[0x0112] = orientation
    return exif


def _xmp_kwargs(image_format: str) -> dict[str, object]:
    """Pillow's PNG writer has no ``xmp`` option; PNG carries XMP in an iTXt chunk."""
    if image_format != "PNG":
        return {"xmp": _XMP_PACKET}
    info = PngImagePlugin.PngInfo()
    info.add_itxt("XML:com.adobe.xmp", _XMP_PACKET.decode())
    return {"pnginfo": info}


def test_process_image_drops_png_text_chunks(tmp_path: Path) -> None:
    """tEXt, iTXt and zTXt chunks are free text under any keyword; none survive storage."""
    info = PngImagePlugin.PngInfo()
    info.add_text("Comment", "shot at Home Street 1")
    info.add_itxt("Author", "Jane Doe")
    info.add_text("Location", "Secret Place", zip=True)
    path = tmp_path / "text.png"
    PILImage.new("RGB", (40, 30)).save(path, pnginfo=info)
    with PILImage.open(path) as before:
        assert before.info.keys() >= {"Comment", "Author", "Location"}

    _process(path)

    stored = path.read_bytes()
    assert b"Home Street" not in stored
    assert b"Jane Doe" not in stored
    with PILImage.open(path) as result:
        assert not result.info.keys() & {"Comment", "Author", "Location"}


@pytest.mark.parametrize("image_format", ["PNG", "WEBP", "JPEG"])
def test_process_image_drops_xmp_and_keeps_the_exif_allowlist(tmp_path: Path, image_format: str) -> None:
    """XMP repeats GPS in every format; it goes while the allowlisted EXIF stays."""
    path = tmp_path / f"xmp.{image_format.lower()}"
    PILImage.new("RGB", (40, 30)).save(
        path, format=image_format, exif=_allowlisted_and_personal_exif(), **_xmp_kwargs(image_format)
    )
    assert b"GPSLatitude" in path.read_bytes()

    _process(path)

    stored = path.read_bytes()
    assert b"GPSLatitude" not in stored
    assert b"Jane Doe" not in stored
    with PILImage.open(path) as result:
        assert result.format == image_format
        assert result.getexif()[0x0110] == "Model X"


@pytest.mark.parametrize("image_format", ["PNG", "WEBP", "JPEG"])
def test_process_image_xmp_alone_triggers_the_strip(tmp_path: Path, image_format: str) -> None:
    """With no EXIF at all, an XMP packet on its own still has to be removed."""
    path = tmp_path / f"xmp_only.{image_format.lower()}"
    PILImage.new("RGB", (40, 30)).save(path, format=image_format, **_xmp_kwargs(image_format))
    assert b"GPSLatitude" in path.read_bytes()

    _process(path)

    assert b"GPSLatitude" not in path.read_bytes()


@pytest.mark.parametrize("image_format", ["PNG", "WEBP", "JPEG"])
def test_process_image_rotates_and_filters_exif(tmp_path: Path, image_format: str) -> None:
    """JPEG EXIF, a PNG eXIf chunk and a WebP EXIF chunk get the same allowlist and rotation.

    The orientation is baked into the pixels and its tag is not written back with the
    allowlisted ones, or the next open would rotate the image twice.
    """
    path = tmp_path / f"rotated.{image_format.lower()}"
    PILImage.new("RGB", (40, 60)).save(
        path, format=image_format, exif=_allowlisted_and_personal_exif(orientation=6), lossless=True
    )

    assert _process(path) == (60, 40)

    assert b"Jane Doe" not in path.read_bytes()
    with PILImage.open(path) as result:
        assert result.size == (60, 40)
        exif = result.getexif()
        assert 0x0112 not in exif
        assert exif[0x0110] == "Model X"


def test_process_image_rewrites_an_upload_file_object_in_place() -> None:
    """Uploads are stripped as file objects, before any storage backend sees them."""
    upload = io.BytesIO()
    PILImage.new("RGB", (40, 60)).save(
        upload, format="JPEG", xmp=_XMP_PACKET, exif=_allowlisted_and_personal_exif(orientation=6)
    )

    assert process_image_for_storage(upload) == (60, 40)

    stored = upload.getvalue()
    assert b"GPSLatitude" not in stored
    assert b"Jane Doe" not in stored
    upload.seek(0)
    with PILImage.open(upload) as result:
        assert result.size == (60, 40)
        assert result.getexif()[0x0110] == "Model X"
