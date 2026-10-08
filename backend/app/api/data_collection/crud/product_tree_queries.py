"""Query helpers for bounded product tree reads."""

from collections import defaultdict
from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy import func, literal, select
from sqlalchemy.orm import selectinload

from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.utils import ensure_model_exists
from app.api.common.sa_typing import orm_attr
from app.api.data_collection.exceptions import ProductExportTooLargeError
from app.api.data_collection.filters import ProductFilterWithRelationships
from app.api.data_collection.models.product import MaterialProductLink, Product

# Bulk pulls belong to the dataset release; components do not count toward this.
EXPORT_MAX_BASE_PRODUCTS = 100
# Components across all exported trees; keeps one export request bounded in time and memory.
EXPORT_MAX_COMPONENTS = 5_000
# Levels of components below a base product, enforced on create and on export.
MAX_COMPONENT_DEPTH = 10

COMPONENTS_RELATIONSHIP = "components"
PRODUCT_READ_SUMMARY_RELATIONSHIPS: frozenset[str] = frozenset({"owner"})
PRODUCT_READ_DETAIL_RELATIONSHIPS: frozenset[str] = frozenset(
    {"owner", "product_type", "videos", "files", "images", "bill_of_materials", COMPONENTS_RELATIONSHIP}
)
# Export walks the tree level by level itself, so it loads no ``components`` per row.
PRODUCT_EXPORT_RELATIONSHIPS: frozenset[str] = PRODUCT_READ_DETAIL_RELATIONSHIPS - {COMPONENTS_RELATIONSHIP}

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable

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


async def _load_levels(
    db: AsyncSession,
    parent_ids: list[int],
    child_statement: Callable[[list[int]], Select[tuple[Product]]],
    *,
    levels: int,
    max_nodes: int | None = None,
) -> tuple[dict[int, list[Product]], list[int]]:
    """Load up to ``levels`` levels of components below ``parent_ids``, one query per level.

    Returns the children keyed by parent id and the ids on the last level loaded, which is
    empty when the walk reached the bottom of the tree. With ``max_nodes``, each level
    query is limited to one row past what is left, and going past it raises
    ``ProductExportTooLargeError`` before the rest of the tree is loaded.
    """
    children_by_parent_id: defaultdict[int, list[Product]] = defaultdict(list)
    frontier = parent_ids
    loaded = 0
    for _ in range(levels):
        if not frontier:
            break
        statement = child_statement(frontier)
        if max_nodes is not None:
            statement = statement.limit(max_nodes - loaded + 1)
        children = list((await db.execute(statement)).scalars().unique().all())
        loaded += len(children)
        if max_nodes is not None and loaded > max_nodes:
            raise ProductExportTooLargeError(MAX_COMPONENT_DEPTH, max_nodes)
        for child in children:
            if child.parent_id is not None:
                children_by_parent_id[child.parent_id].append(child)
        frontier = [child.id for child in children if child.id is not None]
    return children_by_parent_id, frontier


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
    # Components render as ComponentRead, which needs only the owner: the summary profile
    # keeps the class-level eager loads (components, images, bill of materials) from firing.
    root_statement = apply_loader_profile(
        select(Product).where(Product.parent_id == parent_id), Product, PRODUCT_READ_SUMMARY_RELATIONSHIPS
    )
    root_statement = apply_filter(root_statement, product_filter)

    roots = list((await db.execute(root_statement)).scalars().unique().all())
    children_by_parent_id, _ = await _load_levels(
        db,
        [product.id for product in roots if product.id is not None],
        lambda frontier: apply_loader_profile(
            select(Product).where(Product.parent_id.in_(frontier)), Product, PRODUCT_READ_SUMMARY_RELATIONSHIPS
        ),
        levels=max(recursion_depth - 1, 0),
    )
    return ProductTreeData(roots=roots, children_by_parent_id=children_by_parent_id)


async def load_all_descendants(db: AsyncSession, root_ids: Iterable[int]) -> dict[int, list[Product]]:
    """Load every component below ``root_ids`` with export relationships, keyed by parent id.

    One query batch per tree level, however many roots or components there are. Raises
    ``ProductExportTooLargeError`` past ``MAX_COMPONENT_DEPTH`` levels or ``EXPORT_MAX_COMPONENTS``
    components, checked as each level loads.
    """
    # One level past the limit: anything found there means the tree is too deep.
    children_by_parent_id, too_deep = await _load_levels(
        db,
        list(root_ids),
        lambda frontier: apply_product_detail_loaders(
            select(Product).where(Product.parent_id.in_(frontier)).order_by(Product.id),
            PRODUCT_EXPORT_RELATIONSHIPS,
        ),
        levels=MAX_COMPONENT_DEPTH + 1,
        max_nodes=EXPORT_MAX_COMPONENTS,
    )
    if too_deep:
        raise ProductExportTooLargeError(MAX_COMPONENT_DEPTH, EXPORT_MAX_COMPONENTS)
    return children_by_parent_id


async def component_depth(db: AsyncSession, product_id: int) -> int:
    """Return how many levels below its base product ``product_id`` sits (a base product is 0).

    One recursive query up the ``parent_id`` chain, cut off one step past ``MAX_COMPONENT_DEPTH``.
    """
    ancestors = (
        select(Product.parent_id, literal(0).label("depth"))
        .where(Product.id == product_id)
        .cte("product_ancestors", recursive=True)
    )
    ancestors = ancestors.union_all(
        select(Product.parent_id, ancestors.c.depth + 1).where(
            Product.id == ancestors.c.parent_id, ancestors.c.depth <= MAX_COMPONENT_DEPTH
        )
    )
    return (await db.execute(select(func.max(ancestors.c.depth)))).scalar_one()
