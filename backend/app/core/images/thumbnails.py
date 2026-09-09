"""Thumbnail helpers for stored images."""

import logging
from typing import TYPE_CHECKING

from PIL import Image as PILImage

from .constants import FORMAT_WEBP, RESAMPLE_FILTER, THUMBNAIL_WIDTHS, WEBP_ENCODE_METHOD

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger(__name__)

# The filename infix that marks a generated thumbnail, so a scan over the storage
# directory can tell derivatives from the originals they were made from.
THUMBNAIL_INFIX = "_thumb_"


def thumbnail_path_for(image_path: Path, width: int) -> Path:
    """Return the expected filesystem path for a pre-computed thumbnail."""
    return image_path.parent / f"{image_path.stem}{THUMBNAIL_INFIX}{width}.webp"


def generate_thumbnails(image_path: Path, widths: tuple[int, ...] = THUMBNAIL_WIDTHS) -> list[Path]:
    """Pre-compute WebP thumbnails at standard widths for a stored image."""
    generated: list[Path] = []
    with PILImage.open(image_path) as img:
        original_width, original_height = img.size
        for width in widths:
            if width >= original_width:
                continue
            height = int((width / original_width) * original_height)
            resized = img.resize((width, height), RESAMPLE_FILTER)
            destination = thumbnail_path_for(image_path, width)
            resized.save(destination, format=FORMAT_WEBP, quality=85, method=WEBP_ENCODE_METHOD)
            generated.append(destination)
            logger.debug("Generated thumbnail %s (%dx%d)", destination.name, width, height)
    return generated


def delete_thumbnails(image_path: Path, widths: tuple[int, ...] = THUMBNAIL_WIDTHS) -> None:
    """Remove all pre-computed thumbnails for an image."""
    for width in widths:
        thumbnail = thumbnail_path_for(image_path, width)
        if thumbnail.exists():
            thumbnail.unlink()
