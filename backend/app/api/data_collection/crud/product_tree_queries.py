"""Query helpers for bounded product tree reads."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.common.crud.filtering import apply_filter
from app.api.common.sa_typing import orm_attr
from app.api.data_collection.filters import ProductFilterWithRelationships
from app.api.data_collection.models.product import Product

PRODUCT_READ_SUMMARY_RELATIONSHIPS: frozenset[str] = frozenset({"owner"})
PRODUCT_READ_DETAIL_RELATIONSHIPS: frozenset[str] = frozenset(
    {"owner", "product_type", "videos", "files", "images", "bill_of_materials", "components"}
)

if TYPE_CHECKING:
    from sqlalchemy import Select
    from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(slots=True)
class ProductTreeData:
    """Loaded tree roots plus an explicit child adjacency map."""

    roots: list[Product]
    children_by_parent_id: dict[int, list[Product]]


async def load_component_subtree(
    db: AsyncSession,
    *,
    parent_id: int,
    recursion_depth: int = 1,
    product_filter: ProductFilterWithRelationships | None = None,
) -> ProductTreeData:
    """Load a bounded component subtree for the given parent.

    Callers are expected to have already verified ``parent_id`` exists
    (e.g. via the summary loader on the read route).
    """
    root_statement: Select[tuple[Product]] = (
        select(Product)
        .where(Product.parent_id == parent_id)
        .options(
            selectinload(orm_attr(Product.owner)),
            selectinload(orm_attr(Product.product_type)),
            selectinload(orm_attr(Product.videos)),
            selectinload(orm_attr(Product.files)),
            selectinload(orm_attr(Product.images)),
            selectinload(orm_attr(Product.bill_of_materials)),
        )
    )
    root_statement = apply_filter(root_statement, Product, product_filter)

    roots = list((await db.execute(root_statement)).scalars().unique().all())
    children_by_parent_id: dict[int, list[Product]] = {}
    frontier = [product.id for product in roots if product.id is not None]

    for _ in range(max(recursion_depth - 1, 0)):
        if not frontier:
            break

        child_statement: Select[tuple[Product]] = (
            select(Product).where(Product.parent_id.in_(frontier)).options(selectinload(orm_attr(Product.owner)))
        )
        children = list((await db.execute(child_statement)).scalars().unique().all())
        grouped_children: defaultdict[int, list[Product]] = defaultdict(list)
        next_frontier: list[int] = []

        for child in children:
            if child.parent_id is None:
                continue
            grouped_children[child.parent_id].append(child)
            if child.id is not None:
                next_frontier.append(child.id)

        children_by_parent_id.update(grouped_children)
        frontier = next_frontier

    return ProductTreeData(roots=roots, children_by_parent_id=children_by_parent_id)
