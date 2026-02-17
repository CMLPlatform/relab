"""Seed Harmonized System (HS) codes as taxonomy and categories."""

import csv
import logging
from pathlib import Path
from typing import Any

import pandas as pd
from sqlmodel import func, select

# TODO: Fix circular import issue with User model in seeding scripts
from app.api.auth.models import User  # noqa: F401 # Need to explicitly import User for SQLModel relationships
from app.api.background_data.models import Category, TaxonomyDomain
from app.core.database import sync_session_context
from scripts.seed.taxonomies.common import configure_logging, get_or_create_taxonomy, seed_categories_from_rows

logger = logging.getLogger("seeding.taxonomies.harmonized_system")

# Configuration
DATA_DIR = Path(__file__).parents[3] / "data" / "seed"
CSV_PATH = DATA_DIR / "harmonized-system.csv"
TAXONOMY_NAME = "Harmonized System (HS)"
TAXONOMY_VERSION = "2022"
TAXONOMY_SOURCE = "https://github.com/datasets/harmonized-system/blob/main/data/harmonized-system.csv"
TAXONOMY_DESCRIPTION = "World Customs Organization's Harmonized standard taxonomy for product classification"

# Relevant sections to include
RELEVANT_SECTIONS = {
    "VII",  # Plastics
    "X",  # Paper
    "XV",  # Metals
    "XVI",  # Machinery
}

TOTAL_CODE = "TOTAL"  # Special code indicating top-level category with no parent


def download_hs_csv(csv_path: Path = CSV_PATH, source_url: str = TAXONOMY_SOURCE) -> None:
    """Download the HS CSV file if not present."""
    if csv_path.exists():
        logger.info("HS CSV file already exists at %s, skipping download.", csv_path)
        return

    csv_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info("Downloading HS CSV file from %s...", source_url)
    df = pd.read_csv(source_url)
    df.to_csv(csv_path, index=False)
    logger.info("Downloaded and saved HS CSV file to %s", csv_path)


def load_hs_rows_from_csv(csv_path: Path) -> list[dict[str, Any]]:
    """Load HS codes from CSV, filtering by relevant sections."""
    rows = []

    with csv_path.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            section = row.get("section", "").strip()

            # Filter by relevant sections
            if section not in RELEVANT_SECTIONS:
                continue

            rows.append(
                {
                    "external_id": row["hscode"].strip(),
                    "name": row["description"].strip()[:250],  # Truncate to 250 chars to fit DB
                    "parent_id": row["parent"].strip(),
                }
            )

    return rows


def get_hs_parent_id(row: dict[str, Any]) -> str | None:
    """Get parent external_id for an HS code row (returns None if parent is 'TOTAL')."""
    parent_id = row.get("parent_id", "").strip()
    return parent_id if parent_id != TOTAL_CODE else None


def seed_taxonomy() -> None:
    """Seed Harmonized System taxonomy and categories."""
    # Ensure CSV is downloaded
    download_hs_csv()

    logger.info("Starting %s %s seeding...", TAXONOMY_NAME, TAXONOMY_VERSION)

    with sync_session_context() as session:
        # Get or create taxonomy
        taxonomy = get_or_create_taxonomy(
            session,
            name=TAXONOMY_NAME,
            version=TAXONOMY_VERSION,
            description=TAXONOMY_DESCRIPTION,
            domains={TaxonomyDomain.PRODUCTS},
            source=TAXONOMY_SOURCE,
        )

        if taxonomy.id is None:
            # TODO: Refactor base models so that comitted database objects always have non-None ID to avoid this check
            logger.error(
                "Taxonomy '%s' version '%s' has no ID after creation, cannot seed categories.",
                TAXONOMY_NAME,
                TAXONOMY_VERSION,
            )
            return

        # If taxonomy already existed, skip seeding
        existing_count = session.exec(select(func.count(Category.id)).where(Category.taxonomy_id == taxonomy.id)).one()

        if existing_count > 0:
            logger.info("Taxonomy already has %d categories, skipping seeding", existing_count)
            return

        # Load rows from CSV
        rows = load_hs_rows_from_csv(CSV_PATH)

        # Seed categories
        cat_count, rel_count = seed_categories_from_rows(session, taxonomy.id, rows, get_parent_id_fn=get_hs_parent_id)

        # Commit
        session.commit()
        logger.info(
            "✓ Added %s taxonomy (version %s) with %d categories and %d relationships",
            TAXONOMY_NAME,
            TAXONOMY_VERSION,
            cat_count,
            rel_count,
        )


if __name__ == "__main__":
    configure_logging()
    seed_taxonomy()
