#!/usr/bin/env python3
"""Report pnpm security overrides that no longer change the audit result.

A security override is an `overrides:` line in pnpm-workspace.yaml that carries
a `# GHSA-` comment. For each one, drop it, relock, and audit: when the audit no
longer flags that package, a lockfile refresh or an upstream bump has made the
override dead weight and it can go. Exits 1 when any override is stale.

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


def flagged_packages() -> set[str]:
    """Return the package names the workspace audit flags, ignored GHSAs excluded."""
    # pnpm audit exits non-zero when it finds anything, so the exit code carries no signal here.
    result = subprocess.run(
        ["pnpm", "audit", "--json"],  # noqa: S607  # fixed argv
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return {advisory["module_name"] for advisory in json.loads(result.stdout).get("advisories", {}).values()}


def main() -> int:
    """Drop each security override in turn and report the ones the audit no longer needs."""
    workspace, lockfile = WORKSPACE.read_text(), LOCKFILE.read_text()
    stale = []
    try:
        for line, package in security_overrides(workspace):
            WORKSPACE.write_text(workspace.replace(line, "", 1))
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
