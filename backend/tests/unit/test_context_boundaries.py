"""Pins the dependency edges between bounded contexts.

CLAUDE.md describes a layering that nothing used to enforce, so it had drifted. These
record it: contexts may depend on the shared contexts beneath them, the three documented
exceptions are listed by name, and a cross-context use case lives in `application`, above
every context, rather than inside whichever one owns its entry point.

Adding an edge is not forbidden; it is a decision. Update ALLOWED_EDGES in the same
commit, and say why in the message. Removing one is always fine: the assertion is
one-directional so paying down debt never fails the build.
"""

import re
from collections import Counter
from pathlib import Path

CONTEXTS = {"auth", "data_collection", "reference_data", "file_storage", "plugins", "stats", "common"}

# Every context may import `common`; `common` imports no context. Those two are asserted
# in their own tests below.
ALLOWED_EDGES = {
    # The shared media context: products, reference data and cameras all own media.
    ("data_collection", "file_storage"),
    ("reference_data", "file_storage"),
    ("plugins", "file_storage"),
    ("stats", "file_storage"),
    # Ownership and roles: most contexts hang their records off a User.
    ("data_collection", "auth"),
    ("reference_data", "auth"),
    ("plugins", "auth"),
    ("stats", "auth"),
    ("file_storage", "auth"),
    # Taxonomy and categories the product model resolves against.
    ("data_collection", "reference_data"),
    ("reference_data", "data_collection"),  # one schema import; see the leaf test below
    # Cameras attach their captures to a product.
    ("plugins", "data_collection"),
    # Everything above points downwards. These two point back up, so each carries the
    # reason it is allowed:
    #   `stats` is a read model over other contexts' tables, cross-context by definition.
    ("stats", "data_collection"),
    #   the quota ledger's columns live on `User` while the chargeable parent is a
    #   `Product`, so its statements join both; see app/api/file_storage/upload_quota.py.
    ("file_storage", "data_collection"),
}

# `reference_data` takes one schema from here. That module is a leaf: it imports no
# context at all, so the edge cannot become a cycle. That property is what
# makes the import safe, so it is asserted rather than assumed.
LEAF_MODULES = ("data_collection/product_schemas.py",)

# The application layer sits above every context, so it may import any of them, and no
# context may import it. That is what keeps a cross-context use case (erasing an account,
# rendering a public profile) from inverting the direction of the context it starts in.
APPLICATION = "application"


def _cross_context_edges() -> Counter[tuple[str, str]]:
    """Count import lines from one bounded context to another."""
    edges: Counter[tuple[str, str]] = Counter()
    api_root = Path(__file__).resolve().parents[2] / "app" / "api"
    for module in api_root.rglob("*.py"):
        source_context = module.relative_to(api_root).parts[0]
        if source_context not in CONTEXTS:
            continue
        for line in module.read_text(encoding="utf-8").splitlines():
            match = re.match(r"\s*(?:from|import)\s+app\.api\.([a-z_]+)", line)
            if not match:
                continue
            target = match.group(1)
            if target in CONTEXTS and target != source_context:
                edges[(source_context, target)] += 1
    return edges


def test_no_new_edges_between_contexts() -> None:
    """A context may only import the contexts this file already records."""
    actual = {edge for edge in _cross_context_edges() if edge[1] != "common"}
    new_edges = actual - ALLOWED_EDGES
    assert not new_edges, (
        f"new cross-context dependencies: {sorted(new_edges)}. "
        "Add them to ALLOWED_EDGES with a reason, or route through `common` instead."
    )


def test_common_imports_no_context() -> None:
    """`common` is imported by every context, so it may depend on none of them."""
    offenders = {edge: count for edge, count in _cross_context_edges().items() if edge[0] == "common"}
    assert not offenders, f"`common` must not import a bounded context: {offenders}"


def test_core_imports_no_api_code() -> None:
    """`core` is infrastructure beneath `common`; the model registry is the one exception."""
    core_root = Path(__file__).resolve().parents[2] / "app" / "core"
    offenders = []
    for module in core_root.rglob("*.py"):
        if module.name == "model_registry.py":
            # Imports model modules inside a function purely to populate the SQLAlchemy registry.
            continue
        for number, line in enumerate(module.read_text(encoding="utf-8").splitlines(), 1):
            if re.match(r"\s*(?:from|import)\s+app\.api\.", line):
                offenders.append(f"{module.name}:{number}")
    assert not offenders, f"`core` must not import `app.api`: {offenders}"


def test_no_context_imports_the_application_layer() -> None:
    """Contexts sit below the use cases that compose them, never the other way round."""
    api_root = Path(__file__).resolve().parents[2] / "app" / "api"
    offenders = []
    for module in api_root.rglob("*.py"):
        if module.relative_to(api_root).parts[0] not in CONTEXTS:
            continue
        for number, line in enumerate(module.read_text(encoding="utf-8").splitlines(), 1):
            if re.match(rf"\s*(?:from|import)\s+app\.api\.{APPLICATION}\b", line):
                offenders.append(f"{module.relative_to(api_root)}:{number}")
    assert not offenders, (
        f"contexts importing `{APPLICATION}`: {offenders}. "
        "Move the shared code down into the context that owns it, or the caller up into the layer."
    )


def test_leaf_modules_import_no_context() -> None:
    """A module another context imports directly must not import a context itself.

    `reference_data` needs `ProductSummary` for the product links it embeds in a material.
    That is safe only while `product_schemas` stays a leaf: the moment it imports a
    context, the edge into it becomes a real cycle.
    """
    api_root = Path(__file__).resolve().parents[2] / "app" / "api"
    offenders = []
    for relative in LEAF_MODULES:
        module = api_root / relative
        assert module.exists(), f"{relative} moved; update LEAF_MODULES"
        own_context = Path(relative).parts[0]
        for number, line in enumerate(module.read_text(encoding="utf-8").splitlines(), 1):
            match = re.match(r"\s*(?:from|import)\s+app\.api\.([a-z_]+)", line)
            if match and match.group(1) not in (own_context, "common"):
                offenders.append(f"{relative}:{number} -> {match.group(1)}")
    assert not offenders, f"leaf modules must import no context: {offenders}"
