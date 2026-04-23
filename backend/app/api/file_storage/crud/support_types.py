"""Shared type aliases for file-storage CRUD helpers."""

from app.api.file_storage.models import File, Image
from app.api.file_storage.schemas import FileCreate, ImageCreateFromForm, ImageCreateInternal

type StorageModel = File | Image
type StorageCreateSchema = FileCreate | ImageCreateFromForm | ImageCreateInternal
