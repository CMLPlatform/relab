#!/usr/bin/env python3

"""Compile MJML email templates to HTML.

This script reads MJML templates from app/templates/emails/src/,
expands any {{include:component}} directives from src/components/,
compiles them to HTML, and saves the output to app/templates/emails/build/.
"""

import logging
import re
from pathlib import Path

from mjml.mjml2html import mjml_to_html

from app.core.logging import setup_logging

# Set up logging
setup_logging()
logger = logging.getLogger(__name__)

# Paths
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parents[1]
SRC_DIR = BACKEND_DIR / "app" / "templates" / "emails" / "src"
BUILD_DIR = BACKEND_DIR / "app" / "templates" / "emails" / "build"
INCLUDE_PATTERN = re.compile(r"{{\s*include:([a-zA-Z0-9_-]+)\s*}}")
BRAND_TOKEN_PATTERN = re.compile(r"{{\s*brand:(--[a-zA-Z0-9_-]+)\s*}}")
CSS_ROOT_PATTERN = re.compile(r":root\s*\{(?P<body>.*?)\}", re.DOTALL)
CSS_TOKEN_PATTERN = re.compile(r"^\s*(--[a-zA-Z0-9_-]+):\s*([^;]+);", re.MULTILINE)
BRAND_CSS_PATH = BACKEND_DIR.parent / "assets" / "brand" / "brand.css"


def expand_includes(mjml_content: str) -> str:
    """Expand component include directives in MJML content."""

    def replace_include(match: re.Match[str]) -> str:
        component_name = match.group(1)
        component_path = SRC_DIR / "components" / f"{component_name}.mjml"
        return component_path.read_text()

    return INCLUDE_PATTERN.sub(replace_include, mjml_content)


def load_brand_tokens() -> dict[str, str]:
    """Load email-safe brand tokens from the canonical web brand CSS."""
    brand_css = BRAND_CSS_PATH.read_text()
    root_match = CSS_ROOT_PATTERN.search(brand_css)
    if root_match is None:
        msg = f"Could not find :root brand tokens in {BRAND_CSS_PATH}"
        raise RuntimeError(msg)
    return {name: value.strip() for name, value in CSS_TOKEN_PATTERN.findall(root_match.group("body"))}


def expand_brand_tokens(mjml_content: str, brand_tokens: dict[str, str]) -> str:
    """Expand {{brand:--token}} directives from assets/brand/brand.css."""

    def replace_token(match: re.Match[str]) -> str:
        token_name = match.group(1)
        try:
            token_value = brand_tokens[token_name]
        except KeyError as exc:
            msg = f"Unknown brand token {token_name}"
            raise RuntimeError(msg) from exc
        if token_value.startswith('"') and token_value.endswith('"'):
            return f"'{token_value[1:-1]}'"
        return token_value

    return BRAND_TOKEN_PATTERN.sub(replace_token, mjml_content)


def compile_mjml_templates() -> None:
    """Compile all MJML templates in src/ to HTML in build/."""
    if not SRC_DIR.exists():
        logger.error("Source directory not found: %s", SRC_DIR)
        return

    # Create build directory if it doesn't exist
    BUILD_DIR.mkdir(parents=True, exist_ok=True)

    # Find all MJML files (sorted by modification time to reflect creation order)
    mjml_files = sorted(SRC_DIR.glob("*.mjml"), key=lambda p: p.stat().st_mtime)

    if not mjml_files:
        logger.warning("No MJML files found in %s", SRC_DIR)
        return

    logger.info("Found %d MJML template(s) to compile", len(mjml_files))
    failed_templates: list[str] = []
    brand_tokens = load_brand_tokens()

    # Compile each template
    for mjml_file in mjml_files:
        try:
            logger.info("Compiling %s...", mjml_file.name)

            # Read MJML content
            mjml_content = expand_includes(mjml_file.read_text())
            mjml_content = expand_brand_tokens(mjml_content, brand_tokens)

            # Compile to HTML
            html_dotmap = mjml_to_html(mjml_content)
            html_content = html_dotmap.html

            # Write HTML to build directory
            html_file = BUILD_DIR / mjml_file.with_suffix(".html").name
            html_file.write_text(html_content)

            logger.info("  ✅ Compiled to %s", html_file.name)

        except Exception:
            logger.exception("  ✗ Failed to compile %s", mjml_file.name)
            failed_templates.append(mjml_file.name)

    if failed_templates:
        failed = ", ".join(failed_templates)
        msg = f"Failed to compile {len(failed_templates)} MJML template(s): {failed}"
        raise RuntimeError(msg)

    logger.info("Compilation complete!")


def main() -> None:
    """Entry point for the compile email templates script."""
    compile_mjml_templates()


if __name__ == "__main__":
    main()
