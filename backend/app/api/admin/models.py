"""Models for the admin module."""

import uuid
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, ClassVar

from anyio import to_thread
from markupsafe import Markup
from sqladmin import ModelView
from sqladmin._types import MODEL_ATTR
from starlette.datastructures import UploadFile
from starlette.requests import Request
from wtforms import ValidationError
from wtforms.fields import FileField
from wtforms.form import Form
from wtforms.validators import InputRequired

from app.api.auth.models import User
from app.api.background_data.models import Category, Material, ProductType, Taxonomy
from app.api.common.models.associations import MaterialProductLink
from app.api.data_collection.models import Product
from app.api.file_storage.models.models import Image, Video

### Constants ###
ALLOWED_IMAGE_EXTENSIONS: set[str] = {".bmp", ".gif", ".jpeg", ".jpg", ".png", ".tiff", ".webp"}


### Form Validators ###
class FileSizeLimit:
    """WTForms validator to limit the file size of a FileField."""

    def __init__(self, max_size_mb: int, message: str | None = None) -> None:
        self.max_size_mb = max_size_mb
        self.message = message or f"File size must be under {self.max_size_mb} MB."

    def __call__(self, form: Form, field: FileField):  # noqa: ARG002 # WTForms uses this signature
        if isinstance(field.data, UploadFile) and field.data.size and field.data.size > self.max_size_mb * 1024 * 1024:
            raise ValidationError(self.message)


class FileTypeValidator:
    """WTForms validator to limit the file type of a FileField."""

    def __init__(self, allowed_extensions: set[str], message: str | None = None):
        self.allowed_extensions = allowed_extensions
        self.message = message or f"Allowed file types: {', '.join(self.allowed_extensions)}."

    def __call__(self, form: Form, field: FileField):  # noqa: ARG002 # WTForms uses this signature
        if isinstance(field.data, UploadFile) and field.data.filename:
            file_ext = Path(field.data.filename).suffix.lower()
            if file_ext not in self.allowed_extensions:
                raise ValidationError(self.message)


### Linking Models ###
class MaterialProductLinkAdmin(ModelView, model=MaterialProductLink):
    """Admin view for Material-Product links."""

    name = "Material-Product Link"
    name_plural = "Material-Product Links"
    icon = "fa-solid fa-link"
    category = "Data Collection"

    column_list: ClassVar[Sequence[MODEL_ATTR]] = ["material", "product", "quantity", "unit"]

    column_formatters: ClassVar[dict[MODEL_ATTR, Callable]] = {
        "material": lambda m, _: Markup('<a href="/admin/material/{}">{}</a>').format(m.material_id, m.material),
        "product": lambda m, _: Markup('<a href="/admin/product/{}">{}</a>').format(m.product_id, m.product),
    }

    column_searchable_list: ClassVar[Sequence[MODEL_ATTR]] = ["material.name", "product.name"]

    column_sortable_list: ClassVar[Sequence[MODEL_ATTR]] = ["quantity", "unit"]

    column_details_list: ClassVar[Sequence[MODEL_ATTR]] = [*column_list, "created_at", "updated_at"]


### Background Models ###
class CategoryAdmin(ModelView, model=Category):
    """Admin view for Category model."""

    name = "Category"
    name_plural = "Categories"
    icon = "fa-solid fa-list"
    category = "Background Data"
    column_list: ClassVar[Sequence[MODEL_ATTR]] = ["id", "name", "taxonomy_id"]
    column_searchable_list: ClassVar[Sequence[MODEL_ATTR]] = ["name", "description"]
    column_sortable_list: ClassVar[Sequence[MODEL_ATTR]] = ["id", "name", "taxonomy_id"]


class TaxonomyAdmin(ModelView, model=Taxonomy):
    """Admin view for Taxonomy model."""

    name = "Taxonomy"
    name_plural = "Taxonomies"
    icon = "fa-solid fa-sitemap"
    category = "Background Data"

    column_list: ClassVar[Sequence[MODEL_ATTR]] = ["id", "name", "domain"]
    column_searchable_list: ClassVar[Sequence[MODEL_ATTR]] = ["name", "domain"]
    column_sortable_list: ClassVar[Sequence[MODEL_ATTR]] = ["id", "name"]


class MaterialAdmin(ModelView, model=Material):
    """Admin view for Material model."""

    name = "Material"
    name_plural = "Materials"
    icon = "fa-solid fa-cubes"
    category = "Background Data"

    column_labels: ClassVar[dict[MODEL_ATTR, str]] = {
        "density_kg_m3": "Density (kg/m³)",
        "is_crm": "Is CRM",
    }

    column_list: ClassVar[Sequence[MODEL_ATTR]] = [
        "id",
        "name",
        "description",
        "is_crm",
    ]
    column_searchable_list: ClassVar[Sequence[MODEL_ATTR]] = ["name", "description"]
    column_sortable_list: ClassVar[Sequence[MODEL_ATTR]] = ["id", "name", "is_crm"]


class ProductTypeAdmin(ModelView, model=ProductType):
    """Admin view for ProductType model."""

    name = "Product Type"
    name_plural = "Product Types"
    icon = "fa-solid fa-tag"
    category = "Background Data"

    column_labels: ClassVar[dict[MODEL_ATTR, str]] = {
        "lifespan_yr": "Lifespan (years)",
    }

    column_list: ClassVar[Sequence[MODEL_ATTR]] = ["id", "name", "description"]
    column_searchable_list: ClassVar[Sequence[MODEL_ATTR]] = ["name", "description"]
    column_sortable_list: ClassVar[Sequence[MODEL_ATTR]] = ["id", "name"]


