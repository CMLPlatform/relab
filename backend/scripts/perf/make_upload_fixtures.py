"""Derive larger upload fixtures from the committed sample photograph.

The baseline's upload scenario needs a spread of photo sizes: a 1200x900 upload
skips the 1600px derivative entirely and puts ~21ms of thumbnail work in play,
so on that fixture alone the scenario cannot see a regression in the part of the
pipeline that actually costs something.

Larger sizes are tiled from the committed sample rather than generated or
upscaled. Tiling repeats the source's own frequency content, so decode, resize
and encode cost per pixel stay in the range a real photograph produces —
a smooth synthetic gradient compresses and resamples far faster than either.
Upscaling would invent detail that is not there and understate the same costs.

Written to a gitignored directory: the outputs are reproducible from one 87 KB
source, and committing multi-megabyte binaries to carry them is not worth it.

Run with: python -m scripts.perf.make_upload_fixtures
"""

import logging
from pathlib import Path

from PIL import Image as PILImage

# Stdlib logging, not `app.core.logging`: importing that pulls in Settings, which
# requires ENVIRONMENT to be set. Nothing here reads configuration, and a fixture
# generator that cannot run without a configured environment fails in the one place
# it is needed most — a bare CI job that only wanted to build two JPEGs.
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

PERF_DIR = Path(__file__).resolve().parents[2] / "perf"
SOURCE = PERF_DIR / "fixtures" / "upload-sample.jpg"
GENERATED_DIR = PERF_DIR / "fixtures" / "generated"

# (name, tiles per axis). The source is 1200x900, so:
#   medium -> 2400x1800, the smallest size at which every standard width applies
#   large  -> 4800x3600 (17MP), in the range a phone or DSLR upload actually lands
TILINGS: tuple[tuple[str, int], ...] = (("medium", 2), ("large", 4))
JPEG_QUALITY = 85


def build_fixture(source: PILImage.Image, name: str, tiles: int) -> Path:
    """Tile *source* into a `tiles` x `tiles` mosaic and write it as JPEG."""
    width, height = source.size
    canvas = PILImage.new("RGB", (width * tiles, height * tiles))
    for row in range(tiles):
        for column in range(tiles):
            canvas.paste(source, (column * width, row * height))

    destination = GENERATED_DIR / f"upload-{name}.jpg"
    canvas.save(destination, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return destination


def main() -> None:
    """Generate every configured fixture size."""
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    with PILImage.open(SOURCE) as source:
        source.load()
        rgb_source = source.convert("RGB")

    for name, tiles in TILINGS:
        destination = build_fixture(rgb_source, name, tiles)
        with PILImage.open(destination) as written:
            size = written.size
        logger.info("Wrote %s (%dx%d, %.0f KB)", destination.name, size[0], size[1], destination.stat().st_size / 1024)


if __name__ == "__main__":
    main()
