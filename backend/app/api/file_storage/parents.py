"""File-storage parent model registry."""

from app.api.background_data.models import Material, ProductType
from app.api.common.exceptions import BadRequestError
from app.api.common.models.base import Base
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import MediaParentType


def parent_model_for_type(parent_type: MediaParentType) -> type[Base]:
    """Return the ORM model for a storage parent type."""
    if parent_type == parent_type.PRODUCT:
        return Product
    if parent_type == parent_type.PRODUCT_TYPE:
        return ProductType
    if parent_type == parent_type.MATERIAL:
        return Material
    err_msg = f"Invalid parent type: {parent_type}"
    raise BadRequestError(err_msg)
