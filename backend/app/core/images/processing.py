"""Image processing helpers for originals and ad-hoc resized bytes."""

import contextlib
from typing import TYPE_CHECKING

from PIL import Image as PILImage
from PIL import ImageOps

from .constants import FORMAT_JPEG, FORMAT_WEBP
from .exif import get_exif_orientation, strip_sensitive_exif
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

        is_multiframe = getattr(img, "n_frames", 1) > 1
        orientation = get_exif_orientation(img) if has_exif else None
        needs_rotation = orientation not in (None, 1)
        # Re-save only to apply rotation or strip EXIF. The old code also re-saved
        # every non-JPEG unconditionally, which flattened animated GIFs to one frame
        # and re-encoded lossless WebP lossily even when the file carried no EXIF and
        # needed no rotation — destroying the original in place for nothing.
        # ponytail: animated originals are never re-saved, even when they carry EXIF —
        # exif_transpose only has a first-frame view, so "fixing" one frame would
        # flatten the rest. Animations with EXIF orientation/PII are rare; skip
        # rotation/stripping for them rather than destroying the animation to apply it.
        if (has_exif or needs_rotation) and not is_multiframe:
            try:
                processed: PILImage.Image | None = ImageOps.exif_transpose(img)
            except AttributeError, ValueError, OSError, TypeError:
                processed = img
            processed = processed.copy()
            # Explicit strip, not just reliance on omitting `exif=` from save_kwargs below —
            # that omission is incidental to the current save path, not a documented guarantee.
            strip_sensitive_exif(processed)
        else:
            processed = None

    if processed is None:
        return

    save_kwargs: dict[str, Any] = {"format": original_format}
    if original_format == FORMAT_JPEG:
        save_kwargs.update({"quality": 95, "optimize": True})
    elif original_format == FORMAT_WEBP:
        # Avoid a second lossy generation on a WebP we are only re-saving to strip
        # metadata; lossless keeps the pixels exact.
        save_kwargs["lossless"] = True

    processed.save(image_path, **save_kwargs)
