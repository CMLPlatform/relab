"""Realistic bulk fixtures for CI, E2E and performance baselines.

The dummy seed builds a handful of hand-written rows so functional tests can
assert on known names. Anything that measures behaviour at scale needs the
opposite: enough rows, with enough variety, that pagination, index selectivity
and per-row work behave the way they will in production.

Rows come from ``scripts.seed.factories``, the same polyfactory/faker factories
the test suite builds fixtures with. Sharing one generator is the point: a
fixture a test asserts against and a row a latency baseline measures should not
drift apart. Those factories are seeded from ``TEST_SEED``, so a given row count
produces the same tables on every run, which is what makes one baseline
comparable to the next.

Three properties matter more than the text looking plausible, because each one
changes what the database actually does:

* **Cardinality.** ``name``, ``brand`` and ``model`` are trigram-indexed and feed
  ``search_vector``. Faker gives these realistic variety; a short word list would
  make those indexes far more selective than they will ever be in production.
* **Timestamp spread.** The product list sorts on ``created_at``. Rows inserted
  in one transaction share a timestamp, which makes that sort degenerate and
  offset pagination unstable between pages.
* **Images that exist on disk.** ``thumbnail_url`` derivation stats the storage
  root per row, so image rows have to point at real files or the media
  serialisation path is skipped entirely.
"""

import argparse
import asyncio
import logging
import random
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError

from app.api.auth.models import User
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Image, MediaParentType
from app.api.reference_data.models import Category, Material, ProductType
from app.core.database import async_engine, async_session_context, close_async_engine

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.common.models.base import Base
    from scripts.seed.factories.models import BaseModelFactory


logger = logging.getLogger(__name__)

BATCH_SIZE = 500
RANDOM_SEED = 20260909
# Rows spread across this window so ordering and range filters on created_at see
# a distribution rather than one timestamp repeated N times.
BACKDATE_DAYS = 730
# Share of products carrying an image, and the share carrying components. Both
# well under half: most real products have neither, and a fixture where every row
# has everything measures a workload nobody runs.
IMAGE_SHARE = 0.2
COMPONENT_SHARE = 0.1
MAX_COMPONENTS = 4
NAME_MAX = 100
DESCRIPTION_MAX = 500

# Reference tables scale with the product count rather than being pinned: the
# lookup endpoints page over them, and measuring those against four rows says
# nothing. The ratios are rough production shape, not measurements.
REFERENCE_RATIOS = {"users": 0.04, "product_types": 0.06, "materials": 0.1, "categories": 0.4}
REFERENCE_MINIMUMS = {"users": 5, "product_types": 10, "materials": 20, "categories": 50}


def require_fixture_seed_deps() -> None:
    """Fail with an actionable message when the optional fixture deps are absent."""
    try:
        import faker  # noqa: F401, PLC0415
        import polyfactory  # noqa: F401, PLC0415
    except ImportError as exc:
        msg = (
            "Bulk seeding requires the optional seed-fixtures dependency group. "
            "Rebuild backend/Dockerfile.migrations with INCLUDE_FIXTURE_SEED_DEPS=true to enable it."
        )
        raise SystemExit(msg) from exc


async def seed_bulk_fixtures(products: int) -> None:
    """Seed reference data, products, components and images up to ``products`` rows."""
    require_fixture_seed_deps()
    try:
        await _seed(products)
    finally:
        await close_async_engine()


def _target(kind: str, products: int) -> int:
    return max(REFERENCE_MINIMUMS[kind], int(products * REFERENCE_RATIOS[kind]))


async def _seed(products: int) -> None:
    # Imported inside the function, not at module scope: the production migrations
    # image ships this file but not faker/polyfactory, and importing it there must
    # not explode. require_fixture_seed_deps gives the actionable error first.
    from scripts.seed.factories.models import (  # noqa: PLC0415
        CategoryFactory,
        MaterialFactory,
        ProductFactory,
        ProductTypeFactory,
        UserFactory,
    )

    rng = random.Random(RANDOM_SEED)  # noqa: S311 # Fixture data, not cryptography
    now = datetime.now(UTC)

    async with async_session_context() as session:
        existing = await session.scalar(select(func.count()).select_from(Product)) or 0
        if existing >= products:
            logger.info("Product table already holds %s rows (>= %s); skipping bulk seed.", existing, products)
            return

        await _top_up(session, User, UserFactory, _target("users", products), "users", _uniquify_user)
        await _top_up(session, ProductType, ProductTypeFactory, _target("product_types", products), "product types")
        await _top_up(session, Material, MaterialFactory, _target("materials", products), "materials")
        await _top_up_categories(session, CategoryFactory, _target("categories", products))

        owner_ids = list((await session.scalars(select(User.id))).all())
        type_ids = list((await session.scalars(select(ProductType.id))).all())
        if not owner_ids or not type_ids:
            msg = "Bulk seeding needs users and product types; run the dummy seed first."
            raise SystemExit(msg)

        # Existing stored files, reused so generated image rows point at paths that
        # really are on disk and the thumbnail stat path is actually exercised.
        stored_files = list((await session.scalars(select(Image.file).limit(20))).all())
        if not stored_files:
            logger.warning("No stored images to reuse; media serialisation will not be exercised.")

        to_create = products - existing
        logger.info("Seeding %s products (table has %s, target %s)...", to_create, existing, products)

        for offset in range(0, to_create, BATCH_SIZE):
            size = min(BATCH_SIZE, to_create - offset)
            batch = []
            for _ in range(size):
                product = ProductFactory.build()
                _prepare(product, rng, owner_ids, type_ids, now)
                batch.append(product)
            session.add_all(batch)
            await session.flush()
            _attach_children(session, batch, rng, owner_ids, type_ids, now, stored_files)
            await session.flush()
            session.expunge_all()

        await session.commit()
        logger.info("Bulk seeding complete; %s products created.", to_create)

    await _settle_after_bulk_load()


