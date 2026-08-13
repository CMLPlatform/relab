"""Shared constants for image validation and processing."""

from PIL import Image as PILImage
from PIL.Image import Resampling

__all__ = [
    "ALLOWED_IMAGE_MIME_TYPES",
    "FORMAT_JPEG",
    "FORMAT_WEBP",
    "MAX_IMAGE_DIMENSION",
    "MAX_IMAGE_PIXELS",
    "RESAMPLE_FILTER",
    "THUMBNAIL_WIDTHS",
    "_EXIF_ORIENTATION_TAG",
    "_PRESERVED_EXIF_TAGS",
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

# Capture parameters worth keeping for computer-vision research. This is an allowlist,
# not a denylist: vendor MakerNote blocks are undocumented and carry serial numbers and
# face-detection data, so anything not named here is dropped.
_PRESERVED_EXIF_TAGS: frozenset[int] = frozenset(
    {
        0x010F,  # Make
        0x0110,  # Model
        0xA434,  # LensModel
        0x920A,  # FocalLength
        0xA405,  # FocalLengthIn35mmFilm
        0x829D,  # FNumber
        0x829A,  # ExposureTime
        0x8827,  # ISOSpeedRatings
        0xA403,  # WhiteBalance
        0x9209,  # Flash
        0xA001,  # ColorSpace
        0x9003,  # DateTimeOriginal
    }
)
# Deliberately absent from the allowlist: callers bake orientation into the pixels with
# exif_transpose, so writing the tag back would double-rotate on the next open.
_EXIF_ORIENTATION_TAG = 0x0112

RESAMPLE_FILTER = Resampling.LANCZOS
