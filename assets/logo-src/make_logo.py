"""Compose the R9lab logo, wordmark, and flask marks from font glyphs.

Sets an EB Garamond capital R, the custom 9 mark, an optional "lab" tail, and an
optional Erlenmeyer flask behind them, baking the drop shadows into embedded
PNGs so the result renders in any SVG viewer (not only ones with live filters).

    make_logo.py --flask yes --tail lab --out ../r9lab-wordmark.svg
"""

import argparse
import base64
import re
import sys
from pathlib import Path

import cairosvg
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

p = argparse.ArgumentParser()
p.add_argument("--overlap", type=float, default=165)
p.add_argument("--rcol", default="#0a6e88")
p.add_argument("--ncol", default="#004f65")
p.add_argument("--flaskcol", default="#006783")
p.add_argument("--flaskvscale", type=float, default=1.0, help="scale the flask's total height above/below the R9")
p.add_argument(
    "--necklen", type=float, default=230, help="neck length; longer neck = shorter body, total height unchanged"
)
p.add_argument("--flask", choices=["yes", "no"], default="yes")
p.add_argument("--mark", default="../r9lab-mark.svg", help="SVG of the custom 9 glyph")
p.add_argument("--tail", default="", help="letters to set after the 9, e.g. 'lab' for the wordmark")
p.add_argument("--tailcol", default="", help="tail colour (defaults to --rcol)")
p.add_argument("--gap", type=float, default=50, help="space between the 9 and the tail")
p.add_argument("--ninescale", type=float, default=0.9, help="9 size vs cap height (bottom stays on the baseline)")
p.add_argument("--square", choices=["yes", "no"], default="yes", help="pad the viewBox to a square (for icons)")
p.add_argument("--shadowcol", default="#0f3255")
p.add_argument("--shadowop", type=float, default=0.5)
p.add_argument("--out", default="logo.svg")
a = p.parse_args()
BASE = 900.0
# shadow: baked as a blurred <image> so it renders everywhere (not a live filter)
SDX, SDY, SSTD, PPU = 15, 19, 33, 1.15
SCOL, SOP = a.shadowcol, a.shadowop

f = instancer.instantiateVariableFont(TTFont("fonts/EBGaramond-var.ttf"), {"wght": 600})
gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
bp = BoundsPen(gs)
gs[cmap[ord("R")]].draw(bp)
Rx0, _, Rx1, Ry1 = bp.bounds
CAP = Ry1
sp = SVGPathPen(gs)
gs[cmap[ord("R")]].draw(TransformPen(sp, (1, 0, 0, -1, 0, BASE)))
R_d = sp.getCommands()

mk = Path(a.mark).read_text(encoding="utf-8")
md = re.search(r'<path[^>]*\bd="([^"]+)"', mk).group(1)
_mc = [float(n) for n in re.findall(r"-?\d+\.?\d*", md)]  # 9 bbox from its path (viewBox-independent)
mnx, mny, mxx, mxy = min(_mc[0::2]), min(_mc[1::2]), max(_mc[0::2]), max(_mc[1::2])
mw, mh = mxx - mnx, mxy - mny
s = CAP / mh * a.ninescale
x9 = hmtx[cmap[ord("R")]][0] - a.overlap
TX, TY = x9 - s * mnx, BASE - s * mxy  # anchor the 9's foot on the baseline


def apply_t(d: str, sc: float, tx: float, ty: float) -> str:
    """Bake a uniform scale + translate into an SVG path's coords (y-down -> y-down)."""
    out, flip = [], 0
    for tok in re.split(r"(-?\d+\.?\d*)", d):
        if re.fullmatch(r"-?\d+\.?\d*", tok or ""):
            v = float(tok)
            v = tx + sc * v if flip == 0 else ty + sc * v
            out.append(f"{v:.1f}")
            flip ^= 1
        else:
            out.append(tok)
    return "".join(out)


nine_d = apply_t(md, s, TX, TY)


def bbox(d: str) -> tuple[float, float, float, float]:
    """Return the (min x, min y, max x, max y) bounds of an SVG path's coords."""
    c = [float(n) for n in re.findall(r"-?\d+\.?\d*", d)]
    return min(c[0::2]), min(c[1::2]), max(c[0::2]), max(c[1::2])


def shadow_image(d: str) -> str:
    """Render a blurred silhouette of a path as an embedded PNG <image> element."""
    bx, by, bx2, by2 = bbox(d)
    bw, bh = bx2 - bx, by2 - by
    pad = 3 * SSTD + max(SDX, SDY) + 14
    vx, vy, vw, vh = bx - pad, by - pad, bw + 2 * pad, bh + 2 * pad
    ss = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx:.1f} {vy:.1f} {vw:.1f} {vh:.1f}">'
        f'<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%">'
        f'<feGaussianBlur stdDeviation="{SSTD}"/></filter></defs>'
        f'<path d="{d}" fill="{SCOL}" fill-opacity="{SOP}" filter="url(#b)"/></svg>'
    )
    png = cairosvg.svg2png(bytestring=ss.encode(), output_width=int(vw * PPU), output_height=int(vh * PPU))
    b64 = base64.b64encode(png).decode()
    return (
        f'<image x="{vx + SDX:.1f}" y="{vy + SDY:.1f}" width="{vw:.1f}" '
        f'height="{vh:.1f}" href="data:image/png;base64,{b64}"/>'
    )


