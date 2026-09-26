# Relab Design System

Source of truth for brand typography and colour across the monorepo.
Web/email primitives live in [brand.css](brand.css); the app maps the same
palette through its MD3 theme in `app/src/theme/`. Edit here, then run
`just assets-sync`.

Direction: **Cyanotype & Manila** — the colour of engineering documentation.
Before a product can re-enter the loop, someone has to document how it was
made; cyanotype blue is the colour of that record, manila the tag tied to the
part.

## Typography — IBM Plex superfamily

Three voices, one family:

| Role            | Face                  | Usage                                         |
| --------------- | --------------------- | --------------------------------------------- |
| Display / brand | IBM Plex Serif 600    | Headings on www/docs, logo letters, og-images |
| UI / body       | IBM Plex Sans 400–600 | Everything else on web and email              |
| Data / labels   | IBM Plex Mono 400     | Measurements, IDs, small data labels, code    |

Type scale (web): display 38/44, title 24/30, heading 19/24, body 16/26, label 13 caps
(+0.1em tracking, weight 400), caption 13/18, micro 12/16, data 14 mono with `tabular-nums`. Docs maps
this scale onto Starlight's `--sl-text-h1/h2/h3` tokens; www sets it directly. The app
adds an `eyebrow` variant (label metrics, rendered uppercase, muted or accent ink for
compact tags) and caps Dynamic Type scaling app-wide at 2x so fixed layouts survive
large accessibility text sizes. That variant is app-only: the web surfaces carry no
eyebrows (see [accent rules](#colour--type-roles-within-the-form)).

The **Expo app intentionally stays on platform system fonts** (native feel,
Dynamic Type, zero load cost). The app adopts the *scale and palette*, not the
typeface. WOFF2 files in [fonts/](fonts/) are latin subsets for docs/www
delivery; italic is browser-synthesized.

## Colour — Cyanotype & Manila

All pairings below meet WCAG 4.5:1 against their background in both schemes.

| Token           | Light     | Dark      | Role                                                                                    |
| --------------- | --------- | --------- | --------------------------------------------------------------------------------------- |
| primary         | `#1F4C96` | `#8FB8FF` | Brand anchor, actions, links on web                                                     |
| primary-strong  | `#143567` | `#BAD3FF` | Hover/pressed, emphasis                                                                 |
| accent          | `#8F6212` | `#E3B95C` | Manila — highlights, live indicators, strategy tags                                     |
| text            | `#16202E` | `#E2E6EE` | Body text (app; web uses `#E9EFF8` via --relab-brand-text)                              |
| mutedForeground | `#44474F` | `#C4C6D0` | Secondary text (www's `--color-muted` in tokens.css is a distinct page-chrome override) |
| muted           | `#E0E2EC` | `#44474F` | Muted surface tone behind secondary content                                             |
| background      | `#FAFBFE` | `#11141D` | Page ground                                                                             |
| surface         | `#F0F3FA` | `#1A2030` | Cards, panels                                                                           |
| border          | `#C4C6D0` | `#44474F` | Hairlines, dividers (web uses `#D9DFE8`/`#24314A` via --relab-brand-divider)            |

The machine sources are `brand.css` (web), `palette.json` (app), and `tokens.json` (the radius,
shadow, type and chart tables below); this table documents them and is checked by
`app/src/theme/__tests__/palette-sync.test.ts`.

The prose names above and the JSON keys are two vocabularies — `primary-strong`/`primaryStrong`,
`text`/`foreground`, `surface`/`card` — reconciled by the `BRAND_PARITY` table in
`scripts/sync_brand_assets.py`. `palette.json` also carries `secondary`, `state`, `destructive`
(`#BA1A1A`), `input` and `ring`, which this table does not restate.

Web consumes these as `--relab-brand-*` custom properties (see brand.css).
The app derives its MD3 colour roles from the same anchors: `primary` maps to
the MD3 primary pair, `accent` to tertiary, neutrals to the blue-biased
surface/outline ramp in `app/src/theme/themes.ts`.

Status colours (success/warning/danger/info/live) are app-semantic, not brand,
and stay as defined in `app/src/theme/tokens.ts` as scheme-aware light/dark
pairs, contrast-tested at 4.5:1 against the page background and (for solid
fills) against their own `onStatus` text — see `semantic-contrast.test.ts`.
`live` wears the manila accent rather than a semantic hue: the small
live/status pill is the one sanctioned manila fill. `info` and `link` blues
sit near the primary; blue-primary apps read links as primary actions.

### Diagram & chart palette

Categorical ramp for mermaid diagrams (`docs/src/content/docs/architecture/`),
the www stats chart, and future app charts. Blue and manila come straight from
the brand; violet, rose, slate, verdigris, and copper round out the seven
roles the diagrams need. The same category always wears the same hue across
diagrams.

| Hue             | Fill      | Stroke    | Text      |
| --------------- | --------- | --------- | --------- |
| Blue (primary)  | `#E3ECFA` | `#1F4C96` | `#143567` |
| Manila          | `#F7ECD4` | `#8F6212` | `#5C3F0A` |
| Verdigris       | `#E0F2ED` | `#0E6B5E` | `#0A4F45` |
| Copper          | `#F9E7DE` | `#A8542F` | `#6E371F` |
| Violet          | `#EDE6F7` | `#6D4FA3` | `#44337A` |
| Rose            | `#FAE4EC` | `#B0316E` | `#6E2048` |
| Slate (neutral) | `#F1F4F8` | `#5A6675` | `#16202E` |

Solid single-hue marks (the www activity bars) use the primary brightened into
the data-viz band — `light-dark(#2f6bc7, #6fa8ff)` — because the brand blues
are tuned for text/links, not large fills. If the palette direction ever
changes, this table and `--color-chart-mark` in `www/src/styles/tokens.css`
are the only places to update.

## Form language — Flat & Sharp

The palette and type above set the brand; this sets the **shape**: flat & sharp,
the geometry of an engineering document. No pill buttons, ambient drop shadows,
or oversized radii. It reads crisp and technical on desktop and stays ergonomic
on mobile.

### Radius

| Token            | Value | Applies to                                 |
| ---------------- | ----- | ------------------------------------------ |
| `radius-control` | 6px   | buttons, inputs, chips, segmented controls |
| `radius-card`    | 8px   | cards, panels, list rows                   |
| `radius-overlay` | 12px  | dialogs, bottom sheets, menus, FAB         |
| `radius-full`    | 9999  | avatars, true pills only                   |

Large surfaces stay a step softer than small controls, so sharp corners never
read brittle on a phone. In the app these map through `app/src/constants.ts`.

### Elevation — flat base, one floating tier

Inline surfaces (cards, rows, inputs) are **flat**: a 1px hairline `border` +
`surface` fill, **no shadow**. Shadow is reserved for surfaces that actually
float, as a single tier:

| Token            | Light                           | Dark                         | Use                                    |
| ---------------- | ------------------------------- | ---------------------------- | -------------------------------------- |
| `shadow-overlay` | `0 8px 24px rgba(20,40,80,.16)` | `0 8px 24px rgba(0,0,0,.55)` | menus, dialogs, sheets, FAB, snackbars |
| `scrim`          | `rgba(12,18,32,.50)` (45–55%)   | `rgba(0,0,0,.55)`            | behind modals / sheets                 |

Android takes a native elevation instead of the web shadow: `elevationAndroid` in `tokens.json`,
8 light / 12 dark.

### Density, touch, motion

- **Touch floor 44/48px**, 8px minimum gaps, 4/8px spacing rhythm. Sharpness
  comes from tighter section spacing and hairlines, never smaller tap targets.
- **Motion is functional**: 150–300ms, ease-out entering, exits as faster
  plain fades (shorter than their entrance); press feedback via
  opacity/state-layer with no layout shift; overlays animate from their
  trigger; `prefers-reduced-motion` respected.
- **Dark mode in parity**: desaturated tonal surfaces, borders visible in both
  schemes, scrim strong enough to isolate overlays.

### Icons — Lucide

One icon family: **`lucide-react-native`**, consistent 2px stroke, sharp
corners, outline style throughout. `@expo/vector-icons` was removed; do not
re-add it. Sizes are tokens (`icon-sm` 16, `icon-md` 20, `icon-lg` 24);
icon-only controls keep a ≥44px hit area.

Brand marks are the one exception: GitHub, Google, YouTube, and LinkedIn are
vendored monochrome SVGs in `assets/icons/brand/` (Simple Icons, CC0-1.0),
rendered filled with `currentColor` at the same size tokens as Lucide glyphs.
Lucide stays the only family for non-brand glyphs; never recolor a brand mark
into its own brand palette.

### Colour & type roles within the form

Primary blue carries **all interaction** — actions, links, and every
hover/pressed/selected state. Interaction states use a subtler shade of the
primary (`primary-strong` for filled controls; a primary tint / state-layer for
ghost/tonal/outline buttons) — **never the accent.** `tokens.surface.accent`
(primary at 12% opacity) is the canonical selected/tinted fill — chips, history
rows, toggles. MD3's `*Container` roles are retired from app call sites in
favour of it.

The **manila accent is a data-label colour** — R-numbers, record IDs, small data
highlights, live/status pills, and strategy tags. It marks a *datum*, never a
section. Decorative kickers above a heading are not a use for it, and on the web
they are not a use for anything: a mono uppercase label that only restates the
heading under it is chrome, so www and docs carry no eyebrows at all. The app's
`AppText variant="eyebrow"` stays, because there it labels a value inside a
compact tag rather than announcing a section.

The accent never fills a button or drives a hover/pressed state. Lean on the mono
voice (IBM Plex Mono on web, platform monospace in the app) for IDs, counts, and
measurements — the "lab instrument" register.

**Accent is for small text, never for mass.** Bars, big figures, and other
large elements stay ink — including single-series chart bars and the hero/tile
stat numbers. Manila reads as a highlight because it is scarce and small; at
size it competes instead of accenting. When in doubt on something large, use
ink. (In the categorical diagram ramp above, manila encodes a category rather
than emphasis, so these size rules do not apply there.)

Dialogs: destructive actions render filled-destructive; keyboard submit never
targets a destructive or cancel action.

## Logo

The mark is a **font-derived 9, vertically squished** so it reads as a loop
and as a mirrored "e" (the wordmark reads "Relab"). The 9 is Titillium Web
600; the letters are IBM Plex Sans 600; the ringed lockup uses a plain ring
(see [logo-src/](logo-src/README.md)). Regenerate via `make_r9lab.py` +
`just assets-sync`. Colours follow the palette above; og-images and all PNG
derivatives regenerate from the same pipeline.

## Voice

The brand is always read and pronounced **"Relab"**, and that is how it is
written in running copy, alt text, and aria-labels. The `R9lab` spelling is a
purely visual device (the squished 9 reads as a mirrored "e" while hinting at
the 9R framework of circular-economy strategies, R0–R9) and lives only in the
wordmark artwork. Never "R-nine-lab".

Circularity framing, lab vernacular (products, components, materials,
samples); never "reverse engineering" in new copy.
