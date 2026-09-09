"""Pins the dependency edges between bounded contexts.

CLAUDE.md describes a layering that nothing used to enforce, so it had drifted. These
record it: contexts may depend on the shared contexts beneath them, the three documented
exceptions are listed by name, and a cross-context use case lives in `application`, above
every context, rather than inside whichever one owns its entry point.

Adding an edge is not forbidden; it is a decision. Update ALLOWED_EDGES in the same
commit, and say why in the message. Removing one is always fine: the assertion is
one-directional so paying down debt never fails the build.

The scan parses each module with `ast` rather than matching import lines, because a
relative import is the house style inside these packages: `from ..auth.models import
User` crosses a context boundary just as `from app.api.auth.models import User` does, and
so does `from app.api import auth`. Both forms resolve to the same target here.
"""

import ast
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
# context at all, so the edge into it becomes a cycle the moment it imports one; its own
# context included, because `data_collection/schemas.py` already imports
# `reference_data.schemas`. That property is what makes the import safe, so it is
# asserted rather than assumed.
LEAF_MODULES = ("data_collection/product_schemas.py",)

# The application layer sits above every context, so it may import any of them, and no
# context may import it. That is what keeps a cross-context use case (erasing an account,
# rendering a public profile) from inverting the direction of the context it starts in.
APPLICATION = "application"

_APP_ROOT = Path(__file__).resolve().parents[2] / "app"
_API_ROOT = _APP_ROOT / "api"


def _package_of(module: Path) -> str:
    """Return the dotted package a module's relative imports resolve against."""
    # Dropping the last part gives the package for a plain module, and for a package's
    # own `__init__`, whose level-1 imports resolve against the package itself.
    return ".".join(module.relative_to(_APP_ROOT.parent).with_suffix("").parts[:-1])


def _imported_modules(module: Path) -> list[tuple[int, str]]:
    """Return every dotted module name *module* imports, with the line it sits on.

    ``from X import Y`` yields both ``X`` and ``X.Y``: only the second distinguishes
    ``from app.api import auth`` from ``from app.api import router``. Relative levels are
    resolved against the importing module's own package.
    """
    package = _package_of(module)
    imports: list[tuple[int, str]] = []
    for node in ast.walk(ast.parse(module.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            imports += [(node.lineno, alias.name) for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                ancestor = package.split(".")[: len(package.split(".")) - (node.level - 1)]
                base = ".".join([*ancestor, node.module] if node.module else ancestor)
            else:
                base = node.module or ""
            imports.append((node.lineno, base))
            imports += [(node.lineno, f"{base}.{alias.name}") for alias in node.names]
    return imports


def _target_context(dotted: str) -> str | None:
    """Return the bounded context a dotted `app.api.*` module belongs to, if any."""
    parts = dotted.split(".")
    if parts[:2] != ["app", "api"] or len(parts) < 3 or parts[2] not in CONTEXTS:
        return None
    return parts[2]


def _cross_context_edges() -> Counter[tuple[str, str]]:
    """Count imports from one bounded context to another."""
    edges: Counter[tuple[str, str]] = Counter()
    for module in _API_ROOT.rglob("*.py"):
        source_context = module.relative_to(_API_ROOT).parts[0]
        if source_context not in CONTEXTS:
            continue
        seen: set[tuple[int, str]] = set()
        for lineno, dotted in _imported_modules(module):
            target = _target_context(dotted)
            if target is None or target == source_context or (lineno, target) in seen:
                continue
            seen.add((lineno, target))
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
    offenders = []
    for module in (_APP_ROOT / "core").rglob("*.py"):
        if module.name == "model_registry.py":
            # Imports model modules inside a function purely to populate the SQLAlchemy registry.
            continue
        offenders += [
            f"{module.name}:{lineno}"
            for lineno, dotted in _imported_modules(module)
            if dotted == "app.api" or dotted.startswith("app.api.")
        ]
    assert not offenders, f"`core` must not import `app.api`: {offenders}"


def test_no_context_imports_the_application_layer() -> None:
    """Contexts sit below the use cases that compose them, never the other way round."""
    offenders = []
    for module in _API_ROOT.rglob("*.py"):
        if module.relative_to(_API_ROOT).parts[0] not in CONTEXTS:
            continue
        offenders += [
            f"{module.relative_to(_API_ROOT)}:{lineno}"
            for lineno, dotted in _imported_modules(module)
            if dotted == f"app.api.{APPLICATION}" or dotted.startswith(f"app.api.{APPLICATION}.")
        ]
    assert not offenders, (
        f"contexts importing `{APPLICATION}`: {sorted(set(offenders))}. "
        "Move the shared code down into the context that owns it, or the caller up into the layer."
    )


def test_leaf_modules_import_no_context() -> None:
    """A module another context imports directly must not import a context itself.

    `reference_data` needs `ProductSummary` for the product links it embeds in a material.
    That is safe only while `product_schemas` stays a leaf: the moment it imports a
    context (its own included, since that context already imports `reference_data`), the
    edge into it becomes a real cycle.
    """
    offenders = []
    for relative in LEAF_MODULES:
        module = _API_ROOT / relative
        assert module.exists(), f"{relative} moved; update LEAF_MODULES"
        offenders += [
            f"{relative}:{lineno} -> {target}"
            for lineno, dotted in _imported_modules(module)
            if (target := _target_context(dotted)) is not None and target != "common"
        ]
    assert not offenders, f"leaf modules must import no context: {sorted(set(offenders))}"
