"""Checks which pnpm-workspace.yaml override lines scripts/stale_overrides.py tests."""

from __future__ import annotations

import stale_overrides

WORKSPACE = """\
catalog:
  "x@<1": "1" # GHSA-not-an-override
overrides:
  # comment
  "uuid@<11.1.1": ">=11.1.1" # GHSA-w5hq-g745-h8pq
  "@ai-sdk/provider-utils@>=4.0.0 <4.0.33": ">=4.0.33 <5" # GHSA-866g-f22w-33x8
  monaco-editor@0.55.1>dompurify: 3.4.15 # GHSA-xxxx-xxxx-xxxx
  lightningcss: 1.33.0
"""


def test_selects_only_ghsa_tagged_override_lines() -> None:
    packages = [package for _, package in stale_overrides.security_overrides(WORKSPACE)]
    assert packages == ["uuid", "@ai-sdk/provider-utils", "dompurify"]
