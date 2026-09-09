"""Refuse an ``alembic downgrade`` that cannot bring the data back.

A ``downgrade()`` restores column and table *shape*, not content. When any migration
between the current head and the target dropped a column or table, or deleted or
rewrote rows in its ``upgrade()``, rolling back re-creates those objects empty. The
only way back from that is the pre-release backup, so the deploy rollback refuses.

A migration whose destructive statement is known to be harmless (a column nothing ever
wrote, a backfill of a column the same revision adds, dynamic SQL that only creates)
declares ``ROLLBACK_SAFE = True`` at module level.

Run with: python -m scripts.maintenance.downgrade_safety <target-revision>
Exit 0 when every migration in the range can be reverted, 1 otherwise, 2 on bad input.
"""

import ast
import re
import sys
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

_DESTRUCTIVE_CALLS = {"drop_column", "drop_table"}
_SAFE_MARKER = "ROLLBACK_SAFE"
_DOWNGRADE = "downgrade"
_EXECUTE = "execute"
_BASE_TARGET = "base"
_DESTRUCTIVE_SQL = re.compile(r"\b(DELETE|TRUNCATE|UPDATE|DROP)\b", re.IGNORECASE)


def _string_literal(node: ast.AST) -> str:
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else ""


def _declared_safe(module: ast.Module) -> bool:
    return any(
        isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == _SAFE_MARKER for t in node.targets)
        and isinstance(node.value, ast.Constant)
        and node.value.value is True
        for node in module.body
    )


def destructive_upgrade_calls(source: str) -> list[str]:
    """Return a description of every data-destroying call outside ``downgrade()``.

    Every function except ``downgrade()`` is inspected, so helpers called from
    ``upgrade()`` count. SQL that is not a plain string literal (an f-string,
    ``sa.text(...)``, a variable) cannot be classified and is reported as such: the
    safe default for a rollback gate is to refuse.
    """
    module = ast.parse(source)
    if _declared_safe(module):
        return []
    found: list[str] = []
    for func in module.body:
        if not isinstance(func, ast.FunctionDef) or func.name == _DOWNGRADE:
            continue
        for node in ast.walk(func):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            name = node.func.attr
            if name in _DESTRUCTIVE_CALLS:
                found.append(f"{name}({', '.join(_string_literal(a) for a in node.args[:2])})")
            elif name == _EXECUTE and node.args:
                if not isinstance(node.args[0], ast.Constant):
                    found.append("execute(<dynamic SQL>)")
                elif match := _DESTRUCTIVE_SQL.search(_string_literal(node.args[0])):
                    found.append(f"execute({match.group(1).upper()} ...)")
    return found


def main(argv: list[str]) -> int:
    """Check the downgrade range from the script head to ``argv[0]``."""
    if len(argv) != 1:
        sys.stderr.write("usage: python -m scripts.maintenance.downgrade_safety <target-revision>\n")
        return 2
    target = argv[0]
    if target == _BASE_TARGET:
        # Every revision's `downgrade()` drops what its `upgrade()` created, so going to
        # base drops every table by construction. No per-revision marker can make that
        # lossless, and this gate only inspects `upgrade()`, so it would otherwise pass.
        sys.stderr.write(
            "error: refusing to check a downgrade to base: it drops every table. "
            "Name the revision to stop at, or restore the backup (just restore <env> YES <snapshot>).\n"
        )
        return 1
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
    scripts = ScriptDirectory.from_config(config)
    (head,) = scripts.get_heads()
    try:
        revisions = list(scripts.iterate_revisions(head, target))
    except Exception as exc:  # noqa: BLE001 - alembic raises several types for an unknown revision
        sys.stderr.write(f"error: cannot resolve downgrade range {head} -> {target}: {exc}\n")
        return 2

    blocked = False
    for revision in revisions:
        calls = destructive_upgrade_calls(Path(revision.path).read_text(encoding="utf-8"))
        if calls:
            blocked = True
            sys.stderr.write(f"{revision.revision}: upgrade() destroyed data: {', '.join(calls)}\n")
    if blocked:
        sys.stderr.write(
            f"error: downgrading {len(revisions)} revision(s) to {target} cannot restore that data; "
            "restore the pre-release backup instead (just restore <env> YES <snapshot>).\n"
        )
        return 1
    sys.stdout.write(f"downgrade {head} -> {target} reverts {len(revisions)} revision(s) with no data loss\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
