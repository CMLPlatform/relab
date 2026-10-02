"""Image processing helpers for originals and ad-hoc resized bytes."""

import contextlib
import io
import os
from pathlib import Path
from typing import IO, TYPE_CHECKING

from PIL import Image as PILImage
from PIL import ImageOps

from .constants import FORMAT_JPEG, FORMAT_MPO, FORMAT_WEBP
from .exif import filter_exif, get_exif_orientation
from .validation import validate_animation_pixels, validate_image_dimensions

if TYPE_CHECKING:
    from typing import Any


# Metadata outside EXIF that can identify a person or place: XMP repeats GPS and can flag
# an appended motion-photo video, and a JPEG comment is free text. Any of them triggers the
# re-save, which writes none of them back.
_IDENTIFYING_INFO_KEYS = ("xmp", "XML:com.adobe.xmp", "comment")


def _carries_metadata(img: PILImage.Image) -> bool:
    """Return whether ``img`` holds EXIF, XMP, a comment or PNG text chunks."""
    has_exif = bool(img.info.get("exif"))
    if not has_exif:
        with contextlib.suppress(AttributeError, ValueError, OSError, TypeError):
            has_exif = bool(img.getexif())
    # PNG tEXt/iTXt/zTXt chunks are free text under any keyword and may follow the image
    # data, so `text` (which reads to the end of the file) is checked rather than `info`.
    return has_exif or any(img.info.get(key) for key in _IDENTIFYING_INFO_KEYS) or bool(getattr(img, "text", None))


def _animation_save_kwargs(img: PILImage.Image) -> dict[str, Any]:
    """Return the saver arguments that write every frame of ``img`` back unchanged.

    The WebP saver only takes per-frame durations as a list, and a GIF without a loop
    count plays once, so ``loop`` is copied only when the original has one. Pillow
    composites each frame on read, so the default disposal and blend operators
    reproduce the animation.
    """
    durations = []
    for index in range(img.n_frames):  # ty: ignore[unresolved-attribute]
        img.seek(index)
        img.load()  # WebP sets a frame's duration only once it is decoded.
        durations.append(img.info.get("duration", 0))
    img.seek(0)
    kwargs: dict[str, Any] = {"save_all": True, "duration": durations}
    with contextlib.suppress(KeyError):
        kwargs["loop"] = img.info["loop"]
    return kwargs


def process_image_for_storage(image: str | os.PathLike[str] | IO[bytes]) -> tuple[int, int]:
    """Strip metadata from an image and bake in its rotation, rewriting it in place.

    ``image`` is a path or a seekable binary file such as an upload, so the bytes can be
    cleaned before any storage backend receives them.

    Returns the stored image's ``(width, height)`` in pixels. Read here rather
    than by a second open: the header is already parsed for the dimension
    validation below, and the EXIF rotation further down swaps the two, so this
    is the only point that knows the size the file actually ends up with.
    """
    is_file = not isinstance(image, str | os.PathLike)
    if is_file:
        image.seek(0)
    with PILImage.open(image) as img:
        validate_image_dimensions(img)
        # A JPEG with an embedded secondary image (an HDR gain map, a depth map) opens as
        # MPO. It is stored as a plain JPEG of its primary image.
        is_mpo = img.format == FORMAT_MPO
        original_format = FORMAT_JPEG if is_mpo else (img.format or FORMAT_JPEG)

        # Re-save only to strip metadata or apply rotation; an unconditional re-save
        # re-encodes every frame of an animation and costs a full decode for nothing.
        # An MPO is not animated; its later frames are derived images and are dropped.
        is_animated = not is_mpo and getattr(img, "n_frames", 1) > 1
        if not is_mpo and not _carries_metadata(img):
            return img.size

        # Read the allowlisted tags off the original, before exif_transpose rewrites them.
        # An animation keeps no EXIF at all: its tags describe the first frame only.
        allowlisted = None if is_animated else filter_exif(img)
        processed = img
        # Transposing costs a second full-size decode (150 MB at the 50 MPx cap), so it
        # only runs when there is a rotation to apply. NOTE: exif_transpose sees only the
        # first frame, so an animation is stored unrotated rather than flattened.
        if not is_animated and get_exif_orientation(img) not in (None, 1):
            with contextlib.suppress(AttributeError, ValueError, OSError, TypeError):
                processed = ImageOps.exif_transpose(img)

        # Only allowlisted tags are written back; GPS, MakerNote and serial numbers were never
        # copied. XMP and the comment are blanked explicitly rather than left to each saver's
        # defaults, and JPEG's saver would otherwise drop the colour profile. PNG text chunks
        # are only written from an explicit `pnginfo`, which is never passed.
        save_kwargs: dict[str, Any] = {
            "format": original_format,
            "exif": allowlisted.tobytes() if allowlisted else b"",
            "xmp": b"",
            "comment": b"",
            "icc_profile": img.info.get("icc_profile"),
        }
        if original_format == FORMAT_JPEG:
            save_kwargs.update({"quality": 95, "optimize": True})
        elif original_format == FORMAT_WEBP:
            # Avoid a second lossy generation on a WebP re-saved only to strip metadata.
            save_kwargs["lossless"] = True
        if is_animated:
            validate_animation_pixels(img)
            save_kwargs.update(_animation_save_kwargs(img))

        # Saved inside the `with`: closing the source discards its pixels. A still path is
        # overwritten in place, which is safe because save() loads the pixels first. A file
        # is still the open source, and an animation's later frames are read during the
        # save, so both are encoded to a buffer and copied back below.
        buffered = is_file or is_animated
        encoded = io.BytesIO()
        processed.save(encoded if buffered else image, **save_kwargs)
        size = processed.size

    if is_file:
        image.seek(0)
        image.truncate()
        image.write(encoded.getbuffer())
        image.seek(0)
    elif buffered:
        Path(image).write_bytes(encoded.getbuffer())
    return size
