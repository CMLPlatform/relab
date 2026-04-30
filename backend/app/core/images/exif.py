"""EXIF cleaning and orientation helpers."""
# spell-checker: ignore getexif

from __future__ import annotations

from PIL import Image as PILImage
from PIL import ImageOps

from .constants import _EXIF_ORIENTATION_TAG, _SENSITIVE_EXIF_TAGS


def get_exif_orientation(img: PILImage.Image) -> int | None:
    """Return the EXIF orientation tag value, or None if absent or unreadable."""
    try:
        orientation = img.getexif().get(_EXIF_ORIENTATION_TAG)
    except AttributeError, ValueError, OSError, TypeError:
        return None
    return orientation if isinstance(orientation, int) else None


def apply_exif_orientation(img: PILImage.Image) -> PILImage.Image:
    """Rotate or flip image pixels to match EXIF orientation."""
    try:
        return ImageOps.exif_transpose(img)
    except AttributeError, ValueError, OSError, TypeError:
        return img


def strip_sensitive_exif(img: PILImage.Image) -> None:
    """Remove privacy-sensitive EXIF tags in-place from a Pillow image object."""
    img.info.pop("exif", None)
    try:
        exif = img.getexif()
    except AttributeError, ValueError, OSError, TypeError:
        return

    for tag_id in _SENSITIVE_EXIF_TAGS | {_EXIF_ORIENTATION_TAG}:
        exif.pop(tag_id, None)
