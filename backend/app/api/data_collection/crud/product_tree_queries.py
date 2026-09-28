"""Query helpers for bounded product tree reads."""

from collections import defaultdict
from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.utils import ensure_model_exists
from app.api.common.sa_typing import orm_attr
from app.api.data_collection.filters import ProductFilterWithRelationships
from app.api.data_collection.models.product import MaterialProductLink, Product

COMPONENTS_RELATIONSHIP = "components"
PRODUCT_READ_SUMMARY_RELATIONSHIPS: frozenset[str] = frozenset({"owner"})
PRODUCT_READ_DETAIL_RELATIONSHIPS: frozenset[str] = frozenset(
    {"owner", "product_type", "videos", "files", "images", "bill_of_materials", COMPONENTS_RELATIONSHIP}
)
# Export walks the tree level by level itself, so it loads no ``components`` per row.
PRODUCT_EXPORT_RELATIONSHIPS: frozenset[str] = PRODUCT_READ_DETAIL_RELATIONSHIPS - {COMPONENTS_RELATIONSHIP}

if TYPE_CHECKING:
    from collections.abc import Iterable

    from sqlalchemy import Select
    from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(slots=True)
class ProductTreeData:
    """Loaded tree roots plus an explicit child adjacency map."""

    roots: list[Product]
    children_by_parent_id: dict[int, list[Product]]


def apply_product_detail_loaders(
    statement: Select[tuple[Product]],
    relationships: frozenset[str] = PRODUCT_READ_DETAIL_RELATIONSHIPS,
) -> Select[tuple[Product]]:
    """Apply relationship loaders required by product detail responses.

    ``Product``'s components, parent and images are all eagerly loaded at class
    level, so this looks like it should walk a whole subtree; it does not. The
    ``raiseload("*")`` that ``apply_loader_profile`` puts on the statement
    propagates to sub-loaders, which stops the loaded components from firing
    their own defaults. Measured on a five-deep tree: eight queries, and a
    component's own components come back unloaded. See
    ``test_product_detail_load_stops_below_the_first_component_level``.
    """
    statement = apply_loader_profile(statement, Product, relationships)
    if COMPONENTS_RELATIONSHIP in relationships:
        statement = statement.options(selectinload(orm_attr(Product.components)).selectinload(orm_attr(Product.owner)))
    return statement.options(
        selectinload(orm_attr(Product.bill_of_materials)).selectinload(orm_attr(MaterialProductLink.material)),
    )


async def require_product_detail(db: AsyncSession, product_id: int) -> Product:
    """Load one product or component with the relationships needed for a detail read.

    The single entry point for detail reads so base-product and component routes
    load the same nested relationships (e.g. each flat component's ``owner``).
    """
    statement = apply_product_detail_loaders(select(Product).where(Product.id == product_id))
    product = (await db.execute(statement)).scalars().unique().one_or_none()
    return ensure_model_exists(product, Product, product_id)


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
    root_statement = apply_filter(root_statement, product_filter)

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


async def load_all_descendants(db: AsyncSession, root_ids: Iterable[int]) -> dict[int, list[Product]]:
    """Load every component below ``root_ids`` with export relationships, keyed by parent id.

    One query batch per tree level, however many roots or components there are.
    """
    seen = set(root_ids)
    frontier = list(seen)
    children_by_parent_id: defaultdict[int, list[Product]] = defaultdict(list)
    while frontier:
        statement = apply_product_detail_loaders(
            select(Product).where(Product.parent_id.in_(frontier)).order_by(Product.id),
            PRODUCT_EXPORT_RELATIONSHIPS,
        )
        children = [child for child in (await db.execute(statement)).scalars().unique() if child.id not in seen]
        for child in children:
            if child.parent_id is not None:
                children_by_parent_id[child.parent_id].append(child)
        seen.update(child.id for child in children)
        frontier = [child.id for child in children]
    return children_by_parent_id