def _prepare(product: Product, rng: random.Random, owner_ids: list, type_ids: list, now: datetime) -> None:
    """Fill the columns the factory leaves empty because they are nullable."""
    product.id = None
    product.owner_id = rng.choice(owner_ids)
    product.product_type_id = rng.choice(type_ids)
    product.weight_g = round(rng.uniform(50, 5000), 2)
    product.height_cm = round(rng.uniform(1, 60), 2)
    product.width_cm = round(rng.uniform(1, 60), 2)
    product.depth_cm = round(rng.uniform(1, 40), 2)
    product.created_at = now - timedelta(seconds=rng.randrange(BACKDATE_DAYS * 86400))
    # name is String(100) and description String(500); faker occasionally runs long,
    # and an overflow would only surface at insert time.
    product.name = product.name[:NAME_MAX]
    if product.description:
        product.description = product.description[:DESCRIPTION_MAX]


def _attach_children(
    session: AsyncSession,
    batch: list[Product],
    rng: random.Random,
    owner_ids: list,
    type_ids: list,
    now: datetime,
    stored_files: list,
) -> None:
    """Give a share of the batch components and images."""
    from scripts.seed.factories.models import ProductFactory  # noqa: PLC0415

    extras: list[Any] = []
    for parent in batch:
        if parent.id is None:
            continue
        if stored_files and rng.random() < IMAGE_SHARE:
            extras.append(
                Image(
                    filename="fixture.webp",
                    file=rng.choice(stored_files),
                    upload_size_bytes=rng.randrange(20_000, 400_000),
                    width_px=rng.choice([800, 1200, 1600]),
                    height_px=rng.choice([600, 900, 1200]),
                    parent_type=MediaParentType.PRODUCT,
                    parent_id=parent.id,
                    created_at=parent.created_at,
                )
            )
        if rng.random() < COMPONENT_SHARE:
            for _ in range(rng.randrange(1, MAX_COMPONENTS + 1)):
                component = ProductFactory.build()
                _prepare(component, rng, owner_ids, type_ids, now)
                component.parent_id = parent.id
                component.amount_in_parent = rng.randrange(1, 5)
                extras.append(component)
    if extras:
        session.add_all(extras)


def _uniquify_user(user: User, index: int) -> None:
    """Give each generated user a unique email and username.

    Faker draws from a finite pool, so a few hundred users collide on
    ``ix_user_email`` long before the table is big enough to measure against.
    """
    local, _, domain = user.email.partition("@")
    user.email = f"{local}+bulk{index}@{domain or 'example.com'}"
    user.username = f"{user.username}{index}"


async def _top_up(
    session: AsyncSession,
    model: type[Base],
    factory: type[BaseModelFactory[Any]],
    target: int,
    label: str,
    prepare: Callable[[Any, int], None] | None = None,
) -> None:
    """Insert rows of ``model`` until the table holds ``target`` of them."""
    existing = await session.scalar(select(func.count()).select_from(model)) or 0
    if existing >= target:
        return
    rows = []
    for index in range(target - existing):
        row = factory.build()
        # Polyfactory fills integer primary keys with generated values, which
        # collide with rows already in the table. UUID keys it generates are
        # fine, so only autoincrement ones get handed back to the database.
        if isinstance(getattr(row, "id", None), int):
            row.id = None
        if prepare is not None:
            prepare(row, existing + index)
        rows.append(row)
    session.add_all(rows)
    await session.flush()
    logger.info("Seeded %s %s (table now holds %s).", target - existing, label, target)


async def _top_up_categories(session: AsyncSession, factory: type[BaseModelFactory[Any]], target: int) -> None:
    """Categories hang off a taxonomy, so they cannot use the generic helper."""
    existing = await session.scalar(select(func.count()).select_from(Category)) or 0
    if existing >= target:
        return
    taxonomy_ids = list((await session.scalars(select(Category.taxonomy_id).distinct())).all())
    if not taxonomy_ids:
        logger.warning("No taxonomy to hang categories from; skipping category scaling.")
        return
    rows = []
    for _ in range(target - existing):
        row = factory.build()
        row.id = None
        row.taxonomy_id = taxonomy_ids[0]
        rows.append(row)
    session.add_all(rows)
    await session.flush()
    logger.info("Seeded %s categories (table now holds %s).", target - existing, target)


async def _settle_after_bulk_load() -> None:
    """Vacuum and analyse the bulk-loaded tables.

    Without this the fixture measures the database recovering from its own load
    rather than steady state: planner statistics still describe an almost empty
    table, and the four GIN indexes on ``product`` carry a full pending list,
    whose cleanup showed up as multi-second stalls in write latency.

    Hygiene rather than correctness, so a user without VACUUM rights on a table
    logs a warning instead of failing the seed.
    """
    for table in ("product", "image", "category", "material", "producttype", '"user"'):
        try:
            async with async_engine.connect() as connection:
                await connection.execution_options(isolation_level="AUTOCOMMIT")
                await connection.execute(text(f"VACUUM ANALYZE {table}"))  # fixed table list
        except SQLAlchemyError as exc:
            logger.warning("Could not vacuum/analyse %s: %s", table, exc)
    logger.info("Vacuumed and analysed the bulk-loaded tables.")


def main() -> None:
    """Seed bulk fixtures up to the requested product count."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(prog="bulk_seed", description="Seed realistic bulk fixtures.")
    parser.add_argument("--products", type=int, required=True, help="Target number of base products")
    asyncio.run(seed_bulk_fixtures(parser.parse_args().products))


if __name__ == "__main__":
    main()
