"""Product storage CRUD instances."""

from app.api.data_collection.models.product import Product
from app.api.file_storage.crud import ParentFileCrud, ParentImageCrud
from app.api.file_storage.models import MediaParentType

product_files_crud = ParentFileCrud(
    parent_model=Product,
    parent_type=MediaParentType.PRODUCT,
    parent_field="product_id",
)

product_images_crud = ParentImageCrud(
    parent_model=Product,
    parent_type=MediaParentType.PRODUCT,
    parent_field="product_id",
)
