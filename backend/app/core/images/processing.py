"""Image processing helpers for originals and ad-hoc resized bytes."""
# spell-checker: ignore getexif

from __future__ import annotations

import contextlib
import io
from typing import TYPE_CHECKING

from PIL import Image as PILImage
from PIL import ImageOps

from .constants import FORMAT_JPEG, FORMAT_WEBP, RESAMPLE_FILTER
from .exif import get_exif_orientation
from .validation import validate_image_dimensions

if TYPE_CHECKING:
    from os import PathLike
    from typing import Any


def process_image_for_storage(image_path: PathLike[str]) -> None:
    """Process an uploaded image in-place for storage."""
    with PILImage.open(image_path) as img:
        original_format = img.format or FORMAT_JPEG
        validate_image_dimensions(img)

        has_exif = bool(img.info.get("exif"))
        if not has_exif:
            with contextlib.suppress(AttributeError, ValueError, OSError, TypeError):
                has_exif = bool(img.getexif())

        orientation = get_exif_orientation(img) if has_exif else None
        needs_rotation = orientation not in (None, 1)
        if has_exif or needs_rotation or original_format != FORMAT_JPEG:
            try:
                processed: PILImage.Image | None = ImageOps.exif_transpose(img)
            except AttributeError, ValueError, OSError, TypeError:
                processed = img
            processed = processed.copy()
        else:
            processed = None

    if processed is None:
        return

    save_kwargs: dict[str, Any] = {"format": original_format}
    if original_format == FORMAT_JPEG:
        save_kwargs.update({"quality": 95, "optimize": True})

    processed.save(image_path, **save_kwargs)


def resize_image(image_path: PathLike[str], width: int | None = None, height: int | None = None) -> bytes:
    """Resize an image while maintaining aspect ratio, returning WebP bytes."""
    with PILImage.open(image_path) as img:
        current_width, current_height = img.size
        if width and not height:
            height = int((width / current_width) * current_height)
        elif height and not width:
            width = int((height / current_height) * current_width)
        elif not width and not height:
            width, height = current_width, current_height

        final_width = width or current_width
        final_height = height or current_height

        resized = img.resize((final_width, final_height), RESAMPLE_FILTER)

        buf = io.BytesIO()
        resized.save(buf, format=FORMAT_WEBP, quality=85, method=6)
        return buf.getvalue()
