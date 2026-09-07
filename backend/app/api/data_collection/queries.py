"""Shared product query fragments owned by data_collection.

Both the system-wide stats read model and the per-user profile snapshot split
teardowns from components and rank categories by product count. The predicates
and the category-count statement live here so the two stay in sync.
"""

from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.api.data_collection.models.product import Product
from app.api.reference_data.models import ProductType

if TYPE_CHECKING:
    from sqlalchemy import ColumnElement, Select

# A teardown is a product at the top of a tree; anything with a parent is a
# component of one. The two populations never overlap.
IS_TEARDOWN = Product.parent_id.is_(None)
IS_COMPONENT = Product.parent_id.isnot(None)


def product_category_counts_stmt(*where: ColumnElement[bool], limit: int) -> Select[tuple[str, int]]:
    """Select ``(category name, product count)`` ordered by count DESC, then name ASC.

    The inner join means a category only appears once it has at least one
    matching product, so zero-count rows never reach the caller.
    """
    count_col = func.count(Product.id).label("count")
    return (
        select(ProductType.name, count_col)
        .join(Product, Product.product_type_id == ProductType.id)
        .where(*where)
        .group_by(ProductType.name)
        .order_by(count_col.desc(), ProductType.name.asc())
        .limit(limit)
    )
