#!/usr/bin/env python3
"""Sync shared brand assets into Relab subrepos."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOGO_SOURCE = ROOT / "assets/r9lab-logo.svg"  # the ringed wordmark (wide)
# Favicons / app icons are square and rendered as small as 16px, so they use the
# simple near-square mark rather than the detailed logo.
MARK_SOURCE = ROOT / "assets/r9lab-mark.svg"
MARK_DARK_SOURCE = ROOT / "assets/r9lab-mark-dark.svg"
# The mark with an embedded prefers-color-scheme style, for browser-tab favicons;
# rasterized derivatives keep using the plain light/dark marks.
MARK_ADAPTIVE_SOURCE = ROOT / "assets/r9lab-mark-adaptive.svg"
LOGO_DARK_SOURCE = ROOT / "assets/r9lab-logo-dark.svg"  # ringed wordmark for dark backgrounds
OG_SOURCE = ROOT / "assets/r9lab-og.svg"  # 1200x630 social card (light)
OG_DARK_SOURCE = ROOT / "assets/r9lab-og-dark.svg"
WORDMARK_SOURCE = ROOT / "assets/r9lab-wordmark.svg"  # horizontal lockup (light mode)
WORDMARK_DARK_SOURCE = ROOT / "assets/r9lab-wordmark-dark.svg"  # cyan variant for dark headers

# Vendored monochrome brand marks (Simple Icons, CC0-1.0) — see assets/icons/brand/.
BRAND_ICON_NAMES = ("github", "google", "youtube", "linkedin")


def imagemagick_cli() -> str | None:
    """Resolve the ImageMagick CLI: `magick` (IMv7) with a `convert` (IMv6) fallback."""
    return shutil.which("magick") or shutil.which("convert")


def root_path(path: str) -> Path:
    """Return an absolute path under the repository root."""
    return ROOT / path


def write_or_check(target: Path, content: str, *, check: bool) -> str | None:
    """Write `content` to `target`, or in check mode report it as stale if it differs.

    Returns the target's repo-relative path if stale (check mode only), else None.
    """
    if check:
        try:
            if target.read_text() == content:
                return None
        except FileNotFoundError:
            pass
        return relative(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    return None


WEB_FONT_FILES = (
    "ibm-plex-mono-latin-400.woff2",
    "ibm-plex-sans-latin-ext.woff2",
    "ibm-plex-sans-latin.woff2",
    "ibm-plex-serif-latin-400.woff2",
    "ibm-plex-serif-latin-600.woff2",
)

# Brand images land in src/assets wherever the site's build can hash them into
# /_astro/, which Caddy serves with immutable cache headers. Anything needing a
# stable public URL (og.png, favicons, apple-touch-icon, wordmark.png in the
# backend's emails) has to stay in public/ and gets a shorter max-age instead.
COPY_ASSETS = (
    (
        root_path("assets/brand.css"),
        (
            root_path("docs/src/styles/brand.css"),
            root_path("www/src/styles/brand.css"),
        ),
    ),
    (
        root_path("assets/images/bg-light.jpg"),
        (root_path("app/src/assets/images/bg-light.jpg"),),
    ),
    (
        root_path("assets/images/bg-dark.jpg"),
        (root_path("app/src/assets/images/bg-dark.jpg"),),
    ),
    # NOTE: docs has no logo target — its header renders the wordmark via a custom
    # SiteTitle override, so a synced logo.svg would just be a dead file in public/.
    (
        LOGO_SOURCE,
        (root_path("www/src/assets/images/logo.svg"),),
    ),
    (
        LOGO_DARK_SOURCE,
        (root_path("www/src/assets/images/logo-dark.svg"),),
    ),
    (
        MARK_ADAPTIVE_SOURCE,
        (
            root_path("docs/public/images/favicon.svg"),
            root_path("www/public/images/favicon.svg"),
        ),
    ),
    (
        WORDMARK_SOURCE,
        (
            root_path("docs/public/images/wordmark.svg"),
            root_path("www/src/assets/images/wordmark.svg"),
        ),
    ),
    (
        WORDMARK_DARK_SOURCE,
        (
            root_path("docs/public/images/wordmark-dark.svg"),
            root_path("www/src/assets/images/wordmark-dark.svg"),
        ),
    ),
    *(
        (
            root_path(f"assets/fonts/{font_file}"),
            (
                root_path(f"docs/public/fonts/{font_file}"),
                root_path(f"www/public/fonts/{font_file}"),
            ),
        )
        for font_file in WEB_FONT_FILES
    ),
    *(
        (
            root_path(f"assets/icons/brand/{icon_name}.svg"),
            (
                root_path(f"docs/src/assets/icons/brand/{icon_name}.svg"),
                root_path(f"www/src/assets/icons/brand/{icon_name}.svg"),
            ),
        )
        for icon_name in BRAND_ICON_NAMES
    ),
)


def png_args(size: int) -> tuple[str, ...]:
    """Build ImageMagick args for a square PNG icon."""
    return (
        "-resize",
        f"{size}x{size}",
        "-gravity",
        "center",
        "-extent",
        f"{size}x{size}",
        "-depth",
        "8",
        "-strip",
    )


def png_wide(height: int) -> tuple[str, ...]:
    """ImageMagick args for a natural-aspect PNG at a fixed height (e.g. a wordmark)."""
    return ("-resize", f"x{height}", "-depth", "8", "-strip")


PNG_OG = ("-resize", "1200x630", "-depth", "8", "-strip")
DENSITY = 2048  # rasterization density for icon-scale SVGs
# The og cards' SVGs are nominally 1200x630, so the icon density would blow past
# ImageMagick's canvas limits; render them at a proportionally lower density.
DENSITY_OG = 300

# (source, target, ImageMagick args, density). Square icons render from the mark;
# logos/wordmarks keep their natural wide aspect (consumers size by height).
GENERATED_ASSETS = (
    (MARK_SOURCE, root_path("app/src/assets/images/favicon.png"), png_args(512), DENSITY),
    (LOGO_SOURCE, root_path("app/src/assets/images/logo.png"), png_wide(512), DENSITY),
    (LOGO_DARK_SOURCE, root_path("app/src/assets/images/logo-dark.png"), png_wide(512), DENSITY),
    # in-app marks (mark for empty states, wordmark for the header) in light + dark
    (MARK_SOURCE, root_path("app/src/assets/images/mark.png"), png_args(256), DENSITY),
    (MARK_DARK_SOURCE, root_path("app/src/assets/images/mark-dark.png"), png_args(256), DENSITY),
    (WORDMARK_SOURCE, root_path("app/src/assets/images/wordmark.png"), png_wide(240), DENSITY),
    (WORDMARK_DARK_SOURCE, root_path("app/src/assets/images/wordmark-dark.png"), png_wide(240), DENSITY),
    (WORDMARK_SOURCE, root_path("www/public/images/wordmark.png"), png_wide(240), DENSITY),
    (MARK_SOURCE, root_path("docs/public/images/apple-touch-icon.png"), png_args(180), DENSITY),
    (MARK_SOURCE, root_path("www/public/images/apple-touch-icon.png"), png_args(180), DENSITY),
    (MARK_SOURCE, root_path("backend/app/static/favicon.ico"), ("-define", "icon:auto-resize=48,32,16"), DENSITY),
    (MARK_SOURCE, root_path("docs/public/favicon.ico"), ("-define", "icon:auto-resize=48,32,16"), DENSITY),
    (MARK_SOURCE, root_path("www/public/favicon.ico"), ("-define", "icon:auto-resize=48,32,16"), DENSITY),
    # committed canonical PNGs next to the SVG sources (the root README embeds the wordmark)
    (MARK_SOURCE, root_path("assets/r9lab-mark.png"), png_args(512), DENSITY),
    (MARK_DARK_SOURCE, root_path("assets/r9lab-mark-dark.png"), png_args(512), DENSITY),
    (WORDMARK_SOURCE, root_path("assets/r9lab-wordmark.png"), png_wide(240), DENSITY),
    (WORDMARK_DARK_SOURCE, root_path("assets/r9lab-wordmark-dark.png"), png_wide(240), DENSITY),
    (LOGO_SOURCE, root_path("assets/r9lab-logo.png"), png_wide(240), DENSITY),
    (LOGO_DARK_SOURCE, root_path("assets/r9lab-logo-dark.png"), png_wide(240), DENSITY),
    # 1200x630 social cards, rendered straight to every consumer
    (OG_DARK_SOURCE, root_path("assets/r9lab-og.png"), PNG_OG, DENSITY_OG),
    (OG_DARK_SOURCE, root_path("www/public/images/og.png"), PNG_OG, DENSITY_OG),
    (OG_DARK_SOURCE, root_path("docs/public/images/og.png"), PNG_OG, DENSITY_OG),
    (OG_SOURCE, root_path("assets/r9lab-og-light.png"), PNG_OG, DENSITY_OG),
    (OG_SOURCE, root_path("docs/public/images/og-light.png"), PNG_OG, DENSITY_OG),
)


# (source, target, ImageMagick args) — derived from a raster source, not the logo.
#
# NOTE: empty on purpose. The bg-*.jpg pair are backdrop images, and neither www
# nor docs paints a backdrop any more: both page grounds are flat tokens
# (www/src/styles/tokens.css, docs/src/styles/base.css). Syncing the JPEGs back
# in would resurrect the wallpaper on the next run, so the entries are gone
# rather than merely unreferenced. They still sync to app (see COPY_ASSETS),
# which renders them full-resolution as real backgrounds.
PROCESSED_ASSETS: tuple[tuple[Path, Path, tuple[str, ...], int], ...] = ()


PALETTE_SOURCE = root_path("assets/palette.json")
APP_CSS_TARGET = root_path("app/src/theme/brand.generated.css")
APP_TS_TARGET = root_path("app/src/theme/palette.generated.ts")

GENERATED_HEADER = "Generated by scripts/sync_brand_assets.py from assets/palette.json. Do not edit."

CITATION_SOURCE = root_path("CITATION.cff")
PROJECT_SOURCE = root_path("assets/project.json")
WWW_RESEARCH_TARGET = root_path("www/src/copy/research.generated.ts")
DOCS_COLOPHON_TARGET = root_path("docs/src/components/Colophon.generated.astro")

IDENTITY_HEADER = "Generated by scripts/sync_brand_assets.py from CITATION.cff and assets/project.json. Do not edit."


def _css_var(name: str) -> str:
    """Convert camelCase token name to CSS custom property name."""
    out = []
    for ch in name:
        if ch.isupper():
            out.append("-")
        out.append(ch.lower())
    return "--" + "".join(out)


def render_app_palette_css(palette: dict) -> str:
    """Generate CSS custom properties and theme mapping from palette dict."""
    lines = [f"/* {GENERATED_HEADER} */", ""]
    lines.append(":root {")
    for key, value in palette["light"].items():
        lines.append(f"  {_css_var(key)}: {value};")
    lines.append("}")
    lines.append("")
    lines.append('.dark:root, [data-theme="dark"] {')
    for key, value in palette["dark"].items():
        lines.append(f"  {_css_var(key)}: {value};")
    lines.append("}")
    lines.append("")
    lines.append("@theme inline {")
    for key in palette["light"]:
        prop = _css_var(key)
        lines.append(f"  --color{prop[1:]}: var({prop});")
    tokens = json.loads(TOKENS_SOURCE.read_text())
    lines.append(f"  --radius-md: {tokens['radius']['control']}px;")
    lines.append(f"  --radius-lg: {tokens['radius']['card']}px;")
    lines.append(f"  --radius-xl: {tokens['radius']['overlay']}px;")
    lines.append("}")
    return "\n".join(lines) + "\n"


def render_app_palette_ts(palette: dict) -> str:
    """Generate TypeScript palette export with type definition."""
    body = json.dumps(palette, indent=2)
    return (
        f"// {GENERATED_HEADER}\n"
        f"export const palette = {body} as const;\n"
        "export type PaletteScheme = typeof palette.light;\n"
    )


def sync_app_palette(*, check: bool) -> list[str]:
    """Generate (or verify) the app palette artifacts from assets/palette.json."""
    palette = json.loads(PALETTE_SOURCE.read_text())
    outputs = (
        (APP_CSS_TARGET, render_app_palette_css(palette)),
        (APP_TS_TARGET, render_app_palette_ts(palette)),
    )
    return [stale for target, content in outputs if (stale := write_or_check(target, content, check=check))]


TOKENS_SOURCE = root_path("assets/tokens.json")
APP_TOKENS_TS_TARGET = root_path("app/src/theme/tokens.generated.ts")
WEB_TOKENS_CSS_TARGETS = (
    root_path("www/src/styles/tokens.generated.css"),
    root_path("docs/src/styles/tokens.generated.css"),
)


def render_design_tokens_ts(tokens: dict) -> str:
    """Generate the TypeScript design-tokens export from tokens dict."""
    body = json.dumps(tokens, indent=2)
    return (
        f"// {GENERATED_HEADER.replace('palette.json', 'tokens.json')}\nexport const designTokens = {body} as const;\n"
    )


def render_design_tokens_css(tokens: dict) -> str:
    """Generate CSS custom properties for radius/shadow/scrim/chart tokens."""
    lines = [f"/* {GENERATED_HEADER.replace('palette.json', 'tokens.json')} */", "", ":root {"]
    for tier, px in tokens["radius"].items():
        if tier == "full":
            continue  # true pills use border-radius: 9999px inline; no web consumer
        lines.append(f"  --relab-radius-{tier}: {px}px;")
    shadow = tokens["shadowOverlay"]
    lines.append(f"  --relab-shadow-overlay: light-dark({shadow['light']}, {shadow['dark']});")
    scrim = tokens["scrim"]
    lines.append(f"  --relab-scrim: light-dark({scrim['light']}, {scrim['dark']});")
    for hue, values in tokens["chart"].items():
        for part, color in values.items():
            lines.append(f"  --relab-chart-{hue}-{part}: {color.lower()};")
    lines.append("}")
    return "\n".join(lines) + "\n"


def sync_design_tokens(*, check: bool) -> list[str]:
    """Generate (or verify) the design-token artifacts from assets/tokens.json."""
    tokens = json.loads(TOKENS_SOURCE.read_text())
    outputs = [
        (APP_TOKENS_TS_TARGET, render_design_tokens_ts(tokens)),
        *((target, render_design_tokens_css(tokens)) for target in WEB_TOKENS_CSS_TARGETS),
    ]
    return [stale for target, content in outputs if (stale := write_or_check(target, content, check=check))]


def load_project_identity() -> dict:
    """Merge CITATION.cff with assets/project.json into one identity record.

    CITATION.cff is authoritative for everything it models, so the citation
    metadata GitHub and Zenodo already read stays the single source. project.json
    only carries what CFF's strict schema rejects.
    """
    import yaml  # noqa: PLC0415 — deferred so image-only syncs need no YAML parser

    citation = yaml.safe_load(CITATION_SOURCE.read_text())
    project = json.loads(PROJECT_SOURCE.read_text())

    dois = [i for i in citation.get("identifiers", []) if i.get("type") == "doi"]
    if not dois:
        msg = f"{relative(CITATION_SOURCE)}: no DOI identifier found"
        raise RuntimeError(msg)
    # The concept DOI resolves to the newest release, which is what a "cite this
    # software" line wants. A per-version DOI here would pin every surface to one
    # release and silently go stale on the next. CITATION.cff now carries both, so
    # select on the description rather than by position: reordering that block must
    # not quietly repoint every www and docs surface at a single frozen release.
    concept = [i for i in dois if "concept" in str(i.get("description", "")).lower()]
    if not concept and len(dois) > 1:
        msg = (
            f"{relative(CITATION_SOURCE)}: several DOI identifiers and none described as the concept DOI; "
            "label the concept DOI so this stays unambiguous"
        )
        raise RuntimeError(msg)
    doi = (concept or dois)[0]["value"]

    people = citation.get("authors", [])
    if not people:
        msg = f"{relative(CITATION_SOURCE)}: no authors found"
        raise RuntimeError(msg)
    names = [f"{p['given-names']} {p['family-names']}" for p in people]
    joined = names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"

    repo = citation["repository-code"].rstrip("/")
    return {
        "affiliation": f"A research platform of the {project['institution']}",
        "institution": project["institution"],
        "department": project["department"],
        "authors": f"{joined}, {project['department']}, {project['institutionShort']}",
        "people": [{"name": n, "orcid": p.get("orcid", "")} for n, p in zip(names, people, strict=True)],
        "doi": doi,
        "citationUrl": f"https://doi.org/{doi}",
        "licence": citation["license"],
        "licenceUrl": f"{repo}/blob/main/LICENSE",
        "dataLicence": project["dataLicence"],
        "funding": project["funding"],
        "contactEmail": project["contactEmail"],
    }


def render_www_research_ts(identity: dict) -> str:
    """Generate the www research provenance module."""
    body = {
        key: identity[key]
        for key in ("affiliation", "institution", "authors", "citationUrl", "doi", "licence", "licenceUrl")
    }
    body["funding"] = identity["funding"]["short"]
    return (
        f"// {IDENTITY_HEADER}\n"
        "//\n"
        "// Research provenance, shown in the hero (affiliation) and the footer colophon.\n"
        "// The dataset licence is deliberately absent: it is planned, not published, and\n"
        "// docs/src/content/docs/project/dataset.md is its one canonical statement.\n"
        f"export const research = {json.dumps(body, indent=2)} as const;\n"
    )


def _escape(value: str) -> str:
    """Escape a string for a double-quoted Astro/JSX attribute or text node."""
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_docs_colophon_astro(identity: dict) -> str:
    """Generate the docs colophon component."""
    people = " and ".join(
        f'{_escape(p["name"])} (<a href="{p["orcid"]}">ORCID</a>)' if p["orcid"] else _escape(p["name"])
        for p in identity["people"]
    )
    data = identity["dataLicence"]
    return f"""---
