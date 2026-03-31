"""EXIF cleaning and orientation helpers."""

from __future__ import annotations

import contextlib

import piexif
from PIL import Image as PILImage
from PIL import ImageOps

from .constants import _EXIF_ORIENTATION_TAG, _SENSITIVE_EXIF_TAGS


def _clean_exif_bytes(exif_bytes: bytes) -> bytes | None:
    """Return cleaned EXIF bytes with sensitive tags removed, or None on failure."""
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


def apply_exif_orientation(img: PILImage.Image) -> PILImage.Image:
    """Rotate or flip image pixels to match EXIF orientation."""
    try:
        return ImageOps.exif_transpose(img)
    except AttributeError, ValueError, OSError, TypeError:
        return img


def strip_sensitive_exif(img: PILImage.Image) -> None:
    """Remove privacy-sensitive EXIF tags in-place from a Pillow image object."""
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

    with contextlib.suppress(AttributeError, KeyError, ValueError, OSError):
        exif = img.getexif()
        for tag_id in _SENSITIVE_EXIF_TAGS | {_EXIF_ORIENTATION_TAG}:
            exif.pop(tag_id, None)
