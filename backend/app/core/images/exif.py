"""EXIF cleaning, orientation, and lossless JPEG metadata helpers."""

from typing import TYPE_CHECKING

from PIL import Image as PILImage
from PIL import ImageOps
from PIL.ExifTags import IFD

from .constants import _EXIF_ORIENTATION_TAG, PRESERVED_EXIF_TAGS

if TYPE_CHECKING:
    from collections.abc import Iterator


def get_exif_orientation(img: PILImage.Image) -> int | None:
    """Return the EXIF orientation tag value, or None if absent or unreadable."""
    try:
        orientation = img.getexif().get(_EXIF_ORIENTATION_TAG)
    except AttributeError, ValueError, OSError, TypeError:
        return None
    return orientation if isinstance(orientation, int) else None


# Orientations 5-8 turn the image a quarter, so its displayed width is the stored height.
_QUARTER_TURN_ORIENTATIONS = frozenset({5, 6, 7, 8})


def display_size(img: PILImage.Image) -> tuple[int, int]:
    """Return ``(width, height)`` as the image displays, after its EXIF orientation.

    JPEG originals are stored with their pixels as shot and the orientation tag kept, so
    ``img.size`` is the sensor's layout; every recorded dimension uses this instead.
    """
    width, height = img.size
    return (height, width) if get_exif_orientation(img) in _QUARTER_TURN_ORIENTATIONS else (width, height)


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


# Segments a JPEG keeps when its metadata is rewritten. Everything else is metadata that
# decoding does not need and that can identify a person or place: other APP1 blocks (XMP,
# which repeats GPS), APP2 other than ICC (MPF secondary images), APP3-APP13 (IPTC,
# vendor blocks), APP15 and comments. Non-APP markers (tables, frame, scan) are kept.
_JPEG_KEPT_APP_PREFIXES: dict[int, tuple[bytes, ...]] = {
    0xE0: (b"JFIF\x00", b"JFXX\x00"),  # APP0: colour-space hint
    0xE2: (b"ICC_PROFILE\x00",),  # APP2: colour profile
    0xEE: (b"Adobe",),  # APP14: colour transform, needed to decode CMYK/YCCK
}
_JPEG_SOI = b"\xff\xd8"
_JPEG_EOI_MARKER = 0xD9
_JPEG_SOS_MARKER = 0xDA
_JPEG_APP0_MARKER = 0xE0
_JPEG_APP1_MARKER = 0xE1
_JPEG_MAX_SEGMENT_PAYLOAD = 0xFFFF - 2


def _is_standalone_marker(marker: int) -> bool:
    """RST0-7 and TEM carry no length field."""
    return 0xD0 <= marker <= 0xD7 or marker == 0x01


def _is_dropped_metadata(marker: int, payload: bytes) -> bool:
    is_app_or_comment = 0xE0 <= marker <= 0xEF or marker == 0xFE
    return is_app_or_comment and not payload.startswith(_JPEG_KEPT_APP_PREFIXES.get(marker, ()))


def _scan_data_end(data: bytes, start: int) -> int:
    """Return the offset of the first marker after entropy-coded data at ``start``.

    Inside scan data a 0xFF byte is followed by 0x00 (byte stuffing) or an RST marker;
    anything else starts the next segment.
    """
    position = start
    while (position := data.find(b"\xff", position)) != -1 and position + 1 < len(data):
        follower = data[position + 1]
        if follower != 0x00 and not 0xD0 <= follower <= 0xD7:
            return position
        position += 2
    return len(data)


def _jpeg_segments(data: bytes) -> Iterator[tuple[int, bytes]]:
    """Yield ``(marker, raw bytes)`` for each marker after SOI, up to and including EOI.

    A start-of-scan segment's bytes include the entropy-coded data that follows it.
    Raises ValueError on a malformed segment.
    """
    position = len(_JPEG_SOI)
    while position < len(data):
        if data[position] != 0xFF:
            msg = "Malformed JPEG: expected a marker."
            raise ValueError(msg)
        while position < len(data) and data[position] == 0xFF:  # fill bytes
            position += 1
        if position >= len(data):
            return
        marker = data[position]
        start = position - 1
        position += 1
        if marker == _JPEG_EOI_MARKER or _is_standalone_marker(marker):
            yield marker, data[start:position]
            if marker == _JPEG_EOI_MARKER:
                return
            continue

        length = int.from_bytes(data[position : position + 2])
        position += length
        if length < 2 or position > len(data):
            msg = "Malformed JPEG: truncated segment."
            raise ValueError(msg)
        if marker == _JPEG_SOS_MARKER:
            position = _scan_data_end(data, position)
        yield marker, data[start:position]


def rewrite_jpeg_metadata(data: bytes, exif: bytes) -> bytes:
    """Return the JPEG ``data`` with its metadata replaced by ``exif``, pixels untouched.

    Quantisation and Huffman tables, the frame header and every scan are copied byte for
    byte, so the image decodes to exactly the same pixels; Pillow cannot do this, as it
    re-encodes on save. ``exif`` is a complete APP1 payload as Pillow's ``Exif.tobytes()``
    returns it, or empty to write none. Bytes after EOI (motion-photo video, MPF
    secondary images) are dropped. Raises ValueError on a malformed file.
    """
    if not data.startswith(_JPEG_SOI):
        msg = "Not a JPEG file."
        raise ValueError(msg)
    if len(exif) > _JPEG_MAX_SEGMENT_PAYLOAD:
        msg = "EXIF block too large for a JPEG segment."
        raise ValueError(msg)

    out = [_JPEG_SOI]
    pending_exif = exif
    for marker, segment in _jpeg_segments(data):
        # EXIF goes first, after a JFIF APP0 if there is one.
        if pending_exif and marker != _JPEG_APP0_MARKER:
            out.append(bytes((0xFF, _JPEG_APP1_MARKER)) + (len(pending_exif) + 2).to_bytes(2) + pending_exif)
            pending_exif = b""
        # The payload starts after the marker and its two-byte length.
        if not _is_dropped_metadata(marker, segment[4:]):
            out.append(segment)
    return b"".join(out)
