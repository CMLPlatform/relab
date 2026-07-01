"""File-storage parent model registry."""

from app.api.common.exceptions import BadRequestError
from app.api.common.models.base import Base
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import MediaParentType
from app.api.reference_data.models import Material, ProductType

_PARENT_MODELS: dict[MediaParentType, type[Base]] = {
    MediaParentType.PRODUCT: Product,
    MediaParentType.PRODUCT_TYPE: ProductType,
    MediaParentType.MATERIAL: Material,
}


def parent_model_for_type(parent_type: MediaParentType) -> type[Base]:
    """Return the ORM model for a storage parent type."""
    try:
        return _PARENT_MODELS[parent_type]
    except KeyError:
        raise BadRequestError(f"Invalid parent type: {parent_type}") from None
