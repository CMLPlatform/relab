"""Generate the R9lab logo family: a font-derived, vertically squished 9.

The 9 is Titillium Web, non-uniformly scaled so it reads as a loop (a mirrored
"e"); the R/l/a/b letters come from IBM Plex Sans. Everything is baked into
self-contained SVG paths; no font needed to render.

Run from this directory:

    uv run --with fonttools --with brotli python3 make_r9lab.py

This writes the canonical ../r9lab-*.svg files directly;
scripts/sync_brand_assets.py owns every PNG/ico derivative rendered from them
(`just assets-sync`).
"""

from __future__ import annotations

import math
import sys
from functools import cache
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

HERE = Path(__file__).parent
FONTS = HERE / "fonts" / "candidates"
ASSETS = HERE.parent

# Brand palette (assets/DESIGN.md, Cyanotype & Manila)
LIGHT = {"nine": "#1f4c96", "letters": "#16202e", "muted": "#5a6675", "bg": "#f5f7fa"}
DARK = {"nine": "#8fb8ff", "letters": "#e9eff8", "muted": "#8c99ad", "bg": "#0c1220"}

# Tuned (Simon, 2026-07-13).
SPEC = {
    "nine_font": "titillium-web-600.woff2",
    "letter_font": "ibm-plex-sans-600.woff2",
    "sx": 1.05,
    "sy": 0.80,
}

RING_STROKE = 75  # per-1000 upm, matches a 600-weight stem
RING_PAD = 0.10  # ring radius padding, em
RING_GAP = 0.14  # gap between ring and tail letters, em


TAGLINE = "Open product data for the circular economy"


@cache  # glyph geometry is palette-independent; parse each font once
def load_glyphs(path: Path, chars: str = "R9lab") -> dict:
    """Extract glyph paths, advances, and bboxes for `chars` from a font file."""
    font = TTFont(path)
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    upm = font["head"].unitsPerEm
    out = {}
    for ch in set(chars):
        glyph = gs[cmap[ord(ch)]]
        spen = SVGPathPen(gs)
        glyph.draw(spen)
        bpen = BoundsPen(gs)
        glyph.draw(bpen)
        out[ch] = {"d": spen.getCommands(), "adv": glyph.width, "bbox": bpen.bounds}
    return {"glyphs": out, "upm": upm}


class Composer:
    """Places glyphs (and an optional ring) on a shared baseline, y-up font units."""

    def __init__(self, base_upm: float) -> None:
        """Start an empty canvas whose em equals `base_upm` font units."""
        self.base = base_upm
        self.x = 0.0
        self.parts: list[str] = []
        self.bounds = [math.inf, math.inf, -math.inf, -math.inf]

    def _grow(self, x0: float, y0: float, x1: float, y1: float) -> None:
        b = self.bounds
        b[0] = min(b[0], x0)
        b[1] = min(b[1], y0)
        b[2] = max(b[2], x1)
        b[3] = max(b[3], y1)

    def glyph(
        self,
        font: dict,
        ch: str,
        color: str,
        *,
        squish: tuple[float, float] | None = None,
    ) -> tuple[float, float, float, float]:
        """Place one glyph at the pen position; returns its placed bbox."""
        g = font["glyphs"][ch]
        r = self.base / font["upm"]
        if g["bbox"] is None:  # contourless glyph (space): advance only
            self.x += g["adv"] * r
            return (self.x, 0, self.x, 0)
        x0, y0, x1, y1 = (v * r for v in g["bbox"])
        adv = g["adv"] * r
        path = f'<path d="{g["d"]}" transform="scale(1,-1)" fill="{color}"/>'
        if squish:
            sx, sy = squish
            # anchor: glyph bbox centre horizontally, baseline vertically
            cx = (x0 + x1) / 2
            path = f'<g transform="translate({cx:.1f} 0) scale({sx} {sy}) translate({-cx:.1f} 0)">{path}</g>'
            adv += (sx - 1) * (x1 - x0)  # widen the advance by the width growth
            x0, x1 = cx + (x0 - cx) * sx, cx + (x1 - cx) * sx
            y0, y1 = y0 * sy, y1 * sy
        self.parts.append(f'<g transform="translate({self.x:.1f} 0) scale({r:.4f})">{path}</g>')
        self._grow(self.x + x0, y0, self.x + x1, y1)
        placed = (self.x + x0, y0, self.x + x1, y1)
        self.x += adv
        return placed

    def ring(self, span: tuple[float, float, float, float], color: str) -> None:
        """Circle around `span` (a placed bbox); moves the pen past its right edge."""
        cx, cy = (span[0] + span[2]) / 2, (span[1] + span[3]) / 2
        rad = math.hypot(span[2] - span[0], span[3] - span[1]) / 2 * 1.02 + RING_PAD * self.base
        sw = RING_STROKE * self.base / 1000
        self.parts.append(
            f'<circle cx="{cx:.1f}" cy="{-cy:.1f}" r="{rad:.1f}" fill="none" stroke="{color}" stroke-width="{sw:.1f}"/>'
        )
        self._grow(cx - rad - sw / 2, cy - rad - sw / 2, cx + rad + sw / 2, cy + rad + sw / 2)
        self.x = cx + rad + sw / 2 + RING_GAP * self.base

    def svg(self, label: str) -> str:
        """Serialize the canvas as a standalone SVG document."""
        x0, y0, x1, y1 = self.bounds
        pad = 0.06 * (y1 - y0)
        vb = f"{x0 - pad:.1f} {-(y1 + pad):.1f} {x1 - x0 + 2 * pad:.1f} {y1 - y0 + 2 * pad:.1f}"
        # nominal size in CSS px (viewBox stays in font units) so rasterizers
        # with a density flag don't blow past their canvas limits
        w, h = x1 - x0 + 2 * pad, y1 - y0 + 2 * pad
        nom_h = 256
        nom_w = w / h * nom_h
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" '
            f'width="{nom_w:.0f}" height="{nom_h}" role="img" aria-label="{label}">'
            f"{''.join(self.parts)}</svg>\n"
        )


