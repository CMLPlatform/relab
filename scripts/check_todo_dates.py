#!/usr/bin/env python3
"""Fail on expired or undated compat TODOs, and on trivyignore entries without a scope.

A `TODO(drop-by YYYY-MM-DD)` marker must not be in the past. A TODO that names a
compat shim (drop, remove, legacy, fallback) must carry such a date, so
shims cannot outlive the rename or migration that needed them.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import subprocess
import sys
from pathlib import Path

DATED = re.compile(r"TODO\(drop-by (\d{4}-\d{2}-\d{2})\)")
# The marker must be upper case, so prose like "the todo list" does not match.
COMPAT = re.compile(r"\bTODO\b.*\b(?i:drop|remove|legacy|fallback)\b")
TRIVYIGNORE = ".github/trivyignore.yaml"
# This script and its tests quote the marker as data.
SELF = {"scripts/check_todo_dates.py", "tests/test_check_todo_dates.py"}


def scan_lines(name: str, lines: list[str], today: dt.date) -> list[str]:
    """Return one `file:line: reason` string per violation."""
    out = []
    for n, line in enumerate(lines, 1):
        if m := DATED.search(line):
            try:
                expired = dt.date.fromisoformat(m.group(1)) < today
            except ValueError:
                out.append(f"{name}:{n}: drop-by {m.group(1)} is not a valid date")
                continue
            if expired:
                out.append(f"{name}:{n}: drop-by {m.group(1)} has passed")
        # A line that spells out the marker format (docs) is not an undated TODO.
        elif "TODO(drop-by" not in line and COMPAT.search(line):
            out.append(f"{name}:{n}: compat TODO without (drop-by YYYY-MM-DD)")
    return out


def unscoped_trivy_entries(text: str) -> list[int]:
    """Return the line numbers of `- id:` entries lacking `paths` or `purls`."""
    bad, start, scoped = [], None, False
    for n, line in enumerate([*text.splitlines(), "  - id: end"], 1):
        if line.lstrip().startswith("- id:"):
            if start is not None and not scoped:
                bad.append(start)
            start, scoped = n, False
        elif re.match(r"\s+(paths|purls):", line):
            scoped = True
    return bad


def main(argv: list[str] | None = None) -> int:
    """Scan tracked files and print violations; exit 1 if any."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", type=dt.date.fromisoformat, default=dt.datetime.now().astimezone().date())
    args = ap.parse_args(argv)
    ls = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True)  # noqa: S607  # fixed argv
    files = ls.stdout.splitlines()
    problems = []
    for name in files:
        if name in SELF or not Path(name).is_file():
            continue
        try:
            lines = Path(name).read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError, OSError:
            continue
        problems += scan_lines(name, lines, args.today)
    if Path(TRIVYIGNORE).is_file():
        problems += [
            f"{TRIVYIGNORE}:{n}: entry has neither paths nor purls"
            for n in unscoped_trivy_entries(Path(TRIVYIGNORE).read_text(encoding="utf-8"))
        ]
    sys.stdout.write("".join(f"{p}\n" for p in problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