sh_r, sh_9 = shadow_image(R_d), shadow_image(nine_d)
nine_r = x9 + mw * s

# ---- optional tail letters (e.g. "lab") set after the 9 ----
tail_layers = []
right = nine_r
if a.tail:
    penx = nine_r + a.gap
    spt = SVGPathPen(gs)
    for ch in a.tail:
        gs[cmap[ord(ch)]].draw(TransformPen(spt, (1, 0, 0, -1, penx, BASE)))
        penx += hmtx[cmap[ord(ch)]][0]
    tail_d = spt.getCommands()
    right = penx
    tail_layers = [shadow_image(tail_d), f'<path d="{tail_d}" fill="{a.tailcol or a.rcol}"/>']

gxmin, gxmax = Rx0, right
cx = (Rx0 + nine_r) / 2  # flask sits on the R9 only (same as the flask mark); a tail extends past it

# ---- flask: straight cone into a wide vertical neck, narrower rounded base ----
top_y = BASE - CAP
neck_top = top_y - 117 * a.flaskvscale  # flask top (rim); total height fixed at vscale 1
base_y = BASE + 41 * a.flaskvscale  # flask base
shoulder_y = neck_top + a.necklen  # neck meets cone; longer neck => shorter body
neck_hw = 118
base_hw = (nine_r - Rx0) / 2 - 8
rim, r = 34, 90
body = (
    f"M{cx - neck_hw:.0f} {neck_top:.0f} L{cx - neck_hw:.0f} {shoulder_y:.0f} "
    f"L{cx - base_hw + r * 0.45:.0f} {base_y - r:.0f} "
    f"Q{cx - base_hw:.0f} {base_y:.0f} {cx - base_hw + r:.0f} {base_y:.0f} "
    f"L{cx + base_hw - r:.0f} {base_y:.0f} "
    f"Q{cx + base_hw:.0f} {base_y:.0f} {cx + base_hw - r * 0.45:.0f} {base_y - r:.0f} "
    f"L{cx + neck_hw:.0f} {shoulder_y:.0f} L{cx + neck_hw:.0f} {neck_top:.0f}"
)
rim_d = f"M{cx - neck_hw - rim:.0f} {neck_top:.0f} H{cx + neck_hw + rim:.0f}"
flask = (
    (
        f'<path d="{body} {rim_d}" fill="none" stroke="{a.flaskcol}" stroke-opacity="0.42" '
        f'stroke-width="20" stroke-linejoin="round" stroke-linecap="round"/>'
    )
    if a.flask == "yes"
    else ""
)

# ---- compose (back to front) ----
layers = [
    flask,
    sh_r,
    f'<path d="{R_d}" fill="{a.rcol}"/>',
    sh_9,
    f'<path d="{nine_d}" fill="{a.ncol}"/>',
    *tail_layers,
]
M = 130
fx0 = cx - base_hw if a.flask == "yes" else gxmin
fx1 = cx + base_hw if a.flask == "yes" else gxmax
fy0 = neck_top if a.flask == "yes" else BASE - CAP
fy1 = base_y if a.flask == "yes" else BASE
X0 = min(gxmin, fx0) - M
X1 = max(gxmax, fx1) + M
Y0 = min(BASE - CAP, fy0) - M
Y1 = max(BASE, fy1) + M
vb_w, vb_h = X1 - X0, Y1 - Y0
if a.square == "yes":  # pad to a square so icon slots don't letterbox
    side = max(vb_w, vb_h)
    X0 -= (side - vb_w) / 2
    Y0 -= (side - vb_h) / 2
    vb_w = vb_h = side
isc = 256 / max(vb_w, vb_h)  # sane intrinsic size so raster tools don't blow up on the big viewBox
vbw = f"{X0:.0f} {Y0:.0f} {vb_w:.0f} {vb_h:.0f}"
svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{vb_w * isc:.0f}" height="{vb_h * isc:.0f}" '
    f'viewBox="{vbw}" role="img" aria-label="R9{a.tail}">'
    f"<title>R9{a.tail}</title>{''.join(layers)}</svg>"
)
Path(a.out).write_text(svg, encoding="utf-8")
sys.stdout.write(f"{a.out}  flask={a.flask}  overlap={a.overlap}  R={a.rcol} 9={a.ncol}\n")
