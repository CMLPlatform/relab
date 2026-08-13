"""Image processing helpers for originals and ad-hoc resized bytes."""

import contextlib
from typing import TYPE_CHECKING

from PIL import Image as PILImage
from PIL import ImageOps

from .constants import FORMAT_JPEG, FORMAT_WEBP
from .exif import filter_exif, get_exif_orientation
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
        preserved_exif = b""
        # Re-save only to apply rotation or filter EXIF. The old code also re-saved
        # every non-JPEG unconditionally, which flattened animated GIFs to one frame
        # and re-encoded lossless WebP lossily even when the file carried no EXIF and
        # needed no rotation — destroying the original in place for nothing.
        # NOTE: animated originals are never re-saved, even when they carry EXIF —
        # exif_transpose only has a first-frame view, so "fixing" one frame would
        # flatten the rest. Animations with EXIF orientation/PII are rare; skip
        # rotation/stripping for them rather than destroying the animation to apply it.
        if (has_exif or needs_rotation) and not is_multiframe:
            # Read the allowlisted tags off the original, before exif_transpose rewrites them.
            allowlisted = filter_exif(img)
            preserved_exif = allowlisted.tobytes() if allowlisted else b""
            try:
                processed: PILImage.Image | None = ImageOps.exif_transpose(img)
            except AttributeError, ValueError, OSError, TypeError:
                processed = img
            processed = processed.copy()
        else:
            processed = None

    if processed is None:
        return

    # Only the allowlisted tags are written back; everything else the original carried —
    # GPS, MakerNote, serial numbers — is gone because it was never copied into this blob.
    save_kwargs: dict[str, Any] = {"format": original_format, "exif": preserved_exif}
    if original_format == FORMAT_JPEG:
        save_kwargs.update({"quality": 95, "optimize": True})
    elif original_format == FORMAT_WEBP:
        # Avoid a second lossy generation on a WebP we are only re-saving to strip
        # metadata; lossless keeps the pixels exact.
        save_kwargs["lossless"] = True

    processed.save(image_path, **save_kwargs)