### Product Models ###
class ProductAdmin(ModelView, model=Product):
    """Admin view for Product model."""

    name = "Product"
    name_plural = "Products"
    icon = "fa-solid fa-box"
    category = "Data Collection"

    column_list: ClassVar[Sequence[MODEL_ATTR]] = [
        "id",
        "name",
        "type",
        "description",
    ]
    column_searchable_list: ClassVar[Sequence[MODEL_ATTR]] = ["name", "description"]
    column_sortable_list: ClassVar[Sequence[MODEL_ATTR]] = [
        "id",
        "name",
        "product_type_id",
    ]


### Data Collection Models ###
class VideoAdmin(ModelView, model=Video):
    """Admin view for Video model."""

    name = "Video"
    name_plural = "Videos"
    icon = "fa-solid fa-video"
    category = "Data Collection"

    column_list: ClassVar[Sequence[MODEL_ATTR]] = ["id", "url", "description", "product", "created_at"]

    column_formatters: ClassVar[dict[MODEL_ATTR, Callable]] = {
        "url": lambda m, _: Markup('<a href="{}" target="_blank">{}</a>').format(m.url, m.url),
        "product": lambda m, _: Markup('<a href="/admin/product/{}">{}</a>').format(m.product_id, m.product)
        if m.product
        else "",
        "created_at": lambda m, _: m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else "",
    }

    column_searchable_list: ClassVar[Sequence[MODEL_ATTR]] = ["description", "url"]

    column_sortable_list: ClassVar[Sequence[MODEL_ATTR]] = ["id", "created_at"]

    column_details_list: ClassVar[Sequence[MODEL_ATTR]] = [*column_list, "updated_at"]


### User Models ###
class UserAdmin(ModelView, model=User):
    """Admin view for User model."""

    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-user"
    category = "Users"

    # User CRUD should be handled by the auth module
    can_create = False
    can_edit = False
    can_delete = False

    column_list: ClassVar[Sequence[MODEL_ATTR]] = [
        "id",
        "email",
        "username",
        "organization",
        "is_active",
        "is_superuser",
        "is_verified",
    ]
    column_searchable_list: ClassVar[Sequence[MODEL_ATTR]] = ["email", "organization"]
    column_sortable_list: ClassVar[Sequence[MODEL_ATTR]] = ["email", "organization"]

    column_details_list: ClassVar[Sequence[MODEL_ATTR]] = column_list


### File Storage Models ###
class ImageAdmin(ModelView, model=Image):
    """Admin view for Image model."""

    # TODO: Use Image schema logic instead of duplicating it here
    # TODO: Add a method to download the original file (should take it from the filename but rename it to original_name)

    name = "Image"
    name_plural = "Images"
    icon = "fa-solid fa-camera"
    category = "Data Collection"

    # Display settings
    column_list: ClassVar[Sequence[MODEL_ATTR]] = [
        "id",
        "description",
        "filename",
        "created_at",
        "updated_at",
        "image_preview",
    ]
    column_details_list: ClassVar[Sequence[MODEL_ATTR]] = column_list
    column_formatters: ClassVar[dict[MODEL_ATTR, Callable]] = {
        "created_at": lambda model, _: model.created_at.strftime("%Y-%m-%d %H:%M:%S") if model.created_at else "",
        "updated_at": lambda model, _: model.updated_at.strftime("%Y-%m-%d %H:%M:%S") if model.updated_at else "",
        "image_preview": lambda model, _: model.image_preview(100),
    }
    column_formatters_detail: ClassVar[dict[MODEL_ATTR, Callable]] = column_formatters

    column_searchable_list: ClassVar[Sequence[MODEL_ATTR]] = [
        "id",
        "description",
        "filename",
        "created_at",
        "updated_at",
    ]
    column_sortable_list: ClassVar[Sequence[MODEL_ATTR]] = column_searchable_list

    # Create and edit settings
    form_columns: ClassVar[Sequence[MODEL_ATTR]] = [
        "description",
        "file",
    ]

    form_args: ClassVar[dict[str, Any]] = {
        "file": {
            "validators": [
                InputRequired(),
                FileSizeLimit(max_size_mb=10),
                FileTypeValidator(allowed_extensions=ALLOWED_IMAGE_EXTENSIONS),
            ],
        }
    }

    def _delete_image_file(self, image_path: Path) -> None:
        """Delete the image file from the filesystem if it exists."""
        if image_path.exists():
            image_path.unlink()

    def handle_model_change(self, data: dict[str, Any], model: Image, is_created: bool) -> None:  # noqa: FBT001 # Wtforms uses this signature
        def new_image_uploaded(data: dict[str, Any]) -> bool:
            """Check if a new image is present in form data."""
            return isinstance(data.get("file"), UploadFile) and data["file"].size

        if new_image_uploaded(data):
            model.filename = data["file"].filename  # Set the filename to the original filename
            data["file"].filename = f"{uuid.uuid4()}{Path(model.filename).suffix}"  # Store the file to a unique path

        if not is_created and model.file:  # If the model is being edited and it has an existing image
            if new_image_uploaded(data):
                self._delete_image_file(Path(model.file.path))
            else:
                data.pop("file", None)  # Keep existing image if no new one uploaded

    def handle_model_delete(self, model: Image) -> None:
        if model.file:
            self._delete_image_file(model.file.path)

    async def on_model_change(self, data: dict[str, Any], model: Image, is_created: bool, request: Request) -> None:  # noqa: ARG002, FBT001 # Wtforms uses this signature
        """SQLAdmin expects on_model_change to be asynchronous. This method handles the synchronous model change."""
        await to_thread.run_sync(self.handle_model_change, data, model, is_created)

    async def after_model_delete(self, model: Image, request: Request) -> None:  # noqa: ARG002 # Wtforms uses this signature
        await to_thread.run_sync(lambda: self._delete_image_file(Path(model.file.path)) if model.file.path else None)
