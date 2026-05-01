"""Filter classes for file storage models."""

from typing import ClassVar  # Runtime import required by fastapi-filters get_type_hints

from fastapi_filters import FilterField, FilterOperator

from app.api.common.crud.filtering import BaseFilterSet
from app.api.file_storage.models import File, Image, MediaParentType, Video

_TEXT_OPERATORS = [FilterOperator.ilike]


class FileFilter(BaseFilterSet):
    """FilterSet for File filtering."""

    filter_model: ClassVar[type[File]] = File
    sortable_fields: ClassVar[tuple[str, ...]] = ("filename", "created_at")
    search_columns: ClassVar[tuple[object, ...]] = (File.filename, File.description)

    filename: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    parent_type: FilterField[MediaParentType] = FilterField(operators=[FilterOperator.eq])


class ImageFilter(BaseFilterSet):
    """FilterSet for Image filtering."""

    filter_model: ClassVar[type[Image]] = Image
    sortable_fields: ClassVar[tuple[str, ...]] = ("filename", "created_at")
    search_columns: ClassVar[tuple[object, ...]] = (Image.filename, Image.description)

    filename: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    parent_type: FilterField[MediaParentType] = FilterField(operators=[FilterOperator.eq])


class VideoFilter(BaseFilterSet):
    """FilterSet for Video filtering."""

    filter_model: ClassVar[type[Video]] = Video
    sortable_fields: ClassVar[tuple[str, ...]] = ("url", "created_at")
    search_columns: ClassVar[tuple[object, ...]] = (Video.url, Video.description)

    url: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
