"""Seed Harmonized System (HS) codes as taxonomy and categories."""

import csv
from pathlib import Path

from sqlalchemy import select

from app.api.background_data.models import (
    Category,
    Taxonomy,
    TaxonomyDomain,
)
from app.core.database import sync_session_context

# Configuration
DATA_DIR = Path(__file__).parents[2] / "data" / "seed"
CPV_ODS_PATH = DATA_DIR / "cpv.xlsx"
CPV_VERSION = "2008"
CPV_SOURCE = "from https://ted.europa.eu/documents/d/ted/cpv_2008_ods"


def seed_cpv_taxonomy() -> None:
    """Seed HS codes as taxonomy and categories using synchronous operations."""
    with sync_session_context() as session:
        # Check if taxonomy already exists
        existing_taxonomy = (
            session.execute(select(Taxonomy).where(Taxonomy.name == f"Harmonized System {CPV_VERSION}"))
            .scalars()
            .first()
        )

        if existing_taxonomy:
            print(f"Harmonized System {CPV_VERSION} already exists (id: {existing_taxonomy.id})")
            return

        # Create taxonomy
        cpv_taxonomy = Taxonomy(
            name=f"Harmonized System {CPV_VERSION}",
            description="World Customs Organization's Harmonized System for product classification",
            domains={TaxonomyDomain.PRODUCTS},
            source=CPV_SOURCE,
        )
        session.add(cpv_taxonomy)
        session.flush()
        print(f"Created Harmonized System {CPV_VERSION} taxonomy (id: {cpv_taxonomy.id})")

        # Create categories and store parent relationships in one pass
        categories = {}
        parent_relations = {}
        count = 0
        print("Creating categories...")

        with CPV_XLS_PATH.open(encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                section = row.get("section", "").strip()

                # Only keep relevant sections. See also https://www.wcotradetools.org/en/harmonized-system
                if section not in {
                    "VII",  # Plastics
                    "X",  # Paper
                    "XV",  # Metals
                    "XVI",  # Machinery
                }:
                    continue

                hscode = row["hscode"].strip()
                description = row["description"].strip()
                parent_code = row["parent"].strip()

                category = Category(
                    name=description,
                    external_id=hscode,
                    taxonomy_id=cpv_taxonomy.id,
                )
                session.add(category)
                categories[hscode] = category

                # Store parent relationship (if not TOTAL) for later processing
                if parent_code != "TOTAL":
                    parent_relations[hscode] = parent_code

                count += 1
                if count % 1000 == 0:
                    print(f"Added {count} categories...")

        # Flush session to assign IDs to all categories
        session.flush()
        print(f"Flushed session - all {count} categories now have IDs")

        # Set up parent-child relationships in a single pass
        print("Setting up hierarchy relationships...")
        relationship_count = 0
        for hscode, parent_code in parent_relations.items():
            if parent_code in categories:
                categories[hscode].supercategory_id = categories[parent_code].id
                relationship_count += 1

        # Final commit
        session.commit()
        print(f"Added Harmonized System taxonomy with {count} categories and {relationship_count} relationships")


if __name__ == "__main__":
    seed_CPV_taxonomy()
