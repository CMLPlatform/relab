"""Add stroke contrast to the solid 9 mark by stretching its counter (the inner
hole): taller + narrower thins the bowl's top/bottom and thickens the sides,
echoing a high-contrast serif. Pure affine scale of the counter sub-path, so the
curves stay exact. Input/output are the self-contained mark SVGs.

  make_mark.py --in mark-solid.svg --out r9lab-mark.svg --sy 1.30 --sx 0.82
"""

import argparse, re

p = argparse.ArgumentParser()
p.add_argument("--in", dest="inp", required=True)
p.add_argument("--out", required=True)
p.add_argument("--sy", type=float, default=1.30, help="counter vertical stretch (thins bowl top/bottom)")
p.add_argument("--sx", type=float, default=0.82, help="counter horizontal shrink (thickens sides)")
a = p.parse_args()

svg = open(a.inp).read()
d = re.search(r'<path[^>]*\bd="([^"]+)"', svg).group(1)

# split into sub-paths (each "M ... Z"); coords are all x,y pairs (M=1 pair, C=3)
subs = ["M" + s for s in d.split("M") if s.strip()]


def coords(sub):
    return [float(n) for n in re.findall(r"-?\d+\.?\d*", sub)]


def bbox(sub):
    c = coords(sub)
    xs, ys = c[0::2], c[1::2]
    return min(xs), min(ys), max(xs), max(ys)


# larger-area sub-path is the outer contour; the other is the counter
subs.sort(key=lambda s: (bbox(s)[2] - bbox(s)[0]) * (bbox(s)[3] - bbox(s)[1]), reverse=True)
outer, counter = subs[0], subs[1]

xmn, ymn, xmx, ymx = bbox(counter)
cx, cy = (xmn + xmx) / 2, (ymn + ymx) / 2


def scale_pairs(sub):
    nums = re.split(r"(-?\d+\.?\d*)", sub)  # keep separators (letters/space)
    out, flip = [], 0  # flip toggles x/y within a pair
    for tok in nums:
        if re.fullmatch(r"-?\d+\.?\d*", tok or ""):
            v = float(tok)
            v = cx + (v - cx) * a.sx if flip == 0 else cy + (v - cy) * a.sy
            out.append(f"{v:.1f}")
            flip ^= 1
        else:
            out.append(tok)
    return "".join(out)


d2 = outer + " " + scale_pairs(counter)
svg2 = re.sub(r'(<path[^>]*\bd=")[^"]+(")', lambda m: m.group(1) + d2 + m.group(2), svg)

# pad the viewBox to a square (for icon use) and give a sane intrinsic size
vx, vy, vw, vh = (float(n) for n in re.search(r'viewBox="([^"]+)"', svg2).group(1).split())
side = max(vw, vh)
sx, sy = vx - (side - vw) / 2, vy - (side - vh) / 2
svg2 = re.sub(r'viewBox="[^"]+"', f'viewBox="{sx:.0f} {sy:.0f} {side:.0f} {side:.0f}"', svg2, count=1)
svg2 = svg2.replace("<svg ", '<svg width="256" height="256" ', 1)
open(a.out, "w").write(svg2)
print(f"contrast sy={a.sy} sx={a.sx}  counter center=({cx:.0f},{cy:.0f})")
