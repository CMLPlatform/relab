"""Thumbnail helpers for stored images."""

import logging
from typing import TYPE_CHECKING

from PIL import Image as PILImage

from .constants import (
    FORMAT_JPEG,
    FORMAT_WEBP,
    RESAMPLE_FILTER,
    RESIZE_REDUCING_GAP,
    THUMBNAIL_WIDTHS,
    WEBP_ENCODE_METHOD,
)
from .exif import apply_exif_orientation, display_size, get_exif_orientation

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger(__name__)

# The filename infix that marks a generated thumbnail, so a scan over the storage
# directory can tell derivatives from the originals they were made from.
THUMBNAIL_INFIX = "_thumb_"


def thumbnail_path_for(image_path: Path, width: int) -> Path:
    """Return the expected filesystem path for a pre-computed thumbnail."""
    return image_path.parent / f"{image_path.stem}{THUMBNAIL_INFIX}{width}.webp"


def _write_thumbnail(img: PILImage.Image, image_path: Path, width: int, height: int) -> Path:
    """Resize the upright *img* to (width, height) and write it as WebP beside the original."""
    resized = img.resize((width, height), RESAMPLE_FILTER, reducing_gap=RESIZE_REDUCING_GAP)
    destination = thumbnail_path_for(image_path, width)
    resized.save(destination, format=FORMAT_WEBP, quality=85, method=WEBP_ENCODE_METHOD)
    logger.debug("Generated thumbnail %s (%dx%d)", destination.name, width, height)
    return destination


def generate_thumbnails(image_path: Path, widths: tuple[int, ...] = THUMBNAIL_WIDTHS) -> list[Path]:
    """Pre-compute WebP thumbnails at standard widths for a stored image.

    JPEG originals are re-opened per width so ``draft`` can scale them down in the
    DCT domain, which decodes a fraction of the pixels the full image holds. Every
    other format decodes once and resizes from that: ``draft`` is a JPEG-only
    facility, and re-opening a PNG would pay a full decode per width for nothing.

    Widths are of the image as it displays: the EXIF orientation a JPEG original keeps
    is applied before resizing, and the WebP output carries no EXIF.
    """
    with PILImage.open(image_path) as probe:
        original_width, original_height = display_size(probe)
        quarter_turned = (original_width, original_height) != probe.size
        # Skipping the no-op keeps the non-JPEG path from copying a full-size decode.
        oriented = get_exif_orientation(probe) not in (None, 1)
        drafts = probe.format == FORMAT_JPEG

    targets = [(width, int((width / original_width) * original_height)) for width in widths if width < original_width]
    if not targets:
        return []

    if not drafts:
        with PILImage.open(image_path) as img:
            upright = apply_exif_orientation(img) if oriented else img
            return [_write_thumbnail(upright, image_path, width, height) for width, height in targets]

    generated: list[Path] = []
    for width, height in targets:
        with PILImage.open(image_path) as img:
            # Picks the largest DCT scale that still covers the target, so the LANCZOS
            # pass below runs on a much smaller source without changing its output size.
            # The request is in stored layout, before the orientation turns it.
            img.draft("RGB", (height, width) if quarter_turned else (width, height))
            generated.append(_write_thumbnail(apply_exif_orientation(img), image_path, width, height))
    return generated


def delete_thumbnails(image_path: Path, widths: tuple[int, ...] = THUMBNAIL_WIDTHS) -> None:
    """Remove all pre-computed thumbnails for an image."""
    for width in widths:
        thumbnail = thumbnail_path_for(image_path, width)
        if thumbnail.exists():
            thumbnail.unlink()
