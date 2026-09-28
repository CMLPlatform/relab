"""Image processing helpers for originals and ad-hoc resized bytes."""

import contextlib
from typing import TYPE_CHECKING

from PIL import Image as PILImage
from PIL import ImageOps

from .constants import FORMAT_JPEG, FORMAT_MPO, FORMAT_WEBP
from .exif import filter_exif, get_exif_orientation
from .validation import validate_image_dimensions

if TYPE_CHECKING:
    from os import PathLike
    from typing import Any


# Metadata outside EXIF that can identify a person or place: XMP repeats GPS and can flag
# an appended motion-photo video, and a JPEG comment is free text. Any of them triggers the
# re-save, which writes none of them back.
_IDENTIFYING_INFO_KEYS = ("xmp", "XML:com.adobe.xmp", "comment")


def process_image_for_storage(image_path: PathLike[str]) -> tuple[int, int]:
    """Process an uploaded image in-place for storage.

    Returns the stored image's ``(width, height)`` in pixels. Read here rather
    than by a second open: the header is already parsed for the dimension
    validation below, and the EXIF rotation further down swaps the two, so this
    is the only point that knows the size the file actually ends up with.
    """
    with PILImage.open(image_path) as img:
        validate_image_dimensions(img)
        # A JPEG with an embedded secondary image (an HDR gain map, a depth map) opens as
        # MPO. It is stored as a plain JPEG of its primary image.
        is_mpo = img.format == FORMAT_MPO
        original_format = FORMAT_JPEG if is_mpo else (img.format or FORMAT_JPEG)

        has_exif = bool(img.info.get("exif"))
        if not has_exif:
            with contextlib.suppress(AttributeError, ValueError, OSError, TypeError):
                has_exif = bool(img.getexif())
        carries_metadata = has_exif or any(img.info.get(key) for key in _IDENTIFYING_INFO_KEYS)

        # Re-save only to strip metadata or apply rotation; an unconditional re-save
        # flattens animated GIFs and re-encodes lossless WebP lossily.
        # NOTE: animated originals are never re-saved: exif_transpose sees only the first
        # frame, so fixing one frame would flatten the rest. An MPO is not animated; its
        # later frames are derived images and are dropped.
        if not is_mpo and (not carries_metadata or getattr(img, "n_frames", 1) > 1):
            return img.size

        # Read the allowlisted tags off the original, before exif_transpose rewrites them.
        allowlisted = filter_exif(img)
        processed = img
        # Transposing costs a second full-size decode (150 MB at the 50 MPx cap), so it
        # only runs when there is a rotation to apply.
        if get_exif_orientation(img) not in (None, 1):
            with contextlib.suppress(AttributeError, ValueError, OSError, TypeError):
                processed = ImageOps.exif_transpose(img)

        # Only allowlisted tags are written back; GPS, MakerNote and serial numbers were never
        # copied. JPEG's saver would otherwise carry the comment over, and drop the colour profile.
        save_kwargs: dict[str, Any] = {
            "format": original_format,
            "exif": allowlisted.tobytes() if allowlisted else b"",
            "comment": b"",
            "icc_profile": img.info.get("icc_profile"),
        }
        if original_format == FORMAT_JPEG:
            save_kwargs.update({"quality": 95, "optimize": True})
        elif original_format == FORMAT_WEBP:
            # Avoid a second lossy generation on a WebP re-saved only to strip metadata.
            save_kwargs["lossless"] = True

        # Saved inside the `with`: closing the source discards its pixels. The file is
        # overwritten in place, which is safe because save() loads the pixels first.
        processed.save(image_path, **save_kwargs)
        return processed.size
