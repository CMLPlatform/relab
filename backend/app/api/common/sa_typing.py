"""Tiny helpers to narrow SQLAlchemy descriptor types for static checking.

SQLAlchemy 2.x annotates mapped columns with ``Mapped[T]`` but the class-level
attributes (``Product.components``, ``Product.brand``) resolve to descriptor
objects whose static shape doesn't match what ORM helpers like ``selectinload``
or column operators expect. The runtime behavior is fine — these helpers just
localize the static cast so call sites stay readable.

If ``sqlalchemy-stubs`` / newer SQLAlchemy releases tighten the descriptor
types, delete this module and fold its uses inline.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from sqlalchemy import ColumnElement
    from sqlalchemy.orm.attributes import QueryableAttribute


def orm_attr(attr: object) -> QueryableAttribute[Any]:
    """Narrow an ORM class attribute for ``selectinload`` / ``joinedload``."""
    return cast("QueryableAttribute[Any]", attr)


def column_expr(attr: object) -> ColumnElement[Any]:
    """Narrow an ORM class attribute for use in ``where``/``order_by`` clauses."""
    return cast("ColumnElement[Any]", attr)
