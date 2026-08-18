#!/usr/bin/env python3

"""Compile MJML email templates to HTML.

This script reads MJML templates from app/templates/emails/src/,
expands any {{include:component}} directives from src/components/,
compiles them to HTML, and saves the output to app/templates/emails/build/.
"""

import logging
import re
import sys
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
BRAND_CSS_PATH = BACKEND_DIR.parent / "assets" / "brand.css"

# Bracket tokens for scanning a CSS function's top-level argument separator.
OPENING_BRACKETS = "(["
CLOSING_BRACKETS = ")]"
ARGUMENT_SEPARATOR = ","


def expand_includes(mjml_content: str) -> str:
    """Expand component include directives, including ones nested in components."""

    def replace_include(match: re.Match[str]) -> str:
        component_name = match.group(1)
        component_path = SRC_DIR / "components" / f"{component_name}.mjml"
        return component_path.read_text()

    # Re-scan until stable so an {{include}} inside an included component is also
    # expanded; bounded to fail loudly on a circular include instead of looping.
    for _ in range(10):
        expanded = INCLUDE_PATTERN.sub(replace_include, mjml_content)
        if expanded == mjml_content:
            return expanded
        mjml_content = expanded
    msg = "MJML include expansion did not stabilize (circular include?)"
    raise RuntimeError(msg)


def resolve_light_value(value: str) -> str:
    """Collapse a light-dark(light, dark) CSS value down to its light-mode branch.

    Email clients don't support light-dark(), so email tokens keep using the
    same light-mode value they always resolved to before brand.css adopted it.
    """
    if not (value.startswith("light-dark(") and value.endswith(")")):
        return value

    inner = value[len("light-dark(") : -1]
    depth = 0
    for index, char in enumerate(inner):
        if char in OPENING_BRACKETS:
            depth += 1
        elif char in CLOSING_BRACKETS:
            depth -= 1
        elif char == ARGUMENT_SEPARATOR and depth == 0:
            return inner[:index].strip()

    msg = f"Could not split light-dark() value: {value}"
    raise RuntimeError(msg)


def load_brand_tokens() -> dict[str, str]:
    """Load email-safe brand tokens from the canonical web brand CSS."""
    brand_css = BRAND_CSS_PATH.read_text()
    root_match = CSS_ROOT_PATTERN.search(brand_css)
    if root_match is None:
        msg = f"Could not find :root brand tokens in {BRAND_CSS_PATH}"
        raise RuntimeError(msg)
    return {
        name: resolve_light_value(value.strip()) for name, value in CSS_TOKEN_PATTERN.findall(root_match.group("body"))
    }


def expand_brand_tokens(mjml_content: str, brand_tokens: dict[str, str]) -> str:
    """Expand {{brand:--token}} directives from assets/brand.css."""

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

            # Write HTML to build directory. mjml emits no trailing newline, which the
            # end-of-file-fixer hook then adds — leaving every fresh compile dirty.
            html_file = BUILD_DIR / mjml_file.with_suffix(".html").name
            html_file.write_text(html_content.rstrip("\n") + "\n")

            logger.info("  ✅ Compiled to %s", html_file.name)

        except Exception:
            logger.exception("  ✗ Failed to compile %s", mjml_file.name)
            failed_templates.append(mjml_file.name)

    if failed_templates:
        failed = ", ".join(failed_templates)
        msg = f"Failed to compile {len(failed_templates)} MJML template(s): {failed}"
        raise RuntimeError(msg)

    logger.info("Compilation complete!")


def check_compiled_templates() -> int:
    """Fail when the committed build/ output is not what a fresh compile produces.

    build/ is committed but nothing verified it matched src/, which made a whole
    class of change silently dangerous: brand tokens are resolved from
    assets/brand.css at compile time, so retuning a colour -- or renaming a
    token, as happened with --relab-brand-surface -- repaints every transactional
    email on the next compile with no error and no failing test. The unknown-token
    guard in expand_brand_tokens() does not help there, because a renamed token
    still resolves; it just resolves to something else.

    Same shape as `just assets-check` and the OpenAPI schema-drift check.
    """
    before = {path: path.read_bytes() for path in sorted(BUILD_DIR.glob("*.html"))}
    try:
        compile_mjml_templates()
    finally:
        # Put the committed bytes back, even when the compile blew up halfway.
        # Compiling in place is how the comparison is made, but a check that
        # repairs what it measures would pass on its own second run and report
        # the tree as clean when it is not, and a check that fails halfway must
        # not leave half-recompiled templates behind to be committed.
        after = {path: path.read_bytes() for path in sorted(BUILD_DIR.glob("*.html"))}
        for path, body in before.items():
            if after.get(path) != body:
                path.write_bytes(body)
        for path in set(after) - set(before):
            path.unlink()

    stale = sorted(
        {path.name for path in set(before) ^ set(after)}
        | {path.name for path, body in after.items() if before.get(path) != body}
    )

    if stale:
        logger.error(
            "Compiled email templates are stale; run `just compile-email` and commit: %s",
            ", ".join(stale),
        )
        return 1
    logger.info("Compiled email templates are in sync.")
    return 0


CHECK_FLAG = "--check"


def main() -> None:
    """Entry point for the compile email templates script."""
    if CHECK_FLAG in sys.argv[1:]:
        raise SystemExit(check_compiled_templates())
    compile_mjml_templates()


if __name__ == "__main__":
    main()
