"""Seed Common Procurement Vocabulary (CPV) codes as taxonomy and categories."""

import argparse
import logging
import re
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from sqlmodel import select

from app.api.auth.models import User  # noqa: F401 # Need to explictly import User for SQLModel relationships
from app.api.background_data.models import (
    Category,
    ProductType,  # Adjust import as needed
    TaxonomyDomain,
)
from app.core.database import sync_session_context
from scripts.seed.taxonomies.common import configure_logging, get_or_create_taxonomy, seed_categories_from_rows

logger = logging.getLogger("seeding.taxonomies.cpv")

# Configuration
DATA_DIR = Path(__file__).parents[3] / "data" / "seed"
EXCEL_PATH = DATA_DIR / "cpv.xlsx"
TAXONOMY_NAME = "Common Procurement Vocabulary"
TAXONOMY_VERSION = "2008"
TAXONOMY_SOURCE = "https://ted.europa.eu/documents/d/ted/cpv_2008_xls"
TAXONOMY_DESCRIPTION = "EU standard classification system for public procurement"

# Relevant sections to include
RELEVANT_SECTIONS = {
    "03000000",  # Agricultural, farming, fishing, forestry and related products
    "09000000",  # Petroleum products, fuel, electricity and other sources of energy
    "14000000",  # Mining, basic metals and related products
    "15000000",  # Food, beverages, tobacco and related products
    "16000000",  # Agricultural machinery
    "18000000",  # Clothing, footwear, luggage articles and accessories
    "19000000",  # Leather and textile fabrics, plastic and rubber materials
    "22000000",  # Printed matter and related products
    "24000000",  # Chemical products
    "30000000",  # Office and computing machinery, equipment and supplies except furniture and software packages
    "31000000",  # Electrical machinery, apparatus, equipment and consumables; Lighting
    "32000000",  # Radio, television, communication, telecommunication and related equipment
    "33000000",  # Medical equipments, pharmaceuticals and personal care products
    "34000000",  # Transport equipment and auxiliary products to transportation
    "35000000",  # Security, fire-fighting, police and defence equipment
    "37000000",  # Musical instruments, sport goods, games, toys, handicraft, art materials and accessories
    "38000000",  # Laboratory, optical and precision equipments (excl. glasses)
    "42000000",  # Industrial machinery
    "43000000",  # Machinery for mining, quarrying, construction equipment
    "44000000",  # Construction structures and materials; auxiliary products to construction (exc. electric apparatus)
}


def download_cpv_excel(excel_path: Path = EXCEL_PATH, source_url: str = TAXONOMY_SOURCE) -> None:
    """Download the CPV ZIP file and extract the Excel file if not present."""
    if excel_path.exists():
        logger.info("CPV Excel file already exists at %s, skipping download.", excel_path)
        return

    excel_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info("Downloading CPV ZIP file from %s...", source_url)
    try:
        response = requests.get(source_url, timeout=10)
    except requests.RequestException:
        logger.exception("Error downloading CPV ZIP file")
        return

    if response.status_code == 200:
        with zipfile.ZipFile(BytesIO(response.content)) as zf:
            # Find the first .xls or .xlsx file in the zip
            for name in zf.namelist():
                if name.lower().endswith((".xls", ".xlsx")):
                    with zf.open(name) as extracted, excel_path.open("wb") as out_f:
                        out_f.write(extracted.read())
                    logger.info("Extracted %s to %s", name, excel_path)
                    break
            else:
                err_msg = "No Excel file found in the ZIP archive."
                logger.error(err_msg)
                raise RuntimeError(err_msg)
    else:
        err_msg = f"Failed to download CPV ZIP file from {source_url} (status code {response.status_code})"
        logger.error(err_msg)
        raise RuntimeError(err_msg)


