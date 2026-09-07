#!/usr/bin/env python3
"""Browser JavaScript policy: no raw HTML sinks, no third-party runtime scripts.

Every rule is a regex over tracked files in app/, www/, and docs/. Run from the
repo root: `just check-root` calls it, and tests/test_browser_js_policy.py runs
the rules against the fixtures in tests/fixtures/browser_js_policy/.
"""

from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]

_BROWSER_ASSET_PATHS = (
    "app/**",
    "docs/src/components/**",
    "docs/src/pages/**",
    "docs/src/scripts/**",
    "docs/public/**",
    "docs/Caddyfile",
    "docs/package.json",
    "docs/astro.config.*",
    "www/src/**",
    "www/public/**",
    "www/Caddyfile",
    "www/package.json",
    "www/astro.config.*",
)

# Tests, generated output, and vendored trees never ship to a browser.
IGNORED_PATHS = (
    "**/__tests__/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/e2e/**",
    "**/dist/**",
    "**/.astro/**",
    "**/.expo/**",
    "**/coverage/**",
    "**/playwright-report/**",
    "**/test-results/**",
    "app/src/types/api.generated.ts",
)


def _matches(path: str, globs: tuple[str, ...]) -> bool:
    """`**` matches zero or more segments, unlike fnmatch."""
    return any(PurePosixPath(path).full_match(glob) for glob in globs)


@dataclass(frozen=True)
class Rule:
    """One policy rule: a regex applied to files matching `include` minus `exclude`."""

    id: str
    message: str
    pattern: re.Pattern[str]
    include: tuple[str, ...] = ("app/**", "www/**", "docs/**")
    exclude: tuple[str, ...] = ()

    def applies_to(self, path: str) -> bool:
        """Whether this rule scans `path` (repo-relative, POSIX)."""
        return _matches(path, self.include) and not _matches(path, self.exclude)


RULES = (
    Rule(
        "astro-set-html",
        "Do not render unsanitized HTML with Astro set:html; use structured components instead.",
        re.compile(r"\bset:html\s*="),
        include=("docs/src/**/*.astro", "www/src/**/*.astro"),
    ),
    Rule(
        "dom-html-sink",
        "Do not write raw HTML into the DOM; use structured rendering or an explicitly reviewed sanitizer boundary.",
        re.compile(
            r"\.(?:innerHTML|outerHTML)\s*=|\binsertAdjacentHTML\s*\(|\bdocument\.write\s*\("
            r"|\bdangerouslySetInnerHTML\b|\.setHTMLUnsafe\s*\("
        ),
        include=("docs/src/**", "docs/public/**", "www/src/**", "www/public/**", "app/src/**"),
    ),
    Rule(
        "webview-unsafe-origin",
        "Do not add permissive or plaintext React Native WebView origins.",
        re.compile(r"""originWhitelist\s*=\s*\{\s*\[[^\]]*(?:["']\*["']|["']http://)"""),
        include=("app/src/**",),
    ),
    Rule(
        "webview-new-usage",
        "New React Native WebView usage must go through an explicit security review; "
        "keep WebView isolated to the reviewed product video component.",
        re.compile(r"""(?:from\s+["']react-native-webview["']|require\(\s*["']react-native-webview["']\s*\))"""),
        include=("app/src/**",),
        exclude=("app/src/components/product/ProductVideoEmbed.tsx",),
    ),
    Rule(
        "remote-script-src",
        "Do not load browser runtime scripts from third-party origins; bundle first-party code instead.",
        re.compile(r"""<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?//"""),
    ),
    Rule(
        "remote-module-import",
        "Do not import browser runtime JavaScript from remote URLs; install and bundle dependencies locally.",
        re.compile(
            r"""\b(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["'](?:https?:)?//|import\s*\(\s*["'](?:https?:)?//"""
        ),
    ),
    Rule(
        "cdn-runtime-reference",
        "Do not add CDN-hosted browser runtime assets; install and serve first-party bundled assets.",
        re.compile(
            r"""https?://(?:[^/\s"'`<>]+\.)?(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|cdn\.[^/\s"'`<>]+)"""
        ),
        include=_BROWSER_ASSET_PATHS,
    ),
    Rule(
        "marketing-tag-signature",
        "Do not add browser marketing or analytics tags without an explicit third-party JavaScript security review.",
        re.compile(
            r"\b(?:googletagmanager|google-analytics|gtag\s*\(|dataLayer|plausible\.io|matomo|hotjar|segment\.com)"
        ),
        include=_BROWSER_ASSET_PATHS,
    ),
)


def scan_text(path: str, text: str) -> list[tuple[str, int, Rule]]:
    """Return (path, line, rule) for every rule match in `text`."""
    findings = []
    for rule in RULES:
        if not rule.applies_to(path):
            continue
        findings.extend((path, text.count("\n", 0, m.start()) + 1, rule) for m in rule.pattern.finditer(text))
    return findings


def tracked_files() -> list[str]:
    """Tracked files under the browser-facing subrepos, minus IGNORED_PATHS."""
    out = subprocess.run(
        ["git", "ls-files", "-z", "app", "www", "docs"],  # noqa: S607  # fixed argv
        capture_output=True,
        check=True,
        cwd=ROOT,
    ).stdout
    return [p for p in out.decode().split("\0") if p and not _matches(p, IGNORED_PATHS)]


def main() -> int:
    """Scan the working tree; print findings and return 1 when any exist."""
    findings = []
    for rel in tracked_files():
        try:
            text = (ROOT / rel).read_text(encoding="utf-8")
        except UnicodeDecodeError, FileNotFoundError:
            continue
        findings.extend(scan_text(rel, text))
    for path, line, rule in findings:
        print(f"{path}:{line}: [{rule.id}] {rule.message}")  # noqa: T201  # CLI output
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
