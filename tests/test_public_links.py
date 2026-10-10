"""Guards the contributor-facing pages against the retired domain and contact address.

The docs and sites moved to r9lab.io and the public contact is info@r9lab.io. The pages under
.github/ are dotfiles to most search tools, so a sweep can skip them; `git ls-files` lists them
like any other tracked file. otel. and grafana. stay on the old zone until monitoring moves.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
OLD_HOST = re.compile(r"(?<![\w.-])(?!otel\.|grafana\.)(?:[\w-]+\.)*cml-relab\.org")
OLD_CONTACT = "relab@cml.leidenuniv.nl"


def public_pages() -> list[str]:
    """Return README.md and every tracked Markdown page under .github/."""
    listed = subprocess.run(
        ["git", "ls-files", "README.md", ".github/*.md"],  # noqa: S607  # fixed argv
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    assert ".github/SECURITY.md" in listed, "git ls-files did not list the .github pages"
    return listed


@pytest.mark.parametrize("page", public_pages())
def test_page_uses_the_current_domain_and_contact(page: str) -> None:
    """A stale link or contact address on these pages sends people to the retired domain."""
    text = (ROOT / page).read_text()
    assert not OLD_HOST.findall(text), f"{page}: links the retired domain"
    assert OLD_CONTACT not in text, f"{page}: names the internal contact address; use info@r9lab.io"
