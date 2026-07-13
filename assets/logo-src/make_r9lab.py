"""Generate the R9lab logo family: a font-derived, vertically squished 9.

The 9 comes from a candidate font, non-uniformly scaled so it reads as a loop
(a mirrored "e"); the R/l/a/b letters come from IBM Plex. Everything is baked
into self-contained SVG paths — no font needed to render.

Run from this directory:

    uv run --with fonttools --with brotli python3 make_r9lab.py            # all candidates
    uv run --with fonttools --with brotli python3 make_r9lab.py --promote varela

The first form writes every candidate's set to candidates/<name>/. --promote
additionally copies that candidate's files onto the canonical ../r9lab-*.svg
names; scripts/sync_brand_assets.py owns every PNG/ico derivative rendered
from them (`just assets-sync`).
"""

from __future__ import annotations

import argparse
import math
import shutil
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

# Tuned per candidate (Simon, 2026-07-13). `embolden` strokes the outline to
# fake a missing bold cut (Varela ships 400 only); units are per-1000 upm.
CANDIDATES = {
    "varela": {
        "nine_font": "varela-400.woff2",
        "letter_font": "ibm-plex-sans-500.woff2",
        "sx": 1.0,
        "sy": 0.80,
        "embolden": 8,
    },
    "petrona": {
        "nine_font": "petrona-600.woff2",
        "letter_font": "ibm-plex-serif-600.woff2",
        "sx": 1.05,
        "sy": 0.80,
        "embolden": 0,
    },
    "titillium": {
        "nine_font": "titillium-web-600.woff2",
        "letter_font": "ibm-plex-sans-600.woff2",
        "sx": 1.05,
        "sy": 0.80,
        "embolden": 0,
    },
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
        embolden: float = 0,
    ) -> tuple[float, float, float, float]:
        """Place one glyph at the pen position; returns its placed bbox."""
        g = font["glyphs"][ch]
        r = self.base / font["upm"]
        if g["bbox"] is None:  # contourless glyph (space): advance only
            self.x += g["adv"] * r
            return (self.x, 0, self.x, 0)
        x0, y0, x1, y1 = (v * r for v in g["bbox"])
        adv = g["adv"] * r
        stroke = ""
        if embolden:
            sw = embolden * self.base / 1000
            stroke = f' stroke="{color}" stroke-width="{sw / r:.1f}" stroke-linejoin="round"'
            x0 -= sw / 2
            y0 -= sw / 2
            x1 += sw / 2
            y1 += sw / 2
        path = f'<path d="{g["d"]}" transform="scale(1,-1)" fill="{color}"{stroke}/>'
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
    """Build the four SVG variants (mark, mark-ring, wordmark, logo) for one candidate."""
    nine = load_glyphs(FONTS / spec["nine_font"])
    letters = load_glyphs(FONTS / spec["letter_font"])
    base = letters["upm"]
    squish = (spec["sx"], spec["sy"])
    nine_kw = {"squish": squish, "embolden": spec["embolden"]}

    out = {}

    c = Composer(base)
    c.glyph(nine, "9", colors["nine"], **nine_kw)
    out["mark"] = c.svg("Relab mark")

    c = Composer(base)
    span = c.glyph(nine, "9", colors["nine"], **nine_kw)
    c.ring(span, colors["nine"])
    out["mark-ring"] = c.svg("Relab mark in ring")

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


def og_svg(spec: dict, colors: dict) -> str:
    """Build a 1200x630 social card: centred wordmark over the tagline."""
    nine = load_glyphs(FONTS / spec["nine_font"])
    letters = load_glyphs(FONTS / spec["letter_font"], "R9lab" + TAGLINE)
    base = letters["upm"]
    nine_kw = {"squish": (spec["sx"], spec["sy"]), "embolden": spec["embolden"]}

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


# candidate file -> canonical asset name. All rasterization (PNG/ico) is owned
# by scripts/sync_brand_assets.py, which renders from these canonical SVGs —
# run `just assets-sync` after promoting.
PROMOTION = {
    "mark.svg": "r9lab-mark.svg",
    "mark-dark.svg": "r9lab-mark-dark.svg",
    "wordmark.svg": "r9lab-wordmark.svg",
    "wordmark-dark.svg": "r9lab-wordmark-dark.svg",
    "logo.svg": "r9lab-logo.svg",
    "logo-dark.svg": "r9lab-logo-dark.svg",
    "og.svg": "r9lab-og.svg",
    "og-dark.svg": "r9lab-og-dark.svg",
}


def main() -> None:
    """Generate all candidate sets; optionally promote one to canonical names."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--promote", choices=sorted(CANDIDATES), help="copy this candidate onto the canonical asset names"
    )
    args = parser.parse_args()

    for name, spec in CANDIDATES.items():
        outdir = HERE / "candidates" / name
        outdir.mkdir(parents=True, exist_ok=True)
        for suffix, colors in (("", LIGHT), ("-dark", DARK)):
            for variant, svg in build_set(spec, colors).items():
                (outdir / f"{variant}{suffix}.svg").write_text(svg)
            (outdir / f"og{suffix}.svg").write_text(og_svg(spec, colors))
        sys.stdout.write(f"generated candidates/{name}/\n")

    if args.promote:
        srcdir = HERE / "candidates" / args.promote
        for src, target in PROMOTION.items():
            shutil.copyfile(srcdir / src, ASSETS / target)
            sys.stdout.write(f"promoted {src} -> assets/{target}\n")
        sys.stdout.write("run `just assets-sync` to regenerate PNG/ico derivatives\n")


if __name__ == "__main__":
    main()