def load_cpv_rows_from_excel(
    excel_path: Path,
    relevant_sections: set[str] | None = RELEVANT_SECTIONS,
    language_col: str = "EN",
    cpv_code_col: str = "CODE",
) -> list[dict[str, Any]]:
    """Load CPV codes and English descriptions from the 'CPV codes' sheet, using pandas vectorized operations."""
    df = pd.read_excel(excel_path, sheet_name="CPV codes")

    # Ensure required columns exist
    if language_col not in df.columns or cpv_code_col not in df.columns:
        msg = f"Excel sheet must have 'CODE' and '{language_col}' columns."
        raise ValueError(msg)

    # Remove post-dash digit (on present in excel file, not part of CPV)
    df["external_id"] = df[cpv_code_col].astype(str).str.strip().str.split("-").str[0]
    df["name"] = df[language_col].astype(str).str.strip().str[:250]  # Truncate to 250 chars to fit DB

    # Filter to only relevant sections and their children
    if relevant_sections:
        # Get non-zero prefix for each section
        section_prefixes = [s.rstrip("0") for s in relevant_sections]
        df = df[df["external_id"].apply(lambda x: any(x.startswith(prefix) for prefix in section_prefixes))]

    # Select only the needed columns and convert to list of dicts
    return df[["external_id", "name"]].to_dict(orient="records")


def get_cpv_parent_id(row: dict[str, Any]) -> str | None:
    """Get parent code by zeroing the rightmost non-zero digit."""
    code = str(row["external_id"])

    # Use regex to replace the rightmost non-zero digit with '0'
    parent_code = re.sub(r"([1-9])([^1-9]*)$", r"0\2", code)
    if set(parent_code) == {"0"}:  # Top-level, no parent
        return None
    return parent_code


def seed_taxonomy(excel_path: Path = EXCEL_PATH) -> None:
    """Seed CPV taxonomy and categories."""
    # Ensure Excel is downloaded
    download_cpv_excel()

    logger.info("Starting %s %s seeding...", TAXONOMY_NAME, TAXONOMY_VERSION)

    with sync_session_context() as session:
        # Get or create taxonomy
        taxonomy = get_or_create_taxonomy(
            session,
            name=f"{TAXONOMY_NAME} {TAXONOMY_VERSION}",
            description=TAXONOMY_DESCRIPTION,
            domains={TaxonomyDomain.PRODUCTS},
            source=TAXONOMY_SOURCE,
        )

        # If taxonomy already existed, skip seeding
        existing_count = session.query(Category).filter_by(taxonomy_id=taxonomy.id).count()
        if existing_count > 0:
            logger.info("Taxonomy already has %d categories, skipping seeding", existing_count)
            return

        # Load rows from Excel
        rows = load_cpv_rows_from_excel(excel_path)
        logger.info("Loaded %d CPV codes from Excel", len(rows))

        # Seed categories
        cat_count, rel_count = seed_categories_from_rows(session, taxonomy, rows, get_parent_id_fn=get_cpv_parent_id)

        # Commit
        session.commit()
        logger.info("✓ Added %s taxonomy with %d categories and %d relationships", TAXONOMY_NAME, cat_count, rel_count)


def seed_product_types(excel_path: Path = EXCEL_PATH) -> None:
    """Seed product types from CPV codes.

    Note: this is a temporary measure until we have an improved link between product types and categories.
    """
    product_types_created = 0

    # Ensure Excel is downloaded
    download_cpv_excel()

    logger.info("Starting %s %s seeding...", TAXONOMY_NAME, TAXONOMY_VERSION)

    with sync_session_context() as session:
        rows = load_cpv_rows_from_excel(excel_path)
        logger.info("Loaded %d CPV codes from Excel", len(rows))

        for row in rows:
            # Remove trailing zeros for product type code for cosmetic reasons
            cpv_code = row["external_id"].rstrip("0")
            cpv_description = row["name"]

            # Check if product type already exists
            existing = session.exec(select(ProductType).where(ProductType.name == cpv_code)).first()
            if existing:
                continue

            # Create product type
            pt = ProductType(name=cpv_code, description=cpv_description)
            session.add(pt)
            product_types_created += 1

        session.commit()
        logger.info("Seeded %d product types from CPV codes", product_types_created)


if __name__ == "__main__":
    configure_logging()

    # Parse command-line arguments
    parser = argparse.ArgumentParser(description="Seed CPV taxonomy and optionally product types")
    parser.add_argument("--seed-product-types", action="store_true", help="Also seed product types from CPV codes")
    args = parser.parse_args()

    # Seed taxonomy
    seed_taxonomy()

    # Optionally seed product types
    if args.seed_product_types:
        seed_product_types()
