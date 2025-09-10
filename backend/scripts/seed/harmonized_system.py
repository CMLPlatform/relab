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
HS_CSV_PATH = DATA_DIR / "harmonized-system.csv"
HS_VERSION = "2022"
HS_SOURCE = "https://github.com/datasets/harmonized-system"


def seed_hs_taxonomy() -> None:
    """Seed HS codes as taxonomy and categories using synchronous operations."""
    with sync_session_context() as session:
        # Check if taxonomy already exists
        existing_taxonomy = (
            session.execute(select(Taxonomy).where(Taxonomy.name == f"Harmonized System {HS_VERSION}"))
            .scalars()
            .first()
        )

        if existing_taxonomy:
            print(f"Harmonized System {HS_VERSION} already exists (id: {existing_taxonomy.id})")
            return

        # Create taxonomy
        hs_taxonomy = Taxonomy(
            name=f"Harmonized System {HS_VERSION}",
            description="World Customs Organization's Harmonized System for product classification",
            domains={TaxonomyDomain.PRODUCTS},
            source=HS_SOURCE,
        )
        session.add(hs_taxonomy)
        session.flush()
        print(f"Created Harmonized System {HS_VERSION} taxonomy (id: {hs_taxonomy.id})")

        # Create categories and store parent relationships in one pass
        categories = {}
        parent_relations = {}
        count = 0
        print("Creating categories...")

        with HS_CSV_PATH.open(encoding="utf-8") as f:
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
                    taxonomy_id=hs_taxonomy.id,
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
    seed_hs_taxonomy()
