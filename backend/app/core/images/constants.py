"""Shared constants for image validation and processing."""

from PIL import Image as PILImage
from PIL.Image import Resampling

__all__ = [
    "ALLOWED_IMAGE_MIME_TYPES",
    "FORMAT_JPEG",
    "FORMAT_MPO",
    "FORMAT_WEBP",
    "MAX_IMAGE_DIMENSION",
    "MAX_IMAGE_PIXELS",
    "PRESERVED_EXIF_TAGS",
    "RESAMPLE_FILTER",
    "RESIZE_REDUCING_GAP",
    "THUMBNAIL_WIDTHS",
    "WEBP_ENCODE_METHOD",
    "_EXIF_ORIENTATION_TAG",
]


FORMAT_JPEG = "JPEG"
FORMAT_MPO = "MPO"
FORMAT_WEBP = "WEBP"
# Long side of the largest sensors under the pixel cap below: 45 MP full-frame bodies
# are 8192 or 8256 px wide, a 50 MP one 8640 px. The pixel cap is what bounds memory.
MAX_IMAGE_DIMENSION = 10_000
# Total-pixel ceiling for every tier, sized for 48 MP phone modes and 45 MP cameras; the
# per-role caps in settings (app.api.auth.roles) sit at or under it. The per-side cap
# alone allows 100 MPx, past Pillow's own 89 MPx bomb guard, which is enough to OOM the
# worker, so Pillow's guard is lowered to match. A decoded 50 MPx RGB image is 150 MB,
# and the storage re-save holds two of them (source and rotated copy).
MAX_IMAGE_PIXELS = 50_000_000
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
THUMBNAIL_WIDTHS: tuple[int, ...] = (200, 800, 1600, 2560)
# Pillow pre-reduces by an integer factor before the resample filter runs whenever the
# source is at least this many times the target. It costs a box-filter pass and saves a
# much larger LANCZOS one; 2.0 is Pillow's own default for `thumbnail`.
RESIZE_REDUCING_GAP = 2.0
# libwebp effort, 0 (fastest) to 6 (smallest). 6 costs 1.8x the encode time of 4
# for 3% smaller thumbnails, paid on every upload. Measured on a 12MP JPEG: at the
# 1600px width, method 4 encodes in 163 ms and method 2 in 97 ms, for 0.4% more
# bytes (1024 KB -> 1028 KB). The 66 ms is worth more than the 4 KB.
WEBP_ENCODE_METHOD = 2

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
