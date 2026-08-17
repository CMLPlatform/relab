"""EXIF cleaning and orientation helpers."""

from PIL import Image as PILImage
from PIL import ImageOps
from PIL.ExifTags import IFD

from .constants import _EXIF_ORIENTATION_TAG, PRESERVED_EXIF_TAGS


def get_exif_orientation(img: PILImage.Image) -> int | None:
    """Return the EXIF orientation tag value, or None if absent or unreadable."""
    try:
        orientation = img.getexif().get(_EXIF_ORIENTATION_TAG)
    except AttributeError, ValueError, OSError, TypeError:
        return None
    return orientation if isinstance(orientation, int) else None


def apply_exif_orientation(img: PILImage.Image) -> PILImage.Image:
    """Rotate or flip image pixels to match EXIF orientation."""
    try:
        return ImageOps.exif_transpose(img)
    except AttributeError, ValueError, OSError, TypeError:
        return img


def filter_exif(img: PILImage.Image) -> PILImage.Exif:
    """Build a new Exif holding only the allowlisted capture parameters of ``img``.

    Nothing is copied across wholesale: GPS, MakerNote and every other unlisted tag is
    absent because it was never carried over, and the source image is left untouched.
    """
    filtered = PILImage.Exif()
    try:
        source = img.getexif()
        base_tags = source.items()
        exif_ifd_tags = source.get_ifd(IFD.Exif).items()
    except AttributeError, ValueError, OSError, TypeError:
        return filtered

    for tag_id, value in base_tags:
        if tag_id in PRESERVED_EXIF_TAGS:
            filtered[tag_id] = value
    # Most capture parameters live in the Exif sub-IFD rather than IFD0.
    preserved_sub_ifd = {tag_id: value for tag_id, value in exif_ifd_tags if tag_id in PRESERVED_EXIF_TAGS}
    if preserved_sub_ifd:
        filtered[IFD.Exif] = preserved_sub_ifd
    return filtered
