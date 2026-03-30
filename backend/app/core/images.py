"""Image processing utilities using Pillow."""
# spell-checker: ignore getexif, LANCZOS

from __future__ import annotations

import contextlib
import io
import logging
from typing import TYPE_CHECKING

import piexif
from PIL import Image as PILImage
from PIL import ImageOps, UnidentifiedImageError

if TYPE_CHECKING:
    from pathlib import Path
    from typing import Any, BinaryIO

    from fastapi import UploadFile

try:
    from PIL.Image import Resampling

    RESAMPLE_FILTER = Resampling.LANCZOS
except ImportError, AttributeError:
    # Fallback for older versions of Pillow
    RESAMPLE_FILTER = getattr(PILImage, "LANCZOS", getattr(PILImage, "ANTIALIAS", 1))

logger = logging.getLogger(__name__)

FORMAT_JPEG = "JPEG"
FORMAT_WEBP = "WEBP"
MAX_IMAGE_DIMENSION = 8000
ALLOWED_IMAGE_MIME_TYPES: frozenset[str] = frozenset(
    {
        "image/bmp",
        "image/gif",
        "image/jpeg",
        "image/png",
        "image/tiff",
        "image/webp",
    }
)

# EXIF tag IDs that are privacy-sensitive and should be stripped on upload.
# Technical metadata (Make, Model, exposure settings) is intentionally preserved.
_SENSITIVE_EXIF_TAGS: frozenset[int] = frozenset(
    {
        0x8825,  # GPSInfo: GPS IFD pointer and sub-IFD are fully removed
        0x927C,  # MakerNote (device-specific, can contain serial numbers)
        0xA430,  # CameraOwnerName
        0xA431,  # BodySerialNumber
        0xA435,  # LensSerialNumber
        0x013B,  # Artist
        0xA420,  # ImageUniqueID
    }
)

_EXIF_ORIENTATION_TAG = 0x0112


def _clean_exif_bytes(exif_bytes: bytes) -> bytes | None:
    """Return cleaned EXIF bytes with sensitive tags removed, or None on failure.

    This extracts the piexif logic so callers can reuse it and keep
    `process_image_for_storage` simpler and easier to lint.
    """
    try:
        exif_dict = piexif.load(exif_bytes)
    except ValueError, OSError, TypeError:
        return None

    for tag_id in _SENSITIVE_EXIF_TAGS | {_EXIF_ORIENTATION_TAG}:
        for ifd in ("0th", "Exif", "GPS", "1st"):
            exif_dict.get(ifd, {}).pop(tag_id, None)

    exif_dict.pop("GPS", None)

    try:
        return piexif.dump(exif_dict)
    except ValueError, OSError:
        return None


def _get_exif_orientation(exif_bytes: bytes) -> int | None:
    """Return the EXIF orientation tag value, or None if absent or unreadable."""
    try:
        exif_dict = piexif.load(exif_bytes)
        return exif_dict.get("0th", {}).get(_EXIF_ORIENTATION_TAG)
    except ValueError, OSError, TypeError:
        return None


def validate_image_dimensions(img: PILImage.Image, max_dimension: int = MAX_IMAGE_DIMENSION) -> None:
    """Raise ValueError if either image dimension exceeds the maximum allowed.

    Args:
        img: Pillow image object to validate.
        max_dimension: Maximum allowed width or height in pixels.

    Raises:
        ValueError: If width or height exceeds max_dimension.
    """
    width, height = img.size
    if width > max_dimension or height > max_dimension:
        msg = f"Image dimensions {width}x{height} exceed the maximum allowed {max_dimension}px per side."
        raise ValueError(msg)


def validate_image_mime_type(file: UploadFile | None) -> UploadFile | None:
    """Validate the uploaded image MIME type."""
    if file is None:
        return file
    if file.content_type not in ALLOWED_IMAGE_MIME_TYPES:
        allowed_types = ", ".join(sorted(ALLOWED_IMAGE_MIME_TYPES))
        msg = f"Invalid file type: {file.content_type}. Allowed types: {allowed_types}"
        raise ValueError(msg)
    return file


def validate_image_file(file: BinaryIO) -> None:
    """Validate that a binary file contains a supported image."""
    file.seek(0)
    try:
        with PILImage.open(file) as image_file:
            image_file.verify()
    except (AttributeError, OSError, TypeError, UnidentifiedImageError) as e:
        msg = "Invalid image file"
        raise ValueError(msg) from e
    finally:
        file.seek(0)


def apply_exif_orientation(img: PILImage.Image) -> PILImage.Image:
    """Rotate/flip image pixels to match EXIF orientation, returning the corrected image.

    After calling this function, the orientation is baked into the pixel data.
    The EXIF orientation tag (0x0112) should be stripped before saving to avoid
    double rotation by other software.

    Args:
        img: Pillow image object to correct.

    Returns:
        Corrected image (may be the same object if orientation was 1 or absent).
    """
    # Use Pillow's built-in EXIF-aware transpose helper which is robust
    # and maintained upstream. Falls back to returning the original image
    # if anything goes wrong.
    try:
        return ImageOps.exif_transpose(img)
    except AttributeError, ValueError, OSError, TypeError:
        return img


