"""Common utilities for seeding taxonomies and categories."""

import logging
from typing import TYPE_CHECKING, Any

from sqlmodel import select

from app.api.background_data.models import Category, Taxonomy

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlalchemy.orm import Session


def configure_logging(level: int = logging.INFO) -> None:
    """Configure logging for seeding scripts."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


logger = logging.getLogger("seeding.taxonomies.common")


def get_or_create_taxonomy(
    session: Session,
    name: str,
    version: str,
    description: str | None = None,
    domains: set | None = None,
    source: str | None = None,
) -> Taxonomy:
    """Get existing taxonomy or create a new one."""
    existing: Taxonomy | None = (
        session.execute(select(Taxonomy).where((Taxonomy.name == name) & (Taxonomy.version == version)))
        .scalars()
        .first()
    )

    if existing:
        return existing

    taxonomy = Taxonomy(
        name=name,
        version=version,
        description=description,
        domains=domains or set(),
        source=source,
    )
    session.add(taxonomy)
    session.flush()
    logger.info("Created taxonomy '%s' version '%s' (id: %s)", name, version, taxonomy.id)
    return taxonomy


def seed_categories_from_rows(
    session: Session,
    taxonomy_id: int,
    rows: list[dict[str, Any]],
    get_parent_id_fn: Callable[[dict[str, Any]], str | None],
) -> tuple[int, int]:
    """Seed categories from a list of row dictionaries.

    Args:
        session: Database session
        taxonomy_id: The taxonomy ID to add categories to (must be committed with non-None ID)
        rows: List of dictionaries with category data (must have 'external_id' and 'name')
        get_parent_id_fn: Function that takes a row and returns parent external_id or None

    Returns:
        Tuple of (categories_created, relationships_created)
    """
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
            taxonomy_id=taxonomy_id,
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
