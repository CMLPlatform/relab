# R9lab Design System

Source of truth for brand typography and colour across the monorepo.
Web/email primitives live in [brand.css](brand.css); the app maps the same
palette through its MD3 theme in `app/src/theme/`. Edit here, then run
`just assets-sync`.

Direction: **Cyanotype & Manila** — the colour of engineering documentation.
Before a product can re-enter the loop, someone has to document how it was
made; cyanotype blue is the colour of that record, manila the tag tied to the
part. An alternative direction (Verdigris & Copper) is preserved
[below](#alternative-direction--verdigris--copper); open
[design-compare.html](design-compare.html) for a side-by-side view of both.

## Typography — IBM Plex superfamily

Three voices, one family:

| Role            | Face                  | Usage                                         |
| --------------- | --------------------- | --------------------------------------------- |
| Display / brand | IBM Plex Serif 600    | Headings on www/docs, logo letters, og-images |
| UI / body       | IBM Plex Sans 400–600 | Everything else on web and email              |
| Data / labels   | IBM Plex Mono 400     | Measurements, IDs, eyebrow labels, code       |

Type scale (web): display 38/44, h2 24/30, body 16/26, label 13 caps
(+0.1em tracking, weight 500), data 14 mono with `tabular-nums`.

The **Expo app intentionally stays on platform system fonts** (native feel,
Dynamic Type, zero load cost). The app adopts the *scale and palette*, not the
typeface. WOFF2 files in [fonts/](fonts/) are latin subsets for docs/www
delivery; italic is browser-synthesized.

## Colour — Cyanotype & Manila

All pairings below meet WCAG 4.5:1 against their background in both schemes.

| Token          | Light     | Dark      | Role                                                |
| -------------- | --------- | --------- | --------------------------------------------------- |
| primary        | `#1F4C96` | `#8FB8FF` | Brand anchor, actions, links on web                 |
| primary-strong | `#143567` | `#BAD3FF` | Hover/pressed, emphasis                             |
| accent         | `#8F6212` | `#E3B95C` | Manila — highlights, live indicators, strategy tags |
| text           | `#16202E` | `#E9EFF8` | Body text                                           |
| muted          | `#5A6675` | `#8C99AD` | Secondary text                                      |
| background     | `#F5F7FA` | `#0C1220` | Page ground                                         |
| surface        | `#FFFFFF` | `#141D30` | Cards, panels                                       |
| border         | `#D9DFE8` | `#24314A` | Hairlines, dividers                                 |

Web consumes these as `--relab-brand-*` custom properties (see brand.css).
The app derives its MD3 colour roles from the same anchors: `primary` maps to
the MD3 primary pair, `accent` to tertiary, neutrals to the blue-biased
surface/outline ramp in `app/src/theme/themes.ts`.

Status colours (success/warning/danger/info/live) are app-semantic, not brand,
and stay as defined in `app/src/theme/tokens.ts`. `info` and `link` blues sit
near the new primary by design — blue-primary apps read links as primary
actions.

### Diagram & chart palette

Categorical ramp for mermaid diagrams (`docs/src/content/docs/architecture/`),
the www stats chart, and future app charts. Blue and manila come straight from
the brand; verdigris and copper are borrowed from the alternative direction
below; violet, rose, and slate round out the seven roles the diagrams need.
The same category always wears the same hue across diagrams.

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

The palette and type above set the brand; this sets the **shape**. Direction:
**flat & sharp** — the geometry of an engineering document. It replaces the
MD3/Paper-era look (pill buttons, ambient drop shadows, oversized radii) the
app carried over from its react-native-paper origins. It reads crisp/technical
on desktop and stays ergonomic on mobile.

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

This single tier removes the "everything floats" MD3 tell while keeping
overlays legible on mobile.

### Density, touch, motion

- **Touch floor 44/48px**, 8px minimum gaps, 4/8px spacing rhythm. Sharpness
  comes from tighter section spacing and hairlines, never smaller tap targets.
- **Motion is functional**: 150–300ms, ease-out entering / ease-in exiting;
  press feedback via opacity/state-layer with no layout shift; overlays animate
  from their trigger; `prefers-reduced-motion` respected.
- **Dark mode in parity**: desaturated tonal surfaces, borders visible in both
  schemes, scrim strong enough to isolate overlays.

### Icons — Lucide

One icon family: **`lucide-react-native`** — consistent 2px stroke, sharp
corners, outline style throughout. It is the technical/blueprint counterpart to
the flat-&-sharp geometry, replacing the mixed-weight `@expo/vector-icons`
(MaterialCommunityIcons) set. Sizes are tokens (`icon-sm` 16, `icon-md` 20,
`icon-lg` 24); icon-only controls keep a ≥44px hit area.

Brand marks are the one exception: GitHub, Google, YouTube, and LinkedIn are
vendored monochrome SVGs in `assets/icons/brand/` (Simple Icons, CC0-1.0),
rendered filled with `currentColor` at the same size tokens as Lucide glyphs.
Lucide stays the only family for non-brand glyphs; never recolor a brand mark
into its own brand palette.

### Colour & type roles within the form

Primary blue carries **all interaction** — actions, links, and every
hover/pressed/selected state. Interaction states use a subtler shade of the
primary (`primary-strong` for filled controls; a primary tint / state-layer for
ghost/tonal/outline buttons) — **never the accent.**

The **manila accent is a text colour** — mono eyebrow labels, small data
highlights, live/status pills, and strategy tags. It never fills a button or
drives a hover/pressed state. Lean on the mono voice (IBM Plex Mono on web,
platform monospace in the app) for IDs, counts, and measurements — the
"lab instrument" register.

**Accent is for small text, never for mass.** Bars, big figures, and other
large elements stay ink — including single-series chart bars and the hero/tile
stat numbers. Manila reads as a highlight because it is scarce and small; at
size it competes instead of accenting. When in doubt on something large, use
ink. (In the categorical diagram ramp above, manila encodes a category rather
than emphasis, so these size rules do not apply there.)

## Logo

The mark is a **font-derived 9, vertically squished** so it reads as a loop
(and as a mirrored "e" — the wordmark whispers "Relab"). Letters are IBM Plex;
the flask emblem is retired, replaced by a plain ring in the ringed lockup.
Three candidate fonts for the 9 are generated side by side; **Titillium** is
the promoted canonical mark (was Varela), with Petrona and Varela kept as
alternates in `logo-src/candidates/` — see [logo-src/](logo-src/README.md).
Promote another via `make_r9lab.py --promote <name>` + `just assets-sync`.
Colours
follow the palette above; og-images and all PNG derivatives regenerate from
the same pipeline.

## Voice

The brand is always read and pronounced **"Relab"**, and that is how it is
written in running copy, alt text, and aria-labels. The `R9lab` spelling is a
purely visual device — the squished 9 reads as a mirrored "e" while hinting at
the 9R framework of circular-economy strategies (the framework itself spans
R0–R9) — and lives only in the wordmark artwork itself. Never "R-nine-lab".

Circularity framing, lab vernacular (products, components, materials,
samples); never "reverse engineering" in new copy.

## Alternative direction — Verdigris & Copper

Runner-up palette, kept as a fallback pending supervisor review; typography is identical.
Story: copper is the most recovered material in the industrial stream, and
verdigris is what it wears when it comes back. The green-teal primary is a
half-step from the original teal (`#006783`) — lowest migration cost of the
directions considered. All pairings meet WCAG 4.5:1 in both schemes.

| Token          | Light     | Dark      | Role                                 |
| -------------- | --------- | --------- | ------------------------------------ |
| primary        | `#0E6B5E` | `#5FD4BE` | Brand anchor, actions                |
| primary-strong | `#0A4F45` | `#9CE8D8` | Hover/pressed, emphasis              |
| accent         | `#A8542F` | `#E89C77` | Copper — highlights, live indicators |
| text           | `#14231E` | `#E8F2EC` | Body text                            |
| muted          | `#5C6B65` | `#8FA39A` | Secondary text                       |
| background     | `#F6F9F7` | `#0D1613` | Page ground                          |
| surface        | `#FFFFFF` | `#15211C` | Cards, panels                        |
| border         | `#D8E2DC` | `#263831` | Hairlines, dividers                  |

Drop-in `brand.css` block if this direction is adopted:

```css
:root {
  --relab-brand-primary: light-dark(#0e6b5e, #5fd4be);
  --relab-brand-primary-strong: light-dark(#0a4f45, #9ce8d8);
  --relab-brand-primary-soft: light-dark(rgba(14, 107, 94, 0.08), rgba(95, 212, 190, 0.14));
  --relab-brand-accent: light-dark(#a8542f, #e89c77);
  --relab-brand-text: light-dark(#14231e, #e8f2ec);
  --relab-brand-surface-wash: light-dark(rgba(246, 249, 247, 0.8), rgba(13, 22, 19, 0.74));
  --relab-brand-theme-color: light-dark(#eef4f1, #0a110e);
}
```