// {IDENTITY_HEADER}
---

<div class="relab-colophon">
  <p>
    <strong>Relab</strong> — {_escape(identity["department"])}, {_escape(identity["institution"])}.
  </p>
  <p>{people}.</p>
  <p>
    Cite as <a href="{identity["citationUrl"]}">doi:{identity["doi"]}</a>.
  </p>
  <p>
    Code is <a href="{identity["licenceUrl"]}">{_escape(identity["licence"])}</a>; curated dataset
    releases are <a href="{data["docsPath"]}">{data["status"]} under {_escape(data["name"])}</a>.
  </p>
  <p>{_escape(identity["funding"]["sentence"])}</p>
  <p>
    Contact <a href="mailto:{identity["contactEmail"]}">{identity["contactEmail"]}</a>.
  </p>
</div>
"""


def sync_project_identity(*, check: bool) -> list[str]:
    """Generate (or verify) the project-identity artifacts for www and docs."""
    identity = load_project_identity()
    outputs = (
        (WWW_RESEARCH_TARGET, render_www_research_ts(identity)),
        (DOCS_COLOPHON_TARGET, render_docs_colophon_astro(identity)),
    )
    return [stale for target, content in outputs if (stale := write_or_check(target, content, check=check))]


BRAND_PARITY = (
    # (--relab-brand-* name, palette.json token, schemes-to-check). Divider is
    # deliberately absent: brand divider (#d9dfe8) and palette border (#C4C6D0)
    # are different ramps. Text checks LIGHT only: dark text intentionally
    # diverges (web #e9eff8 vs app #e2e6ee — documented in DESIGN.md).
    ("--relab-brand-primary", "primary", ("light", "dark")),
    ("--relab-brand-accent", "accent", ("light", "dark")),
    ("--relab-brand-text", "foreground", ("light",)),
    ("--relab-brand-surface", "background", ("light", "dark")),
)


def check_brand_parity() -> list[str]:
    """Fail --check when brand.css light-dark() pairs drift from palette.json."""
    css = root_path("assets/brand.css").read_text()
    palette = json.loads(PALETTE_SOURCE.read_text())
    mismatches: list[str] = []
    for var_name, token, schemes in BRAND_PARITY:
        marker = f"{var_name}: light-dark("
        start = css.index(marker) + len(marker)
        pair = css[start : css.index(")", start)].split(",")
        for scheme in schemes:
            expected = palette[scheme][token].lower()
            scheme_index = 0 if scheme == "light" else 1
            if pair[scheme_index].strip().lower() != expected:
                mismatches.append(f"{var_name} ({scheme}) != palette.json {token} ({expected})")
    return mismatches


def relative(path: Path) -> str:
    """Return a repository-relative display path, or the full path if outside the repo.

    Used inside error messages, so it must not raise: a path outside ROOT would
    otherwise replace the real failure with a ValueError from the reporting code.
    """
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def compare_bytes(expected: Path, actual: Path) -> bool:
    """Return whether two files have identical bytes."""
    try:
        return expected.read_bytes() == actual.read_bytes()
    except FileNotFoundError:
        return False


def copy_asset(source: Path, targets: tuple[Path, ...], *, check: bool) -> list[str]:
    """Copy or verify one source file against all targets."""
    out_of_sync: list[str] = []
    for target in targets:
        if check:
            if not compare_bytes(source, target):
                out_of_sync.append(relative(target))
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    return out_of_sync


def run_convert(source: Path, target: Path, args: tuple[str, ...], density: int) -> None:
    """Generate one asset with ImageMagick."""
    cli = imagemagick_cli()
    if cli is None:
        msg = "ImageMagick ('magick' or 'convert') is required to generate brand image assets."
        raise RuntimeError(msg)

    target.parent.mkdir(parents=True, exist_ok=True)
    output = f"PNG32:{target}" if target.suffix == ".png" else str(target)
    command = (cli, "-background", "none", "-density", str(density), str(source), *args, output)
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)  # noqa: S603
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() or exc.stdout.strip() or "unknown error"
        msg = f"Failed to generate {relative(target)}: {stderr}"
        raise RuntimeError(msg) from exc


def render_asset(source: Path, target: Path, args: tuple[str, ...], density: int, *, check: bool) -> list[str]:
    """Generate or verify one derived asset rendered from `source`."""
    if not check:
        run_convert(source, target, args, density)
        return []

    with tempfile.TemporaryDirectory() as temp_dir:
        generated = Path(temp_dir) / target.name
        run_convert(source, generated, args, density)
        if compare_bytes(generated, target):
            return []
    return [relative(target)]


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail when generated asset copies are stale")
    return parser.parse_args()


def main() -> int:
    """Sync or verify shared brand assets."""
    args = parse_args()
    out_of_sync: list[str] = []

    try:
        for source, targets in COPY_ASSETS:
            out_of_sync.extend(copy_asset(source, targets, check=args.check))
        out_of_sync.extend(sync_app_palette(check=args.check))
        out_of_sync.extend(sync_design_tokens(check=args.check))
        out_of_sync.extend(sync_project_identity(check=args.check))
        if args.check:
            out_of_sync.extend(check_brand_parity())
        # Each render spawns a serial ImageMagick process (~0.6s); fan them out
        # across cores since they're subprocess-bound and independent.
        with ThreadPoolExecutor(max_workers=os.cpu_count()) as pool:
            futures = [
                pool.submit(render_asset, source, target, convert_args, density, check=args.check)
                for source, target, convert_args, density in (*GENERATED_ASSETS, *PROCESSED_ASSETS)
            ]
            for future in futures:
                out_of_sync.extend(future.result())
    except RuntimeError as exc:
        sys.stderr.write(f"{exc}\n")
        return 1

    if args.check and out_of_sync:
        sys.stderr.write("Shared brand assets are out of sync:\n")
        for path in out_of_sync:
            sys.stderr.write(f"- {path}\n")
        return 1

    message = "Shared brand assets are in sync." if args.check else "Shared brand assets synced."
    sys.stdout.write(f"{message}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
