#!/usr/bin/env python3
"""Report pnpm security overrides that no longer change the audit result.

A security override is an `overrides:` line in pnpm-workspace.yaml that carries
a `# GHSA-` comment. For each one, drop it, relock, and audit: when the audit no
longer flags that package, a lockfile refresh or an upstream bump has made the
override dead weight and it can go. Exits 1 when any override is stale.
auditConfig.ignoreGhsas is cleared during the check, so an override whose
advisory is also on that list still counts as needed.

Run from the repo root (`just overrides-check`); it rewrites pnpm-workspace.yaml
and pnpm-lock.yaml while it runs and restores both before it exits.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT / "pnpm-workspace.yaml"
LOCKFILE = ROOT / "pnpm-lock.yaml"

_OVERRIDE_LINE = re.compile(r'^  "?(?P<key>[^":]+?)"?:\s.*#\s*GHSA-')
_IGNORE_LIST = re.compile(r"^(  ignoreGhsas:)\n(?:    - .*\n)+", re.MULTILINE)


def security_overrides(workspace_text: str) -> list[tuple[str, str]]:
    """Return (line, package name) for each GHSA-tagged override."""
    in_overrides = False
    found = []
    for line in workspace_text.splitlines(keepends=True):
        if not line.startswith(" "):
            in_overrides = line.startswith("overrides:")
            continue
        match = _OVERRIDE_LINE.match(line) if in_overrides else None
        if match:
            # "monaco-editor@0.55.1>dompurify" targets dompurify; "@scope/pkg@<1" targets @scope/pkg.
            # A parent selector ">" follows a name or version, never "@" or a space as in ">=".
            target = re.split(r"(?<=[\w.])>(?=[@\w])", match["key"])[-1]
            found.append((line, re.sub(r"(?<=.)@.*", "", target)))
    return found


def clear_audit_ignores(workspace_text: str) -> str:
    """Empty auditConfig.ignoreGhsas, leaving any other GHSA-looking list alone."""
    return _IGNORE_LIST.sub(r"\1 []\n", workspace_text)


def flagged_packages() -> set[str]:
    """Return the package names the workspace audit flags."""
    # pnpm audit exits non-zero when it finds anything, so the exit code carries no signal here.
    result = subprocess.run(
        ["pnpm", "audit", "--json"],  # noqa: S607  # fixed argv
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError:
        report = {}
    # An errored audit (registry down, rate limit) has no metadata; treating it as
    # "nothing flagged" would report every override as stale.
    if "metadata" not in report:
        message = f"pnpm audit failed: {result.stderr.strip() or result.stdout.strip()}"
        raise SystemExit(message)
    return {advisory["module_name"] for advisory in report.get("advisories", {}).values()}


def main() -> int:
    """Drop each security override in turn and report the ones the audit no longer needs."""
    workspace, lockfile = WORKSPACE.read_text(), LOCKFILE.read_text()
    unignored = clear_audit_ignores(workspace)
    stale = []
    try:
        for line, package in security_overrides(workspace):
            WORKSPACE.write_text(unignored.replace(line, "", 1))
            LOCKFILE.write_text(lockfile)
            subprocess.run(
                ["pnpm", "install", "--lockfile-only", "--ignore-scripts"],  # noqa: S607  # fixed argv
                cwd=ROOT,
                check=True,
                capture_output=True,
            )
            if package not in flagged_packages():
                stale.append(line.strip())
    finally:
        WORKSPACE.write_text(workspace)
        LOCKFILE.write_text(lockfile)
    for line in stale:
        print(f"stale override, remove it and relock: {line}")  # noqa: T201  # CLI output
    return 1 if stale else 0


if __name__ == "__main__":
    sys.exit(main())
