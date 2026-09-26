#!/usr/bin/env python3
"""Decide which CI jobs a pull request needs, from the paths it changes.

Reads changed paths on stdin, one per line, and prints GitHub Actions step
outputs. Anything outside the four subrepos (workflows, justfile, compose,
scripts) touches all of them, and so does an empty diff or any event other
than `pull_request`: when in doubt, run everything.

Usage: git diff --name-only HEAD^1 HEAD | ci_changed_areas.py <event>
"""

from __future__ import annotations

import json
import sys

SUBREPOS = ("backend", "app", "www", "docs")
# Written by backend generators and verified by `just backend/check`.
BACKEND_OUTPUTS = ("app/src/types/openapi.json", "docs/public/api/schemas/", "docs/src/components/datamodel/")
# The shared pnpm workspace files reach every JS subrepo.
JS_ROOT = frozenset({"pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json"})


def changed_areas(event: str, paths: list[str]) -> set[str]:
    """Return the subrepos touched, plus "all" when the change reaches everything."""
    if event != "pull_request" or not paths:
        return {"all", *SUBREPOS}
    areas: set[str] = set()
    for path in paths:
        top = path.split("/", 1)[0]
        if path.startswith(BACKEND_OUTPUTS):
            areas.add("backend")
        if top in SUBREPOS and "/" in path:
            areas.add(top)
        elif path in JS_ROOT:
            areas.update({"app", "www", "docs"})
        else:
            return {"all", *SUBREPOS}
    return areas


def outputs(areas: set[str]) -> dict[str, str]:
    """Map areas to the step outputs that ci.yml's job conditions and matrices read."""
    web = [s for s in ("www", "app") if s in areas]
    smoke = [f"docker-smoke-static {s}" for s in ("www", "app", "docs") if s in areas]
    codeql = []
    if "backend" in areas:
        smoke += ["docker-orchestration-smoke", "docker-smoke-backups"]
        codeql.append("python")
    if areas & {"app", "www", "docs"}:
        codeql.append("javascript-typescript")
    if "all" in areas:
        codeql.append("actions")
    return {
        "backend": str("backend" in areas).lower(),
        "www": str("www" in areas).lower(),
        "docs": str("docs" in areas).lower(),
        "web": json.dumps(web),
        "smoke": json.dumps(smoke),
        "codeql": json.dumps(codeql),
    }


def main() -> None:
    """Print `key=value` step outputs for the event in argv and the paths on stdin."""
    paths = [line.strip() for line in sys.stdin if line.strip()]
    for key, value in outputs(changed_areas(sys.argv[1], paths)).items():
        print(f"{key}={value}")  # noqa: T201  # GitHub Actions step output


if __name__ == "__main__":
    main()
