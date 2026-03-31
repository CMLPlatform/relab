"""Shared constants for image validation and processing."""

from __future__ import annotations

from PIL import Image as PILImage

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
THUMBNAIL_WIDTHS: tuple[int, ...] = (200, 800, 1600)

_SENSITIVE_EXIF_TAGS: frozenset[int] = frozenset(
    {
        0x8825,
        0x927C,
        0xA430,
        0xA431,
        0xA435,
        0x013B,
        0xA420,
    }
)
_EXIF_ORIENTATION_TAG = 0x0112

try:
    from PIL.Image import Resampling

    RESAMPLE_FILTER = Resampling.LANCZOS
except ImportError, AttributeError:
    RESAMPLE_FILTER = getattr(PILImage, "LANCZOS", getattr(PILImage, "ANTIALIAS", 1))