def strip_sensitive_exif(img: PILImage.Image) -> None:
    """Remove privacy-sensitive EXIF tags in-place from a Pillow image object.

    Strips GPS coordinates, camera/lens serial numbers, and owner identifiers.
    Preserves technical metadata: Make, Model, exposure settings, focal length, etc.
    Also removes the orientation tag since callers should apply orientation before stripping.

    Args:
        img: Pillow image object to mutate.
    """
    # Keep this function focused and deterministic: operate on EXIF bytes
    # using piexif when available. If no EXIF bytes are present or piexif
    # fails, do nothing. This reduces brittle in-memory mutations.
    exif_bytes = img.info.get("exif")
    if not exif_bytes:
        try:
            exif_bytes = img.getexif().tobytes()
        except AttributeError, ValueError, OSError, TypeError:
            exif_bytes = None

    if not exif_bytes:
        return

    cleaned = _clean_exif_bytes(exif_bytes)
    if not cleaned:
        return

    img.info["exif"] = cleaned

    # Also mutate Pillow's in-memory Exif mapping so callers that inspect
    # `img.getexif()` observe the removed tags immediately (useful for
    # tests and in-memory flows). This is best-effort and should not raise.
    with contextlib.suppress(AttributeError, KeyError, ValueError, OSError):
        exif = img.getexif()
        for tag_id in _SENSITIVE_EXIF_TAGS | {_EXIF_ORIENTATION_TAG}:
            exif.pop(tag_id, None)


def process_image_for_storage(image_path: Path) -> None:
    """Process an uploaded image in-place: validate dimensions, apply EXIF orientation, strip sensitive metadata.

    This is CPU-bound and must be called via anyio.to_thread.run_sync in async contexts.

    Processing steps:
    1. Validate dimensions against MAX_IMAGE_DIMENSION to guard against memory exhaustion.
    2. Extract and clean EXIF: fully remove GPS IFD, sensitive identifiers, and orientation tag.
    3. JPEG fast path: if no rotation is needed, losslessly splice cleaned EXIF bytes using
       piexif.insert(); no pixel re-encoding, no quality loss.
       Slow path: rotation needed or non-JPEG format; decode pixels, apply orientation via
       ImageOps.exif_transpose(), then re-encode with cleaned EXIF attached.

    Args:
        image_path: Path to the image file to process in-place.

    Raises:
        FileNotFoundError: If the image file does not exist.
        ValueError: If image dimensions exceed MAX_IMAGE_DIMENSION.
    """
    with PILImage.open(image_path) as img:
        original_format = img.format or FORMAT_JPEG
        validate_image_dimensions(img)

        exif_bytes: bytes | None = img.info.get("exif") or None
        if not exif_bytes:
            with contextlib.suppress(AttributeError, ValueError, OSError, TypeError):
                raw = img.getexif().tobytes()
                exif_bytes = raw or None

        cleaned_exif_bytes = _clean_exif_bytes(exif_bytes) if exif_bytes else None
        orientation = _get_exif_orientation(exif_bytes) if exif_bytes else None

        needs_rotation = orientation not in (None, 1)
        if needs_rotation or original_format != FORMAT_JPEG:
            try:
                processed: PILImage.Image | None = ImageOps.exif_transpose(img)
            except AttributeError, ValueError, OSError, TypeError:
                processed = img
            processed = processed.copy()
        else:
            processed = None
    # File handle is now closed.

    # JPEG fast path: losslessly splice cleaned EXIF without pixel re-encoding
    if processed is None:
        if not exif_bytes:
            # No EXIF at all; file is already clean.
            return
        if cleaned_exif_bytes is not None:
            piexif.insert(cleaned_exif_bytes, str(image_path))
            return
        # EXIF parsing failed; fall through to re-encode, which saves without EXIF.
        with PILImage.open(image_path) as img:
            processed = img.copy()

    # Slow path: save re-encoded pixels with cleaned EXIF
    save_kwargs: dict[str, Any] = {"format": original_format}
    if original_format == FORMAT_JPEG:
        save_kwargs.update({"quality": 95, "optimize": True})
    if cleaned_exif_bytes:
        save_kwargs["exif"] = cleaned_exif_bytes

    processed.save(image_path, **save_kwargs)


def resize_image(image_path: Path, width: int | None = None, height: int | None = None) -> bytes:
    """Resize an image while maintaining aspect ratio, returning WebP bytes.

    WebP provides better compression than JPEG/PNG at equivalent visual quality,
    making it well-suited for network-served thumbnails.

    Args:
        image_path: Path to the source image file.
        width: Target width in pixels.
        height: Target height in pixels.

    Returns:
        WebP-encoded bytes of the resized image.

    Raises:
        FileNotFoundError: If the image path does not exist.
    """
    with PILImage.open(image_path) as img:
        current_width, current_height = img.size
        if width and not height:
            height = int((width / current_width) * current_height)
        elif height and not width:
            width = int((height / current_height) * current_width)
        elif not width and not height:
            width, height = current_width, current_height

        final_width: int = width or current_width
        final_height: int = height or current_height

        resized = img.resize((final_width, final_height), RESAMPLE_FILTER)

        buf = io.BytesIO()
        resized.save(buf, format=FORMAT_WEBP, quality=85, method=6)
        return buf.getvalue()
