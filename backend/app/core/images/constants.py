"""Shared constants for image validation and processing."""

from PIL import Image as PILImage
from PIL.Image import Resampling

__all__ = [
    "ALLOWED_IMAGE_MIME_TYPES",
    "FORMAT_JPEG",
    "FORMAT_WEBP",
    "MAX_IMAGE_DIMENSION",
    "MAX_IMAGE_PIXELS",
    "PRESERVED_EXIF_TAGS",
    "RESAMPLE_FILTER",
    "THUMBNAIL_WIDTHS",
    "WEBP_ENCODE_METHOD",
    "_EXIF_ORIENTATION_TAG",
]


FORMAT_JPEG = "JPEG"
FORMAT_WEBP = "WEBP"
MAX_IMAGE_DIMENSION = 8000
# Total-pixel ceiling. The per-side cap allows 8000x8000 = 64 MPx, under Pillow's
# 89 MPx bomb guard, which can OOM the worker during thumbnailing. Pillow's guard
# is lowered to match.
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
# libwebp effort, 0 (fastest) to 6 (smallest). 6 costs 1.8x the encode time of 4
# for 3% smaller thumbnails, paid on every upload.
WEBP_ENCODE_METHOD = 4

# Allowlist of capture parameters kept for computer-vision research. Vendor MakerNote
# blocks carry serial numbers and face-detection data, so anything unnamed is dropped.
PRESERVED_EXIF_TAGS: frozenset[int] = frozenset(
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
# Not in the allowlist: exif_transpose bakes orientation into the pixels, so writing
# the tag back would double-rotate on the next open.
_EXIF_ORIENTATION_TAG = 0x0112

RESAMPLE_FILTER = Resampling.LANCZOS
