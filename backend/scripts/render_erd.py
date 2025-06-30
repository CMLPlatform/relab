"""Use Paracelsus to generate ERDs from the SQLModel data schema."""

import logging
import re
from pathlib import Path

from paracelsus.graph import get_graph_string
from paracelsus.pyproject import get_pyproject_settings

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def process_erd_content(content: str, exclude_fields: tuple[str, ...] = ("created_at", "updated_at")) -> str:
    """Remove specified fields and replace CHAR(32) with UUID in the ERD content."""
    # Remove specified fields
    for field in exclude_fields:
        content = re.sub(rf'\n  [A-Z0-9()]+ {field}[",a-z]*?(?=\n)', "", content)

    # Replace CHAR(32) with UUID
    return content.replace("CHAR(32)", "UUID")


def create_partial_erd(complete_erd: str, tables: list[str]) -> str:
    """Create a partial ERD by extracting only the specified tables and their relationships from the complete ERD."""
    partial_erd = "```mermaid\nerDiagram\n"

    for table in tables:
        # Extract table definitions
        if table_match := re.search(rf"\n  {table} \{{[^}}]+}}", complete_erd):
            partial_erd += "\n" + table_match.group(0) + "\n"

        # Extract relationships where these tables are targets
        for match in re.finditer(rf"\n  \w+ [{{}}|o-]+ {table} : \w+", complete_erd):
            partial_erd += match.group(0)

    return partial_erd + "\n\n```\n\n"


def inject_content(file_path: Path, begin_tag: str, end_tag: str, content: str) -> None:
    """Inject content between tags in a file."""
    # Get content from current file.
    with file_path.open() as file:
        old_content = file.read()

    # Replace old content with newly generated content.
    pattern = re.escape(begin_tag) + "(.*)" + re.escape(end_tag)
    new_content = re.sub(
        pattern,
        f"{begin_tag}\n{content}\n{end_tag}",
        old_content,
        flags=re.MULTILINE | re.DOTALL,
    )

    with file_path.open("w") as file:
        file.write(new_content)


REPLACE_BEGIN_TAG = "<!-- BEGIN_ERDS -->"
REPLACE_END_TAG = "<!-- END_ERDS -->"
MARKDOWN_FILE = Path(__file__).parent.parent / "README.md"

if __name__ == "__main__":
    # Get settings from pyproject.toml
    settings = get_pyproject_settings()

    # Generate ERD content
    logger.info("Generating complete ERD...")
    complete_erd = get_graph_string(
        base_class_path=settings.get("base", "app.api.common.models.base:CustomBase"),
        import_module=settings.get("imports", []),
        include_tables=set(),
        exclude_tables=set(),
        python_dir=[],
        format="mermaid",
        column_sort="preserve-order",
    )
    complete_erd = process_erd_content(complete_erd)

    # Define modules with their tables
    modules = [
        ("Auth", ["user", "oauthaccount", "organization"]),
        (
            "Background Data",
            [
                "taxonomy",
                "category",
                "material",
                "producttype",
                "categorymateriallink",
                "categoryproducttypelink",
            ],
        ),
        (
            "Data Collection",
            [
                "product",
                "physicalproperties",
                "camera",
                "materialproductlink",
            ],
        ),
        ("File Management", ["file", "image", "video"]),
    ]

    # Generate and write partial ERDs
    markdown_content = "## Entity Relationship Diagrams\n\n"
    for name, tables in modules:
        logger.info("Generating ERD for %s module...", name)
        markdown_content += f"### {name} Module\n\n" + create_partial_erd(complete_erd, tables)

    inject_content(MARKDOWN_FILE, REPLACE_BEGIN_TAG, REPLACE_END_TAG, markdown_content)

    logger.info("Added ERDs to file: %s", MARKDOWN_FILE)
