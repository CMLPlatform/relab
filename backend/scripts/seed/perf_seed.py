"""Bulk product seeding for performance baselines.

The dummy seed builds a handful of hand-written products so functional tests can
assert on known names. A latency baseline needs the opposite: enough rows that
pagination, index selectivity and per-row subqueries behave the way they will in
production. This module fills that gap without touching the dummy fixtures.

It deliberately does not reuse ``tests/factories``. Those factories depend on
polyfactory and faker, which live in the test dependency group, and the only
image that can reach the database here is the migrations image -- built with
``--no-default-groups --group=migrations`` and shipped to production. Pulling
test code and test dependencies into that artifact to generate fixtures costs
more than the few generators below.

Two properties matter more than prettiness of the generated text, because both
change what the database actually does:

* **Cardinality.** ``name``, ``brand`` and ``model`` are trigram-indexed and fed
  into ``search_vector``. Drawing them from a short word list makes those indexes
  far more selective than they will ever be in production, so the baseline would
  flatter every search path.
* **Timestamp spread.** The product list sorts on ``created_at``. Inserting every
  row inside one transaction gives them a near-identical timestamp, which makes
  the sort degenerate and keyset/offset pagination unstable between pages.

Rows are generated from a fixed PRNG seed, so the same count produces the same
table on every run. That is what makes one baseline comparable to the next.
"""

import argparse
import asyncio
import logging
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.api.auth.models import User
from app.api.data_collection.models.product import Product
from app.api.reference_data.models import ProductType
from app.core.database import async_session_context, close_async_engine

logger = logging.getLogger(__name__)

BATCH_SIZE = 500
RANDOM_SEED = 20260909
# Rows spread across this window so ordering and range filters on created_at see
# a realistic distribution instead of one timestamp repeated N times.
BACKDATE_DAYS = 730

# Combined multiplicatively rather than picked from flat lists: the products of
# these give ~10k distinct brands and far more distinct names, which is the
# cardinality the trigram indexes would see in production.
BRAND_STEMS = (
    "nova",
    "acme",
    "helio",
    "vertex",
    "orbit",
    "lumen",
    "quanta",
    "atlas",
    "delta",
    "krono",
    "zephyr",
    "cobalt",
    "ferro",
    "silva",
    "mirage",
    "pulsar",
    "tundra",
    "cirrus",
    "onyx",
    "vireo",
)
BRAND_SUFFIXES = ("tech", "works", "labs", "systems", "dynamics", "industries", "electric", "group")
QUALIFIERS = ("compact", "pro", "refurbished", "industrial", "portable", "modular", "recycled", "heavy-duty")
MATERIALS = ("steel", "aluminium", "polymer", "composite", "titanium", "copper", "glass")
CATEGORY_WORDS = ("laptop", "smartphone", "monitor", "kettle", "drill", "router", "printer", "speaker")


def _build_product(rng: random.Random, index: int, owner_ids: list, product_type_ids: list, now: datetime) -> Product:
    brand = f"{rng.choice(BRAND_STEMS)}{rng.choice(BRAND_SUFFIXES)}"
    category = rng.choice(CATEGORY_WORDS)
    return Product(
        name=f"{rng.choice(QUALIFIERS)} {rng.choice(MATERIALS)} {category} {rng.randrange(100, 999)}",
        description=f"Generated perf-baseline {category} in {rng.choice(MATERIALS)}, unit {index:06d}.",
        brand=brand,
        model=f"{brand[:3].upper()}-{rng.randrange(1000, 9999)}-{rng.choice('ABCDEFGH')}",
        product_type_id=rng.choice(product_type_ids),
        owner_id=rng.choice(owner_ids),
        weight_g=round(rng.uniform(50, 5000), 2),
        height_cm=round(rng.uniform(1, 60), 2),
        width_cm=round(rng.uniform(1, 60), 2),
        depth_cm=round(rng.uniform(1, 40), 2),
        created_at=now - timedelta(seconds=rng.randrange(BACKDATE_DAYS * 86400)),
    )


async def seed_perf_products(count: int) -> None:
    """Insert products up to ``count`` rows, skipping the work when they already exist."""
    try:
        await _seed(count, random.Random(RANDOM_SEED))  # noqa: S311 # Fixture data, not cryptography
    finally:
        await close_async_engine()


async def _seed(count: int, rng: random.Random) -> None:
    async with async_session_context() as session:
        existing = await session.scalar(select(func.count()).select_from(Product)) or 0
        if existing >= count:
            logger.info("Product table already holds %s rows (>= %s); skipping perf seed.", existing, count)
            return

        owner_ids = list((await session.scalars(select(User.id))).all())
        product_type_ids = list((await session.scalars(select(ProductType.id))).all())
        if not owner_ids or not product_type_ids:
            msg = "Perf seeding needs seeded users and product types; run the dummy seed first."
            raise SystemExit(msg)

        to_create = count - existing
        now = datetime.now(UTC)
        logger.info("Seeding %s perf products (table has %s, target %s)...", to_create, existing, count)

        for offset in range(0, to_create, BATCH_SIZE):
            session.add_all(
                [
                    _build_product(rng, offset + index, owner_ids, product_type_ids, now)
                    for index in range(min(BATCH_SIZE, to_create - offset))
                ]
            )
            await session.flush()
            # Drop the batch from the identity map; otherwise it grows to the whole table.
            session.expunge_all()

        await session.commit()
        logger.info("Perf seeding complete; product table now holds %s rows.", count)


def main() -> None:
    """Seed the product table up to the requested row count."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(prog="perf_seed", description="Bulk-seed products for perf baselines.")
    parser.add_argument("--count", type=int, required=True, help="Target number of rows in the product table")
    asyncio.run(seed_perf_products(parser.parse_args().count))


if __name__ == "__main__":
    main()
