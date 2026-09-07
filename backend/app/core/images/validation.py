"""Validation helpers for uploaded and stored images."""

from typing import TYPE_CHECKING

from PIL import Image as PILImage
from PIL import UnidentifiedImageError

from .constants import ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS

if TYPE_CHECKING:
    from typing import BinaryIO

    from fastapi import UploadFile


def validate_image_dimensions(
    img: PILImage.Image,
    max_dimension: int = MAX_IMAGE_DIMENSION,
    max_pixels: int = MAX_IMAGE_PIXELS,
) -> None:
    """Raise ValueError if the image exceeds the per-side or total-pixel limit.

    The total-pixel check runs on ``img.size``, available after ``open`` without a full
    decode, so it rejects a decompression bomb before any operation that would decode it.
    """
    width, height = img.size
    if width > max_dimension or height > max_dimension:
        msg = f"Image dimensions {width}x{height} exceed the maximum allowed {max_dimension}px per side."
        raise ValueError(msg)
    if width * height > max_pixels:
        msg = f"Image has {width * height} pixels, exceeding the maximum allowed {max_pixels}."
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
    except (AttributeError, OSError, TypeError, UnidentifiedImageError) as exc:
        err_msg = "Invalid image file"
        raise ValueError(err_msg) from exc
    finally:
        file.seek(0)
