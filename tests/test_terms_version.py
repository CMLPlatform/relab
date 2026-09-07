"""Guards the terms version against drifting between the backend and the website.

Accounts record which terms version they accepted (``terms_accepted_version``), and the
integer they record comes from the backend. The words those users actually agreed to live
in the website copy. Nothing but this test ties the two together, so a wording change that
bumps one side and not the other would leave accounts claiming to have accepted a version
that never existed — or, worse, silently claiming to have accepted revised terms they were
never shown.

Regex rather than a parser: one is a Python module and the other a TypeScript object, and
neither is worth importing a toolchain for.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_TERMS = ROOT / "backend/app/api/auth/terms.py"
WWW_TERMS = ROOT / "www/src/copy/terms-content.ts"


def backend_version() -> int:
    """Return CURRENT_TERMS_VERSION as declared by the backend."""
    match = re.search(r"^CURRENT_TERMS_VERSION\s*=\s*(\d+)", BACKEND_TERMS.read_text(), re.MULTILINE)
    assert match, f"{BACKEND_TERMS.relative_to(ROOT)}: no CURRENT_TERMS_VERSION assignment found"
    return int(match.group(1))


def website_version() -> int:
    """Return the version declared by the published terms copy."""
    match = re.search(r"^\s*version:\s*(\d+),", WWW_TERMS.read_text(), re.MULTILINE)
    assert match, f"{WWW_TERMS.relative_to(ROOT)}: no version field found on termsContent"
    return int(match.group(1))


def test_backend_and_website_terms_versions_match() -> None:
    """The version accounts record must be the version the public page shows."""
    assert backend_version() == website_version(), (
        "The terms version differs between the backend and the website. Accounts would record "
        "acceptance of a version other than the one shown to them. Bump both together."
    )


def test_the_rendered_page_shows_the_version_it_records() -> None:
    """A user must be able to see which version they are accepting, not just its date."""
    version = website_version()
    assert f"Version {version}" in WWW_TERMS.read_text(), (
        "termsContent.lastUpdated must name the version, so the page a user accepts is "
        "self-describing rather than identifiable only by date."
    )
