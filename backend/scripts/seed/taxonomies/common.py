"""Common utilities for seeding taxonomies and categories."""

import logging
from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.background_data.models import Category, Taxonomy

logger = logging.getLogger("seeding.taxonomies")


def configure_logging(level: int = logging.INFO) -> None:
    """Configure logging for seeding scripts."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def get_or_create_taxonomy(
    session: Session,
    name: str,
    description: str | None = None,
    domains: set | None = None,
    source: str | None = None,
) -> Taxonomy:
    """Get existing taxonomy or create a new one."""
    existing = session.execute(select(Taxonomy).where(Taxonomy.name == name)).scalars().first()

    if existing:
        logger.info("Taxonomy '%s' already exists (id: %s)", name, existing.id)
        return existing

    taxonomy = Taxonomy(
        name=name,
        description=description,
        domains=domains or set(),
        source=source,
    )
    session.add(taxonomy)
    session.flush()
    logger.info("Created taxonomy '%s' (id: %s)", name, taxonomy.id)
    return taxonomy


def seed_categories_from_rows(
    session: Session,
    taxonomy: Taxonomy,
    rows: list[dict[str, Any]],
    get_parent_id_fn: Callable[[dict[str, Any]], str | None],
) -> tuple[int, int]:
    """Seed categories from a list of row dictionaries.

    Args:
        session: Database session
        taxonomy: The taxonomy to add categories to
        rows: List of dictionaries with category data (must have 'external_id' and 'name')
        get_parent_id_fn: Function that takes a row and returns parent external_id or None

    Returns:
        Tuple of (categories_created, relationships_created)
    """
    # Build a map of external_id -> category for parent lookup
    id_to_category: dict[str, Category] = {}
    parent_relations: dict[str, str] = {}
    count = 0

    logger.info("Creating categories...")

    for row in rows:
        external_id = row["external_id"]
        name = row["name"]

        category = Category(
            name=name,
            external_id=external_id,
            taxonomy_id=taxonomy.id,
        )
        session.add(category)
        id_to_category[external_id] = category

        # Store parent relationship for later processing
        parent_id = get_parent_id_fn(row)
        if parent_id:
            parent_relations[external_id] = parent_id

        count += 1
        if count % 1000 == 0:
            logger.info("Added %d categories...", count)

    # Flush to assign IDs to all categories
    session.flush()
    logger.info("Flushed session - all %d categories now have IDs", count)

    # Set up parent-child relationships
    logger.info("Setting up hierarchy relationships...")
    relationship_count = 0
    for external_id, parent_id in parent_relations.items():
        if parent_id in id_to_category:
            id_to_category[external_id].supercategory_id = id_to_category[parent_id].id
            relationship_count += 1

    return count, relationship_count
