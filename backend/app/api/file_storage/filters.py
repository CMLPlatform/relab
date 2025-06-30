"""FastAPI-Filter classes for filtering database queries on file storage models."""

from fastapi_filter.contrib.sqlalchemy import Filter

from app.api.file_storage.models.models import File, FileParentType, Image, ImageParentType, Video


class FileFilter(Filter):
    """FastAPI-filter class for File filtering."""

    filename__ilike: str | None = None
    description__ilike: str | None = None
    parent_type: FileParentType | None = None

    search: str | None = None

    class Constants(Filter.Constants):  # FilterAPI class configuration
        """FilterAPI class configuration."""

        model = File
        search_model_fields: list[str] = [  # noqa: RUF012 # Standard FastAPI-filter class override
            "filename",
            "description",
        ]


class ImageFilter(Filter):
    """FastAPI-filter class for Image filtering."""

    filename__ilike: str | None = None
    description__ilike: str | None = None
    parent_type: ImageParentType | None = None

    search: str | None = None

    class Constants(Filter.Constants):  # FilterAPI class configuration
        """FilterAPI class configuration."""

        model = Image
        search_model_fields: list[str] = [  # noqa: RUF012 # Standard FastAPI-filter class override
            "filename",
            "description",
        ]


class VideoFilter(Filter):
    """FastAPI-filter class for Video filtering."""

    url__ilike: str | None = None
    description__ilike: str | None = None

    search: str | None = None

    class Constants(Filter.Constants):  # FilterAPI class configuration
        """FilterAPI class configuration."""

        model = Video
        search_model_fields: list[str] = [  # noqa: RUF012 # Standard FastAPI-filter class override
            "url",
            "description",
        ]
