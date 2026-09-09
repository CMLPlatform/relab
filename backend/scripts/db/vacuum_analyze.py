"""Vacuum and analyse tables after a bulk load.

A bulk insert leaves two things behind that make the database behave unlike its
steady state: planner statistics still describing the table as it was before the
load, and GIN indexes carrying a full pending list. Queries then get plans built
for the wrong row count, and the first writes afterwards pay for the index
cleanup -- measured at a 6.5s p95 against a 79ms median on the product table.

Anything that loads a lot of rows at once should end here: the fixture seeder,
and the taxonomy seeders, which import thousands of categories on a deploy.
"""

import argparse
import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import async_engine, close_async_engine

logger = logging.getLogger(__name__)

# Identifiers are interpolated into DDL, so callers pass names from a fixed list
# rather than anything reaching this from a request.
BULK_LOADED_TABLES = ("product", "image", "category", "material", "producttype", '"user"')
TAXONOMY_TABLES = ("category", "producttype", "taxonomy", "material")

BULK = "bulk"
TABLE_SETS = {BULK: BULK_LOADED_TABLES, "taxonomy": TAXONOMY_TABLES}


async def vacuum_analyze(tables: tuple[str, ...]) -> None:
    """Vacuum and analyse each table, warning rather than failing on refusal."""
    for table in tables:
        try:
            async with async_engine.connect() as connection:
                await connection.execution_options(isolation_level="AUTOCOMMIT")
                await connection.execute(text(f"VACUUM ANALYZE {table}"))  # fixed identifier list
        except SQLAlchemyError as exc:
            # Hygiene, not correctness: a role without VACUUM rights on a table
            # must not fail a deploy.
            logger.warning("Could not vacuum/analyse %s: %s", table, exc)
    logger.info("Vacuumed and analysed: %s", ", ".join(tables))


def main() -> None:
    """Vacuum and analyse a named table set."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(prog="vacuum_analyze", description="Vacuum and analyse bulk-loaded tables.")
    parser.add_argument("--tables", choices=list(TABLE_SETS), default=BULK)
    tables = TABLE_SETS[parser.parse_args().tables]

    async def run() -> None:
        try:
            await vacuum_analyze(tables)
        finally:
            await close_async_engine()

    asyncio.run(run())


if __name__ == "__main__":
    main()