def merge(
    a: tuple[float, float, float, float], b: tuple[float, float, float, float]
) -> tuple[float, float, float, float]:
    """Union of two bboxes."""
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def build_set(spec: dict, colors: dict) -> dict[str, str]:
    """Build the SVG variants (mark, wordmark, logo) for the spec."""
    nine = load_glyphs(FONTS / spec["nine_font"])
    letters = load_glyphs(FONTS / spec["letter_font"])
    base = letters["upm"]
    nine_kw = {"squish": (spec["sx"], spec["sy"])}

    out = {}

    c = Composer(base)
    c.glyph(nine, "9", colors["nine"], **nine_kw)
    out["mark"] = c.svg("Relab mark")

    c = Composer(base)
    c.glyph(letters, "R", colors["letters"])
    c.glyph(nine, "9", colors["nine"], **nine_kw)
    for ch in "lab":
        c.glyph(letters, ch, colors["letters"])
    out["wordmark"] = c.svg("Relab")

    c = Composer(base)
    span = c.glyph(letters, "R", colors["letters"])
    span = merge(span, c.glyph(nine, "9", colors["nine"], **nine_kw))
    c.ring(span, colors["nine"])
    for ch in "lab":
        c.glyph(letters, ch, colors["letters"])
    out["logo"] = c.svg("Relab")  # ringed wordmark: the flask successor

    return out


def adaptive(svg: str) -> str:
    """Favicon variant: a light-palette SVG that swaps to the dark palette in dark tabs."""
    rules = "".join(
        f'[fill="{LIGHT[k]}"]{{fill:{DARK[k]}}}[stroke="{LIGHT[k]}"]{{stroke:{DARK[k]}}}'
        for k in ("nine", "letters", "muted")
    )
    style = f"<style>@media (prefers-color-scheme: dark){{{rules}}}</style>"
    return svg.replace(">", f">{style}", 1)  # inject after the opening <svg> tag


def og_svg(spec: dict, colors: dict) -> str:
    """Build a 1200x630 social card: centred wordmark over the tagline."""
    nine = load_glyphs(FONTS / spec["nine_font"])
    letters = load_glyphs(FONTS / spec["letter_font"], "R9lab" + TAGLINE)
    base = letters["upm"]
    nine_kw = {"squish": (spec["sx"], spec["sy"])}

    wm = Composer(base)
    wm.glyph(letters, "R", colors["letters"])
    wm.glyph(nine, "9", colors["nine"], **nine_kw)
    for ch in "lab":
        wm.glyph(letters, ch, colors["letters"])

    tag = Composer(base)
    for ch in TAGLINE:
        tag.glyph(letters, ch, colors["muted"])

    def place(c: Composer, width: float, baseline_y: float) -> str:
        x0, _, x1, _ = c.bounds
        s = width / (x1 - x0)
        tx = 600 - s * (x0 + x1) / 2
        return f'<g transform="translate({tx:.1f} {baseline_y}) scale({s:.5f})">{"".join(c.parts)}</g>'

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" '
        f'role="img" aria-label="Relab — {TAGLINE}">'
        f'<rect width="1200" height="630" fill="{colors["bg"]}"/>'
        f"{place(wm, 560, 350)}{place(tag, 460, 450)}</svg>\n"
    )


def main() -> None:
    """Generate the r9lab logo family, writing it straight to the canonical asset names.

    Rasterization (PNG/ico) is owned by scripts/sync_brand_assets.py, which
    renders from these canonical SVGs; run `just assets-sync` afterwards.
    """
    mark_light = None
    for suffix, colors in (("", LIGHT), ("-dark", DARK)):
        for variant, svg in build_set(SPEC, colors).items():
            (ASSETS / f"r9lab-{variant}{suffix}.svg").write_text(svg)
            if variant == "mark" and not suffix:
                mark_light = svg
        (ASSETS / f"r9lab-og{suffix}.svg").write_text(og_svg(SPEC, colors))
    (ASSETS / "r9lab-mark-adaptive.svg").write_text(adaptive(mark_light))
    sys.stdout.write("generated assets/r9lab-*.svg\n")


if __name__ == "__main__":
    main()
