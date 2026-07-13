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

## Logo

The mark is a **font-derived 9, vertically squished** so it reads as a loop
(and as a mirrored "e" — the wordmark whispers "Relab"). Letters are IBM Plex;
the flask emblem is retired, replaced by a plain ring in the ringed lockup.
Three candidate fonts for the 9 are generated side by side (winner pending;
Varela is the current default) — see [logo-src/](logo-src/README.md). Colours
follow the palette above; og-images and all PNG derivatives regenerate from
the same pipeline.

## Voice

The brand is always read and pronounced **"Relab"**, and that is how it is
written in running copy, alt text, and aria-labels. The `R9lab` spelling is a
purely visual device — the squished 9 reads as a mirrored "e" while hinting at
the nine circular-economy (9R) strategies — and lives only in the wordmark
artwork itself. Never "R-nine-lab".

Circularity framing, lab vernacular (products, components, materials,
samples); never "reverse engineering" in new copy.

## Roadmap — aligning the rest of the repo

Ordered by impact; each is an independent piece of work.

1. **Use the display and mono faces.** Plex Serif/Mono ship to docs/www but no
   stylesheet sets `--relab-brand-font-display` (headings) or
   `--relab-brand-font-mono` (IDs, measurements, code chips) yet. This is the
   visible half of the type system.
1. **Diagram & chart palette.** Derive a categorical ramp from the palette
   (blue, manila, plus 2–3 companions) for mermaid diagrams
   (`docs/.../datamodel.mdx` still uses teal `classDef`s), the www stats panel,
   and future app charts; keep ≥3:1 contrast on data marks.
1. **App type scale.** The app keeps system fonts, but the react-native-paper
   `fonts` config still uses Paper defaults — adopt the weight/size scale
   above, with `tabular-nums` where digits align.
1. **Theme-adaptive favicon.** `favicon.svg` can carry an internal
   `prefers-color-scheme` style so the tab mark swaps light/dark; the
   generator can emit this variant.
1. **Email dark mode.** Templates are light-only; add the dark-mode meta tags
   and a `prefers-color-scheme` block in MJML.
1. **Semantic blues in the app.** `SEMANTIC_COLORS.info`/`link` now sit near
   primary; either accept (blue-primary apps read links as primary actions —
   current stance) or shift info to a distinct hue.
1. **Candidate decision.** Pick the final 9 font (Varela/Petrona/Titillium),
   promote it, and delete the losing candidate sets.
1. **Name migration.** The later "Relab" copy rename (`siteMeta`, README
   title, app `name`) — out of scope until the rebrand lands publicly.

The standalone docs API-reference page and the www theme-color script both
derive their brand values from the synced brand.css (build-time inline and a
unit-test pin respectively) — no hand-kept copies remain.

## Alternative direction — Verdigris & Copper

Runner-up palette, kept for review with supervision; typography is identical.
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
