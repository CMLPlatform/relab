"""Central upload allowlists and validation helpers."""
# spell-checker: ignore HYPERSPECTRAL nitf

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from PIL import Image as PILImage
from PIL import UnidentifiedImageError

from app.api.common.exceptions import BadRequestError

if TYPE_CHECKING:
    from fastapi import UploadFile

RESEARCH_FILE_EXTENSIONS: frozenset[str] = frozenset(
    {
        ".csv",
        ".docx",
        ".json",
        ".md",
        ".pdf",
        ".pptx",
        ".tsv",
        ".txt",
        ".xlsx",
    }
)
HYPERSPECTRAL_FILE_EXTENSIONS: frozenset[str] = frozenset(
    {
        ".dat",
        ".h5",
        ".hdr",
        ".hdf5",
        ".img",
        ".nitf",
        ".ntf",
        ".raw",
        ".tif",
        ".tiff",
    }
)
GENERIC_FILE_EXTENSIONS = RESEARCH_FILE_EXTENSIONS | HYPERSPECTRAL_FILE_EXTENSIONS

IMAGE_EXTENSION_TO_FORMAT: dict[str, str] = {
    ".bmp": "BMP",
    ".gif": "GIF",
    ".jpeg": "JPEG",
    ".jpg": "JPEG",
    ".png": "PNG",
    ".webp": "WEBP",
}
IMAGE_MIME_TO_FORMAT: dict[str, str] = {
    "image/bmp": "BMP",
    "image/gif": "GIF",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}
IMAGE_UPLOAD_EXTENSIONS = frozenset(IMAGE_EXTENSION_TO_FORMAT)
IMAGE_UPLOAD_MIME_TYPES = frozenset(IMAGE_MIME_TO_FORMAT)


def _safe_upload_name(upload_file: UploadFile) -> str:
    """Return a safe basename for policy checks."""
    filename = upload_file.filename
    if not filename:
        msg = "File name is empty."
        raise BadRequestError(msg)

    if "/" in filename or "\\" in filename:
        msg = "File name must not include path separators."
        raise BadRequestError(msg)
    if filename.startswith((".", " ", "-")):
        msg = "File name must not start with a period, space, or hyphen."
        raise BadRequestError(msg)
    return filename


def _single_normalized_extension(name: str) -> str:
    """Return the single normalized extension, rejecting bypass-prone names."""
    path = Path(name)
    suffixes = path.suffixes
    if not suffixes:
        msg = "File extension is required."
        raise BadRequestError(msg)
    if len(suffixes) > 1:
        msg = "File names with multiple extensions are not supported."
        raise BadRequestError(msg)
    return suffixes[0].lower()


def validate_generic_file_upload_metadata(upload_file: UploadFile) -> UploadFile:
    """Validate generic file upload metadata against the allowlist."""
    name = _safe_upload_name(upload_file)
    extension = _single_normalized_extension(name)
    if extension not in GENERIC_FILE_EXTENSIONS:
        allowed = ", ".join(sorted(GENERIC_FILE_EXTENSIONS))
        msg = f"File extension {extension} is not supported. Allowed extensions: {allowed}"
        raise BadRequestError(msg)
    return upload_file


def validate_image_upload_metadata(upload_file: UploadFile) -> UploadFile:
    """Validate image upload metadata before content inspection."""
    name = _safe_upload_name(upload_file)
    extension = _single_normalized_extension(name)
    if extension in HYPERSPECTRAL_FILE_EXTENSIONS:
        msg = f"File extension {extension} is not supported for image uploads. Use file uploads instead."
        raise BadRequestError(msg)
    expected_format = IMAGE_EXTENSION_TO_FORMAT.get(extension)
    if expected_format is None:
        allowed = ", ".join(sorted(IMAGE_UPLOAD_EXTENSIONS))
        msg = f"File extension {extension} is not supported for image uploads. Allowed extensions: {allowed}"
        raise BadRequestError(msg)

    content_type = upload_file.content_type
    declared_format = IMAGE_MIME_TO_FORMAT.get(content_type or "")
    if declared_format is None:
        allowed_types = ", ".join(sorted(IMAGE_UPLOAD_MIME_TYPES))
        msg = f"Invalid image MIME type: {content_type}. Allowed types: {allowed_types}"
        raise BadRequestError(msg)
    if declared_format != expected_format:
        msg = f"Image MIME type {content_type} does not match file extension {extension}."
        raise BadRequestError(msg)
    return upload_file


def validate_image_upload_content(upload_file: UploadFile) -> UploadFile:
    """Validate that image content matches its declared upload metadata."""
    validate_image_upload_metadata(upload_file)
    name = _safe_upload_name(upload_file)
    expected_format = IMAGE_EXTENSION_TO_FORMAT[_single_normalized_extension(name)]

    upload_file.file.seek(0)
    try:
        with PILImage.open(upload_file.file) as image:
            detected_format = image.format
            image.verify()
    except (AttributeError, OSError, TypeError, UnidentifiedImageError) as exc:
        msg = "Invalid image file"
        raise BadRequestError(msg) from exc
    finally:
        upload_file.file.seek(0)

    if detected_format != expected_format:
        msg = (
            f"Image content format {detected_format or 'unknown'} does not match "
            f"file extension {Path(name).suffix.lower()}."
        )
        raise BadRequestError(msg)
    return upload_file
