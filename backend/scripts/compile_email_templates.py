#!/usr/bin/env python3
"""Compile MJML email templates to HTML.

This script reads MJML templates from app/templates/emails/src/,
expands any {{include:component}} directives from src/components/,
compiles them to HTML, and saves the output to app/templates/emails/build/.
"""

import logging
from pathlib import Path

from mjml.mjml2html import mjml_to_html

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Paths
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent
SRC_DIR = BACKEND_DIR / "app" / "templates" / "emails" / "src"
BUILD_DIR = BACKEND_DIR / "app" / "templates" / "emails" / "build"


def compile_mjml_templates() -> None:
    """Compile all MJML templates in src/ to HTML in build/."""
    if not SRC_DIR.exists():
        logger.error("Source directory not found: %s", SRC_DIR)
        return

    # Create build directory if it doesn't exist
    BUILD_DIR.mkdir(parents=True, exist_ok=True)

    # Find all MJML files
    mjml_files = list(SRC_DIR.glob("*.mjml"))

    if not mjml_files:
        logger.warning("No MJML files found in %s", SRC_DIR)
        return

    logger.info("Found %d MJML template(s) to compile", len(mjml_files))

    # Compile each template
    for mjml_file in mjml_files:
        try:
            logger.info("Compiling %s...", mjml_file.name)

            # Read MJML content
            mjml_content = mjml_file.read_text()

            # Compile to HTML
            html_dotmap = mjml_to_html(mjml_content)
            html_content = html_dotmap.html

            # Write HTML to build directory
            html_file = BUILD_DIR / mjml_file.with_suffix(".html").name
            html_file.write_text(html_content)

            logger.info("  ✓ Compiled to %s", html_file.name)

        except Exception:
            logger.exception("  ✗ Failed to compile %s", mjml_file.name)

    logger.info("Compilation complete!")


if __name__ == "__main__":
    compile_mjml_templates()
