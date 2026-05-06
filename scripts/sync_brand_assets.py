#!/usr/bin/env python3
"""Sync shared brand assets into RELab subrepos."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONVERT = "convert"


@dataclass(frozen=True)
class CopyAsset:
    """A byte-for-byte asset copy."""

    source: Path
    targets: tuple[Path, ...]


@dataclass(frozen=True)
class GeneratedAsset:
    """An asset generated through ImageMagick."""

    target: Path
    args: tuple[str, ...]


def root_path(path: str) -> Path:
    """Return an absolute path under the repository root."""
    return ROOT / path


WEB_FONT_FILES = (
    "ibm-plex-sans-latin-ext.woff2",
    "ibm-plex-sans-latin.woff2",
    "ibm-plex-sans-italic-latin-ext.woff2",
    "ibm-plex-sans-italic-latin.woff2",
    "literata-latin-ext.woff2",
    "literata-latin.woff2",
)
APP_FONT_FILES = (
    "IBMPlexSans-Regular.ttf",
    "IBMPlexSans-Medium.ttf",
    "IBMPlexSans-SemiBold.ttf",
    "IBMPlexSans-Bold.ttf",
    "IBMPlexSans-Italic.ttf",
)

COPY_ASSETS = (
    CopyAsset(
        source=root_path("assets/brand/brand.css"),
        targets=(
            root_path("docs/src/styles/brand.css"),
            root_path("www/src/styles/brand.css"),
        ),
    ),
    CopyAsset(
        source=root_path("assets/brand/images/bg-light.jpg"),
        targets=(
            root_path("app/src/assets/images/bg-light.jpg"),
            root_path("docs/public/images/bg-light.jpg"),
            root_path("www/public/images/bg-light.jpg"),
        ),
    ),
    CopyAsset(
        source=root_path("assets/brand/images/bg-dark.jpg"),
        targets=(
            root_path("app/src/assets/images/bg-dark.jpg"),
            root_path("docs/public/images/bg-dark.jpg"),
            root_path("www/public/images/bg-dark.jpg"),
        ),
    ),
    CopyAsset(
        source=root_path("assets/brand/logo.svg"),
        targets=(
            root_path("docs/public/images/logo.svg"),
            root_path("docs/public/images/favicon.svg"),
            root_path("www/public/images/logo.svg"),
            root_path("www/public/images/favicon.svg"),
        ),
    ),
    *(
        CopyAsset(
            source=root_path(f"assets/brand/fonts/{font_file}"),
            targets=(
                root_path(f"docs/public/fonts/{font_file}"),
                root_path(f"www/public/fonts/{font_file}"),
            ),
        )
        for font_file in WEB_FONT_FILES
    ),
    *(
        CopyAsset(
            source=root_path(f"assets/brand/fonts/native/{font_file}"),
            targets=(root_path(f"app/src/assets/fonts/{font_file}"),),
        )
        for font_file in APP_FONT_FILES
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


GENERATED_ASSETS = (
    GeneratedAsset(target=root_path("app/src/assets/images/favicon.png"), args=png_args(512)),
    GeneratedAsset(target=root_path("docs/public/images/logo.png"), args=png_args(512)),
    GeneratedAsset(target=root_path("www/public/images/logo.png"), args=png_args(512)),
    GeneratedAsset(target=root_path("docs/public/images/favicon-48.png"), args=png_args(48)),
    GeneratedAsset(target=root_path("www/public/images/favicon-48.png"), args=png_args(48)),
    GeneratedAsset(target=root_path("docs/public/images/apple-touch-icon.png"), args=png_args(180)),
    GeneratedAsset(target=root_path("www/public/images/apple-touch-icon.png"), args=png_args(180)),
    GeneratedAsset(
        target=root_path("backend/app/static/favicon.ico"),
        args=("-define", "icon:auto-resize=48,32,16"),
    ),
    GeneratedAsset(
        target=root_path("docs/public/images/favicon.ico"),
        args=("-define", "icon:auto-resize=48,32,16"),
    ),
    GeneratedAsset(
        target=root_path("www/public/images/favicon.ico"),
        args=("-define", "icon:auto-resize=48,32,16"),
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


def copy_asset(asset: CopyAsset, *, check: bool) -> list[str]:
    """Copy or verify one source file against all targets."""
    out_of_sync: list[str] = []
    for target in asset.targets:
        if check:
            if not compare_bytes(asset.source, target):
                out_of_sync.append(relative(target))
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(asset.source, target)
    return out_of_sync


def run_convert(source: Path, target: Path, args: tuple[str, ...]) -> None:
    """Generate one asset with ImageMagick."""
    if shutil.which(CONVERT) is None:
        msg = "ImageMagick 'convert' is required to generate brand image assets."
        raise RuntimeError(msg)

    target.parent.mkdir(parents=True, exist_ok=True)
    output = f"PNG32:{target}" if target.suffix == ".png" else str(target)
    command = (CONVERT, "-background", "none", "-density", "2048", str(source), *args, output)
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)  # noqa: S603
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() or exc.stdout.strip() or "unknown error"
        msg = f"Failed to generate {relative(target)}: {stderr}"
        raise RuntimeError(msg) from exc


def generated_asset(asset: GeneratedAsset, *, check: bool) -> list[str]:
    """Generate or verify one derived asset."""
    source = root_path("assets/brand/logo.svg")
    if not check:
        run_convert(source, asset.target, asset.args)
        return []

    with tempfile.TemporaryDirectory() as temp_dir:
        generated = Path(temp_dir) / asset.target.name
        run_convert(source, generated, asset.args)
        if compare_bytes(generated, asset.target):
            return []
    return [relative(asset.target)]


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
        for asset in COPY_ASSETS:
            out_of_sync.extend(copy_asset(asset, check=args.check))
        for asset in GENERATED_ASSETS:
            out_of_sync.extend(generated_asset(asset, check=args.check))
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
