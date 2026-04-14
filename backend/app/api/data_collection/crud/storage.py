"""Product storage CRUD instances."""

from app.api.data_collection.models.product import Product
from app.api.file_storage.crud import ParentMediaCrud, file_storage_service, image_storage_service
from app.api.file_storage.models import File, Image, MediaParentType

product_files_crud = ParentMediaCrud(
    parent_model=Product,
    parent_type=MediaParentType.PRODUCT,
    storage_model=File,
    storage_service=file_storage_service,
)

product_images_crud = ParentMediaCrud(
    parent_model=Product,
    parent_type=MediaParentType.PRODUCT,
    storage_model=Image,
    storage_service=image_storage_service,
)
