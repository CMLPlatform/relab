"""Migration-compat shim for historical imports.

Alembic revisions import this module directly, so it remains as a thin
compatibility layer even though app code now imports the explicit storage
modules directly.
"""

from importlib import import_module

from app.api.file_storage.models.storage_core import BaseStorage, StorageFile, StorageImage, secure_filename
from app.api.file_storage.models.storage_filesystem import FileSystemStorage
from app.api.file_storage.models.storage_resolver import _get_file_storage, _get_image_storage
from app.api.file_storage.models.storage_s3 import S3Storage
from app.api.file_storage.models.storage_types import FileType, ImageType
from app.core.images import validate_image_file

__all__ = [
    "BaseStorage",
    "FileSystemStorage",
    "FileType",
    "ImageType",
    "S3Storage",
    "StorageFile",
    "StorageImage",
    "_get_file_storage",
    "_get_image_storage",
    "import_module",
    "secure_filename",
    "validate_image_file",
]
