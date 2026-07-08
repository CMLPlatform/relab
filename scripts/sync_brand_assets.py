#!/usr/bin/env python3
"""Sync shared brand assets into RELab subrepos."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOGO_SOURCE = ROOT / "assets/logo.svg"  # the flask logo (wide, detailed)
# Favicons / app icons are square and rendered as small as 16px, so they use the
# simple near-square mark rather than the detailed logo.
MARK_SOURCE = ROOT / "assets/r9lab-mark.svg"
MARK_DARK_SOURCE = ROOT / "assets/r9lab-mark-dark.svg"
LOGO_DARK_SOURCE = ROOT / "assets/r9lab-flask-logo-dark.svg"  # flask logo, cyan for dark backgrounds
WORDMARK_SOURCE = ROOT / "assets/r9lab-wordmark.svg"  # horizontal lockup (light mode)
WORDMARK_DARK_SOURCE = ROOT / "assets/r9lab-wordmark-dark.svg"  # cyan variant for dark headers


def imagemagick_cli() -> str | None:
    """Resolve the ImageMagick CLI: `magick` (IMv7) with a `convert` (IMv6) fallback."""
    return shutil.which("magick") or shutil.which("convert")


def root_path(path: str) -> Path:
    """Return an absolute path under the repository root."""
    return ROOT / path


WEB_FONT_FILES = (
    "ibm-plex-sans-latin-ext.woff2",
    "ibm-plex-sans-latin.woff2",
)

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
    (
        LOGO_SOURCE,
        (
            root_path("docs/public/images/logo.svg"),
            root_path("www/public/images/logo.svg"),
        ),
    ),
    (
        LOGO_DARK_SOURCE,
        (
            root_path("docs/public/images/logo-dark.svg"),
            root_path("www/public/images/logo-dark.svg"),
        ),
    ),
    (
        MARK_SOURCE,
        (
            root_path("docs/public/images/favicon.svg"),
            root_path("www/public/images/favicon.svg"),
        ),
    ),
    (
        WORDMARK_SOURCE,
        (
            root_path("docs/public/images/wordmark.svg"),
            root_path("www/public/images/wordmark.svg"),
        ),
    ),
    (
        WORDMARK_DARK_SOURCE,
        (
            root_path("docs/public/images/wordmark-dark.svg"),
            root_path("www/public/images/wordmark-dark.svg"),
        ),
    ),
    (
        root_path("assets/r9lab-og.png"),  # 1200x630 social share card (dark)
        (
            root_path("www/public/images/og.png"),
            root_path("docs/public/images/og.png"),
        ),
    ),
    (
        root_path("assets/r9lab-og-light.png"),
        (
            root_path("www/public/images/og-light.png"),
            root_path("docs/public/images/og-light.png"),
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


# (source, target, ImageMagick args). Square icons render from the mark; the wide
# logo.png (used as the og/share image) keeps the full logo.
GENERATED_ASSETS = (
    (MARK_SOURCE, root_path("app/src/assets/images/favicon.png"), png_args(512)),
    (LOGO_SOURCE, root_path("app/src/assets/images/logo.png"), png_args(512)),
    (LOGO_DARK_SOURCE, root_path("app/src/assets/images/logo-dark.png"), png_args(512)),
    # in-app marks (mark for empty states, wordmark for the header) in light + dark
    (MARK_SOURCE, root_path("app/src/assets/images/mark.png"), png_args(256)),
    (MARK_DARK_SOURCE, root_path("app/src/assets/images/mark-dark.png"), png_args(256)),
    (WORDMARK_SOURCE, root_path("app/src/assets/images/wordmark.png"), png_wide(240)),
    (WORDMARK_DARK_SOURCE, root_path("app/src/assets/images/wordmark-dark.png"), png_wide(240)),
    (LOGO_SOURCE, root_path("www/public/images/logo.png"), png_args(512)),
    (MARK_SOURCE, root_path("docs/public/images/apple-touch-icon.png"), png_args(180)),
    (MARK_SOURCE, root_path("www/public/images/apple-touch-icon.png"), png_args(180)),
    (MARK_SOURCE, root_path("backend/app/static/favicon.ico"), ("-define", "icon:auto-resize=48,32,16")),
    (MARK_SOURCE, root_path("docs/public/favicon.ico"), ("-define", "icon:auto-resize=48,32,16")),
    (MARK_SOURCE, root_path("www/public/favicon.ico"), ("-define", "icon:auto-resize=48,32,16")),
)


def blurred_backdrop_args() -> tuple[str, ...]:
    """ImageMagick args for a downscaled, pre-blurred JPEG backdrop.

    The www and docs sites render the backdrop heavily blurred and
    semi-transparent, so a smaller pre-blurred JPEG is visually identical at ~85%
    fewer bytes than the shared full-resolution source (which app renders sharp
    and must keep).
    """
    return (
        "-resize",
        "1280x",
        "-gaussian-blur",
        "0x2",
        "-sampling-factor",
        "4:2:0",
        "-strip",
        "-interlace",
        "JPEG",
        "-quality",
        "50",
    )


# (source, target, ImageMagick args) — derived from a raster source, not the logo.
PROCESSED_ASSETS = (
    (
        root_path("assets/images/bg-light.jpg"),
        root_path("www/public/images/bg-light.jpg"),
        blurred_backdrop_args(),
    ),
    (
        root_path("assets/images/bg-dark.jpg"),
        root_path("www/public/images/bg-dark.jpg"),
        blurred_backdrop_args(),
    ),
    (
        root_path("assets/images/bg-light.jpg"),
        root_path("docs/public/images/bg-light.jpg"),
        blurred_backdrop_args(),
    ),
    (
        root_path("assets/images/bg-dark.jpg"),
        root_path("docs/public/images/bg-dark.jpg"),
        blurred_backdrop_args(),
    ),
)


def relative(path: Path) -> str:
    """Return a repository-relative display path."""
    return path.relative_to(ROOT).as_posix()


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


def run_convert(source: Path, target: Path, args: tuple[str, ...]) -> None:
    """Generate one asset with ImageMagick."""
    cli = imagemagick_cli()
    if cli is None:
        msg = "ImageMagick ('magick' or 'convert') is required to generate brand image assets."
        raise RuntimeError(msg)

    target.parent.mkdir(parents=True, exist_ok=True)
    output = f"PNG32:{target}" if target.suffix == ".png" else str(target)
    command = (cli, "-background", "none", "-density", "2048", str(source), *args, output)
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)  # noqa: S603
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() or exc.stdout.strip() or "unknown error"
        msg = f"Failed to generate {relative(target)}: {stderr}"
        raise RuntimeError(msg) from exc


def render_asset(source: Path, target: Path, args: tuple[str, ...], *, check: bool) -> list[str]:
    """Generate or verify one derived asset rendered from `source`."""
    if not check:
        run_convert(source, target, args)
        return []

    with tempfile.TemporaryDirectory() as temp_dir:
        generated = Path(temp_dir) / target.name
        run_convert(source, generated, args)
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
        for source, target, convert_args in GENERATED_ASSETS:
            out_of_sync.extend(render_asset(source, target, convert_args, check=args.check))
        for source, target, convert_args in PROCESSED_ASSETS:
            out_of_sync.extend(render_asset(source, target, convert_args, check=args.check))
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
