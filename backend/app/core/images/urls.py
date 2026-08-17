"""Public URL construction for stored images.

Lives in ``core`` (not ``file_storage.schemas``) so that ``common.schemas``
can derive thumbnail URLs without importing a package that imports it back.
"""

from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import quote

from app.core.http_headers import UPLOADS_PATH_PREFIX
from app.core.images.thumbnails import thumbnail_path_for

if TYPE_CHECKING:
    from os import PathLike

THUMBNAIL_WIDTH_PX = 200
IMAGE_URL_PREFIX = f"{UPLOADS_PATH_PREFIX}/images"


def relative_to_storage_root(file_path: Path, storage_root: Path) -> Path | None:
    """Return a stored path relative to its configured root, or None if outside it."""
    try:
        return file_path.resolve().relative_to(storage_root.resolve())
    except OSError, ValueError:
        return None


def build_storage_url(path: str | PathLike[str] | None, storage_root: Path, url_prefix: str) -> str | None:
    """Build a public URL for a stored file-backed object from its filesystem path."""
    if path is None:
        return None
    if str(path).startswith(("http://", "https://")):  # S3 backend: get_path() already returns a public URL
        return str(path)

    file_path = Path(path)
    if not file_path.exists():
        return None

    relative_path = relative_to_storage_root(file_path, storage_root)
    if relative_path is None:
        return None
    return f"{url_prefix}/{quote(str(relative_path))}"


def build_image_urls(file_path: str | None, storage_root: Path) -> tuple[str | None, str | None]:
    """Build generated image and thumbnail URLs with filesystem existence checks.

    Returns (image_url, thumbnail_url) — both None if the original file does not exist.
    """
    if file_path is None:
        return None, None
    image_url = build_storage_url(file_path, storage_root, IMAGE_URL_PREFIX)
    if image_url is None:
        return None, None
    if file_path.startswith(("http://", "https://")):  # S3 backend: path is already a public URL, no local thumbnail
        return image_url, image_url
    # Fall back to the full image when the thumbnail is missing or outside the storage root.
    thumbnail_path = thumbnail_path_for(Path(file_path), THUMBNAIL_WIDTH_PX)
    thumbnail_url = build_storage_url(thumbnail_path, storage_root, IMAGE_URL_PREFIX) or image_url
    return image_url, thumbnail_url


def build_thumbnail_url(stored_file: object | None, storage_root: Path) -> str | None:
    """Derive just the thumbnail URL from a stored-image column value."""
    file_path = getattr(stored_file, "path", None)
    if file_path is None:
        return None
    return build_image_urls(str(file_path), storage_root)[1]
