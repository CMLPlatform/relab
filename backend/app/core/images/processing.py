"""Image processing helpers for originals and ad-hoc resized bytes."""

import contextlib
from pathlib import Path
from typing import TYPE_CHECKING

from PIL import Image as PILImage
from PIL import ImageOps

from .constants import _EXIF_ORIENTATION_TAG, FORMAT_JPEG, FORMAT_WEBP
from .exif import display_size, filter_exif, get_exif_orientation, rewrite_jpeg_metadata
from .validation import validate_image_dimensions

if TYPE_CHECKING:
    from os import PathLike
    from typing import Any


def process_image_for_storage(image_path: PathLike[str]) -> tuple[int, int]:
    """Strip identifying metadata from an uploaded image in place.

    Returns the image's ``(width, height)`` as it displays, after EXIF orientation;
    every recorded dimension uses that, never the stored pixel layout.

    JPEG originals keep their pixel data byte for byte: only the metadata segments are
    rewritten, keeping the allowlisted EXIF tags. Orientation is on that list, so
    browsers and the thumbnailer still turn the image upright.
    """
    with PILImage.open(image_path) as img:
        validate_image_dimensions(img)
        if img.format == FORMAT_JPEG:
            allowlisted = filter_exif(img)
            jpeg_exif: bytes | None = allowlisted.tobytes() if allowlisted else b""
            resave = None
            size = display_size(img)
        else:
            jpeg_exif = None
            resave = _prepare_non_jpeg(img)
            size = img.size

    if jpeg_exif is not None:
        path = Path(image_path)
        path.write_bytes(rewrite_jpeg_metadata(path.read_bytes(), jpeg_exif))
        return size
    if resave is None:
        return size
    processed, save_kwargs = resave
    processed.save(image_path, **save_kwargs)
    return processed.size


def _prepare_non_jpeg(img: PILImage.Image) -> tuple[PILImage.Image, dict[str, Any]] | None:
    """Return the image and save arguments for a lossless metadata re-save, or None.

    A non-JPEG is re-saved only when it carries EXIF, with the rotation applied.

    PNG re-saves losslessly anyway, and WebP is re-saved lossless, so the pixels are
    unchanged apart from the rotation. Rotation is applied rather than kept as a tag
    because browsers do not reliably honour an orientation tag outside JPEG.
    """
    has_exif = bool(img.info.get("exif"))
    if not has_exif:
        with contextlib.suppress(AttributeError, ValueError, OSError, TypeError):
            has_exif = bool(img.getexif())
    # NOTE: animated originals are never re-saved: exif_transpose sees only the first
    # frame, so fixing one frame would flatten the rest. An unconditional re-save would
    # also flatten animated GIFs and grow lossy WebP into lossless.
    if not has_exif or getattr(img, "n_frames", 1) > 1:
        return None

    allowlisted = filter_exif(img)
    # The rotation is baked into the pixels below; writing the tag back would double-rotate.
    allowlisted.pop(_EXIF_ORIENTATION_TAG, None)
    original_format = img.format
    try:
        processed = ImageOps.exif_transpose(img) if get_exif_orientation(img) not in (None, 1) else img.copy()
    except AttributeError, ValueError, OSError, TypeError:
        processed = img.copy()

    # Only allowlisted tags are written back; GPS, MakerNote and serial numbers were never copied.
    save_kwargs: dict[str, Any] = {"format": original_format, "exif": allowlisted.tobytes() if allowlisted else b""}
    if original_format == FORMAT_WEBP:
        # Avoid a second lossy generation on a WebP re-saved only to strip metadata.
        save_kwargs["lossless"] = True
    return processed, save_kwargs
