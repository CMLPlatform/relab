"""Runs scripts/browser_js_policy.py against annotated fixtures.

A `ruleid: <rule>` comment marks the next line as a required finding; an `ok:`
comment marks a line that must stay clean. The fixture filename encodes the
repo path the rules see, so include/exclude globs are exercised too.
"""

from __future__ import annotations

import re
from pathlib import Path

import browser_js_policy
import pytest

FIXTURES = Path(__file__).parent / "fixtures" / "browser_js_policy"
ANNOTATION = re.compile(r"ruleid:\s*([\w-]+)")


@pytest.mark.parametrize("fixture", sorted(FIXTURES.iterdir()), ids=lambda p: p.name)
def test_fixture_findings_match_annotations(fixture: Path) -> None:
    text = fixture.read_text(encoding="utf-8")
    virtual_path = fixture.stem.replace("-", "/") + "/fixture" + fixture.suffix
    expected = {
        (line_no + 1, m.group(1))
        for line_no, line in enumerate(text.splitlines(), start=1)
        if (m := ANNOTATION.search(line))
    }
    found = {(line, rule.id) for _, line, rule in browser_js_policy.scan_text(virtual_path, text)}
    assert found == expected


def test_every_rule_has_a_fixture() -> None:
    covered = {rule for f in FIXTURES.iterdir() for rule in ANNOTATION.findall(f.read_text(encoding="utf-8"))}
    assert covered == {rule.id for rule in browser_js_policy.RULES}


def test_reviewed_webview_component_is_exempt() -> None:
    text = "import { WebView } from 'react-native-webview';"
    assert browser_js_policy.scan_text("app/src/components/product/ProductVideoEmbed.tsx", text) == []
    assert browser_js_policy.scan_text("app/src/components/other/Embed.tsx", text)


def test_repo_is_clean() -> None:
    assert browser_js_policy.main() == 0
