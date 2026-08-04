"""Shared constants for image validation and processing."""

from PIL import Image as PILImage

__all__ = [
    "ALLOWED_IMAGE_MIME_TYPES",
    "FORMAT_JPEG",
    "FORMAT_WEBP",
    "MAX_IMAGE_DIMENSION",
    "MAX_IMAGE_PIXELS",
    "RESAMPLE_FILTER",
    "THUMBNAIL_WIDTHS",
    "_EXIF_ORIENTATION_TAG",
    "_SENSITIVE_EXIF_TAGS",
]


FORMAT_JPEG = "JPEG"
FORMAT_WEBP = "WEBP"
MAX_IMAGE_DIMENSION = 8000
# Total-pixel ceiling, independent of the per-side cap. 8000x8000 = 64 MPx sits
# below Pillow's default decompression-bomb guard (89 MPx), so a crafted image
# that is within the per-side limit still decodes to a huge bitmap and can OOM the
# worker during post-write processing/thumbnailing. Cap the pixel count directly
# and lower Pillow's own guard to match, so the check also covers those opens.
MAX_IMAGE_PIXELS = 30_000_000
PILImage.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
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
