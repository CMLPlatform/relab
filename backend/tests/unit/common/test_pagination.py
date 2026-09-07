"""Unit tests for pagination query shaping."""

from sqlalchemy import select

from app.api.common.crud.pagination import _joins_rows
from app.api.data_collection.models.product import Product


def test_plain_select_does_not_need_distinct() -> None:
    """A single-table select cannot repeat an entity, so it must not get DISTINCT.

    DISTINCT forces the whole filtered set to be sorted before LIMIT applies,
    which drags Product.first_image_file's correlated subquery below the LIMIT
    and runs it once per table row instead of once per returned row.
    """
    assert _joins_rows(select(Product)) is False


def test_joined_select_needs_distinct() -> None:
    """A join can yield the same entity on several rows, so DISTINCT stays."""
    assert _joins_rows(select(Product).join(Product.product_type)) is True
