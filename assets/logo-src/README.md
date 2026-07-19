# r9lab logo — source & generators

The mark is a **font-derived 9, vertically squished** so it reads as a loop (a
mirrored "e" — the wordmark quietly says "Relab"). The R/l/a/b letters come
from IBM Plex. Output SVGs are self-contained — glyphs are outlined, so no
font is needed to render them. Colours are the Cyanotype palette from
[../DESIGN.md](../DESIGN.md): `#1f4c96` light / `#8fb8ff` dark for the 9 and
ring, ink `#16202e` / `#e9eff8` for the letters.

## Generate

Needs [`uv`](https://docs.astral.sh/uv/). Run from this directory:

```sh
# regenerate every candidate set into candidates/<name>/
uv run --with fonttools --with brotli python3 make_r9lab.py

# additionally copy one candidate onto the canonical ../r9lab-*.svg + ../logo.svg
uv run --with fonttools --with brotli python3 make_r9lab.py --promote titillium
```

After promoting, run `just assets-sync` from the repo root to regenerate the
PNG/ico derivatives and consumer copies.

## Candidates

Three candidate fonts for the 9; **titillium** is the promoted canonical mark,
with petrona and varela kept as alternates. Tuned values live in `CANDIDATES`
in `make_r9lab.py`:

| Candidate   | 9 from            | Letters            | Notes                             |
| ----------- | ----------------- | ------------------ | --------------------------------- |
| `varela`    | Varela 400        | IBM Plex Sans 500  | outline-stroked to fake a 500 cut |
| `petrona`   | Petrona 600       | IBM Plex Serif 600 | serif-blend variant               |
| `titillium` | Titillium Web 600 | IBM Plex Sans 600  |                                   |

Each `candidates/<name>/` holds light + `-dark` SVGs for five variants:

| File            | What                                                |
| --------------- | --------------------------------------------------- |
| `mark.svg`      | the squished 9 alone — favicons, app icons          |
| `mark-ring.svg` | the 9 in a plain ring (loop emblem)                 |
| `wordmark.svg`  | pure-text `R9lab` lockup                            |
| `logo.svg`      | ringed wordmark — `(R9) lab`, the primary wide logo |
| `og.svg`        | 1200×630 social card (wordmark + tagline)           |

Promoting only copies SVGs; every PNG/ico derivative (consumer copies, the
canonical `../r9lab-*.png` companions the root README embeds, and the og
cards) is rendered by `scripts/sync_brand_assets.py` — hence the
`just assets-sync` step.

Font subsets (latin) are checked in under `fonts/candidates/` with their OFL
licence texts (`OFL-*.txt`).
