# r9lab logo — source & generators

The logo is a lowercase **9 that reads as a mirrored e** (teardrop counter,
single sweeping foot), paired with letters set in **EB Garamond** (OFL). Output
SVGs are self-contained — glyphs are outlined, so no font is needed to render
them. Brand colour is teal `#006783`; the mark/wordmark note the `currentColor`
swap for theming.

## Assets (generated into `../`)

| File                   | What                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `r9lab-mark.svg`       | the 9 glyph alone, high-contrast                                     |
| `r9lab-logo.svg`       | **primary logo** — overlapping two-tone `R9` with a soft drop shadow |
| `r9lab-flask-logo.svg` | the `R9` logo on a simple Erlenmeyer flask outline                   |
| `r9lab-wordmark.svg`   | full `R9lab` wordmark — flask around the `R9`, `lab` outside it      |

## Sources (checked in here)

- `mark-solid.svg` — the canonical **solid** 9 (monolinear); the shape of record.
- `fonts/EBGaramond-var.ttf` (+ `OFL.txt`) — the wordmark/monogram font.

## Regenerate everything

Needs [`uv`](https://docs.astral.sh/uv/) (pulls Python deps on the fly). Run from
this directory:

```sh
# 1. high-contrast 9  (stretch the counter: taller = thin top/bottom, narrower = thick sides)
uv run --with fonttools python3 make_mark.py \
    --in mark-solid.svg --out ../r9lab-mark.svg --sy 1.30 --sx 0.82

# 2. logo, wordmark, flask variant   (cairosvg bakes the shadow — see below)
uv run --with fonttools --with cairosvg python3 make_logo.py --flask no            --out ../r9lab-logo.svg
uv run --with fonttools --with cairosvg python3 make_logo.py --flask yes --tail lab --gap 22 --square no --out ../r9lab-wordmark.svg
uv run --with fonttools --with cairosvg python3 make_logo.py --flask yes           --out ../r9lab-flask-logo.svg
```

`make_logo.py` draws the overlapping two-tone `R9`; `--tail lab` appends the rest
of the wordmark in the same style.

### Dark variants

Each mark has a `-dark` cyan version for dark backgrounds (nav bars, dark hero
sections), matching the dark value of `--relab-brand-primary` (`#63d3ff`). The
sync distributes light + dark side by side and the sites swap them by theme.

```sh
# mark: recolour the teal 9 to cyan
sed 's/#006783/#63d3ff/g' ../r9lab-mark.svg > ../r9lab-mark-dark.svg

# logo / flask logo / wordmark in the dark palette
uv run --with fonttools --with cairosvg python3 make_logo.py --flask no  --rcol '#63d3ff' --ncol '#a7e9ff' --shadowcol '#02243a' --shadowop 0.45                    --out ../r9lab-logo-dark.svg
uv run --with fonttools --with cairosvg python3 make_logo.py --flask yes --rcol '#63d3ff' --ncol '#a7e9ff' --shadowcol '#02243a' --shadowop 0.45 --flaskcol '#63d3ff' --out ../r9lab-flask-logo-dark.svg
uv run --with fonttools --with cairosvg python3 make_logo.py --flask yes --tail lab --gap 22 --square no --rcol '#63d3ff' --ncol '#a7e9ff' --shadowcol '#02243a' --shadowop 0.45 --flaskcol '#63d3ff' --out ../r9lab-wordmark-dark.svg
```

### About the shadow

`make_logo.py` **bakes** the soft shadow as an embedded (blurred) PNG rather than
using an SVG `<feDropShadow>` filter — so it renders in every viewer (IDE previews,
old renderers), not just browsers. The letters stay crisp vector; only the blurry
shadow is raster. Shadow constants live at the top of the script
(`SDX, SDY, SSTD, SCOL, SOP`).

## Tuning knobs

- **9 contrast** — `make_mark.py --sy/--sx`. `1.0/1.0` = the solid mark.
- **Logo overlap** — `make_logo.py --overlap` (how far the 9 slides into the R).
- **Two-tone** — `make_logo.py --rcol --ncol` (defaults `#0a6e88` / `#004f65`).
- **Flask on/off / colour / height / neck** — `--flask yes|no`, `--flaskcol`,
  `--flaskvscale` (total height, \<1 = shorter), `--necklen` (longer neck = shorter body).
- **Wordmark tail** — `--tail lab --gap 50` (letters after the 9; `--gap` = space before them).
- **9 size** — `--ninescale` (e.g. `0.9` = 10% smaller; its foot stays on the baseline).
- **Shadow colour / strength** — `--shadowcol --shadowop` (baked, not a live filter).
  Offset & blur (= softness/fade) are the `SDX, SDY, SSTD` constants near the top of the script.
- **Serif / weight** — set in `make_logo.py` (hardcoded EB Garamond at `wght 600`;
  swap the `TTFont(...)` / axis to try another OFL face — Cormorant, Fraunces, and
  Playfair were trialled).

Preview an SVG to PNG: `uv run --with cairosvg python3 -c "import cairosvg; cairosvg.svg2png(url='f.svg', write_to='f.png', output_width=800, background_color='white')"`.
