"""Unit tests for product model logic."""

from uuid import uuid4

from app.api.data_collection.product_schemas import ProductRead
from tests.factories.models import MaterialProductLinkFactory, ProductFactory


def test_product_read_thumbnail_url_is_none_without_an_image() -> None:
    """A product with no images serializes a null thumbnail rather than raising."""
    product = ProductFactory.build(id=1, owner_id=uuid4(), bill_of_materials=[MaterialProductLinkFactory.build()])
    object.__setattr__(product, "first_image_file", None)

    assert ProductRead.model_validate(product).thumbnail_url is None
