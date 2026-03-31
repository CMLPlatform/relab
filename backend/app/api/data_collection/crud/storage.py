"""Product storage CRUD instances."""

from app.api.data_collection.models.product import Product
from app.api.file_storage.crud import ParentStorageCrud, file_storage_service, image_storage_service
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.schemas import FileCreate, ImageCreateFromForm

product_files_crud = ParentStorageCrud[File, FileCreate, FileFilter](
    parent_model=Product,
    storage_model=File,
    parent_type=MediaParentType.PRODUCT,
    parent_field="product_id",
    storage_service=file_storage_service,
)

product_images_crud = ParentStorageCrud[Image, ImageCreateFromForm, ImageFilter](
    parent_model=Product,
    storage_model=Image,
    parent_type=MediaParentType.PRODUCT,
    parent_field="product_id",
    storage_service=image_storage_service,
)
