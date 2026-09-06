---
name: Relab Docs
description: The Relab research platform's Starlight documentation site — cyanotype blue and manila re-skinned onto Starlight's own token layer.
colors:
  primary: 'light-dark(#1f4c96, #8fb8ff)'
  primary-strong: 'light-dark(#143567, #bad3ff)'
  primary-soft: light-dark(rgba(31, 76, 150, 0.08), rgba(143, 184, 255, 0.14))
  accent: 'light-dark(#8f6212, #e3b95c)'
  text: 'light-dark(#16202e, #e9eff8)'
  surface: 'light-dark(#fafbfe, #11141d)'
  divider: 'light-dark(#d9dfe8, #24314a)'
  surface-wash: light-dark(rgba(245, 247, 250, 0.8), rgba(12, 18, 32, 0.74))
  theme-color: 'light-dark(#edf1f7, #0a0f1a)'
  chart-blue-fill: '#e3ecfa'
  chart-blue-stroke: '#1f4c96'
  chart-blue-text: '#143567'
  chart-manila-fill: '#f7ecd4'
  chart-manila-stroke: '#8f6212'
  chart-manila-text: '#5c3f0a'
  chart-verdigris-fill: '#e0f2ed'
  chart-verdigris-stroke: '#0e6b5e'
  chart-verdigris-text: '#0a4f45'
  chart-copper-fill: '#f9e7de'
  chart-copper-stroke: '#a8542f'
  chart-copper-text: '#6e371f'
  chart-violet-fill: '#ede6f7'
  chart-violet-stroke: '#6d4fa3'
  chart-violet-text: '#44337a'
  chart-rose-fill: '#fae4ec'
  chart-rose-stroke: '#b0316e'
  chart-rose-text: '#6e2048'
  chart-slate-fill: '#f1f4f8'
  chart-slate-stroke: '#5a6675'
  chart-slate-text: '#16202e'
typography:
  display:
    fontFamily: IBM Plex Serif, Georgia, serif
    fontWeight: 600
    letterSpacing: -0.01em
  h1:
    fontFamily: IBM Plex Serif, Georgia, serif
    fontSize: 2.375rem
    fontWeight: 600
    letterSpacing: -0.01em
  h2:
    fontFamily: IBM Plex Serif, Georgia, serif
    fontSize: 1.5rem
    fontWeight: 600
    letterSpacing: -0.01em
  h3:
    fontFamily: IBM Plex Serif, Georgia, serif
    fontSize: 1.1875rem
    fontWeight: 600
    letterSpacing: -0.01em
  h4:
    fontFamily: IBM Plex Serif, Georgia, serif
    fontSize: 1.0625rem
    fontWeight: 600
    letterSpacing: -0.01em
  body:
    fontFamily: IBM Plex Sans, sans-serif
    fontWeight: 400
  mono:
    fontFamily: IBM Plex Mono, monospace
    fontWeight: 400
rounded:
  control: 6px
  card: 8px
spacing:
  mermaid-inset: 1rem
  colophon-gap: 1.2rem
components:
  app-cta:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.theme-color}'
    rounded: '{rounded.control}'
    padding: 0.34rem 0.72rem
  app-cta-hover:
    backgroundColor: '{colors.primary-strong}'
  sidebar-link-active:
    backgroundColor: '{colors.primary-soft}'
  card-grid-item:
    backgroundColor: '{colors.primary-soft}'
    rounded: '{rounded.card}'
  mermaid-frame:
    rounded: '{rounded.card}'
---

# Design System: Relab Docs

## Overview

**Creative North Star: "Cyanotype & Manila, the colour of engineering documentation."** The same
north star as `www/`, inherited. See the [Named Rules](#named-rules) for how the inheritance works.

This is a **Starlight** site. Starlight ships its own design system (typography scale, color roles,
sidebar chrome, code blocks, search UI) as CSS custom properties (`--sl-color-*`,
`--sl-text-h1/h2/h3`, `--sl-font-mono`, `--sl-content-width`, and more).

Docs does not re-author that system. A **thin brand layer** (`brand.css` and
`tokens.generated.css`, ~123 lines combined) loads before Starlight's styles in `customCss` and
overrides a short list of Starlight tokens. Everything else is unmodified Starlight default:
spacing rhythm, sidebar layout, search modal, table styling, code block chrome (Expressive Code),
badge and aside components, table-of-contents behavior. The `Relab-authored vs. Starlight-default`
note under each section marks the boundary.

**The duplicated brand rules below are duplicated on purpose. Do not deduplicate them into a
citation.** Whoever edits a component reads the design file next to it and does not open a second
one, and `assets/DESIGN.md` sits at a path no design tooling looks in. Each restatement carries a
`Mirrors assets/DESIGN.md:NN` marker. Run `rg "Mirrors assets/DESIGN.md"` to list every copy and
check it against source. Change a rule in `assets/DESIGN.md` first.

Four re-skin points do the job: page background (`--sl-color-bg`, `--sl-color-bg-sidebar`,
`--sl-color-bg-nav`), the accent triad (`--sl-color-accent-low/DEFAULT/-high`, mapped to primary
blue, **not** manila), the heading size ramp (`--sl-text-h1/h2/h3/h4`, pulled down from Starlight's
landing-page-sized defaults to the brand's reference-document scale), and the mono font family
(`--sl-font-mono`).

**Three** Starlight component slots are swapped for custom `.astro` files in `astro.config.mjs`:
`SiteTitle` and `SocialIcons` (their content, the wordmark and the "Open app" CTA, has no Starlight
token to hook into) and `Head` (font preload and favicon links).

Two third-party renderers, mermaid and Scalar's API reference, are embedded apps with their own
theming surface. See [Elevation & Depth](#elevation--depth) and [Components](#components).

**Key Characteristics:**

- A brand layer of custom properties sits *underneath* Starlight's token layer; only a short, named
  list of `--sl-*` tokens is overridden.
- No Tailwind. Tailwind's preflight reset stripped list bullets and indent from every markdown
  list, so docs uses plain CSS and Starlight's `sl-*` utility classes only (stated in `base.css`).
- `--sl-content-width` is narrowed from Starlight's 54rem to 45rem, a measured 72 characters per
  line. Only wide mermaid diagrams break out of that column.
- The categorical 7-hue diagram palette from `assets/DESIGN.md` reaches mermaid as **literal hex
  per diagram**, not a token reference: mermaid's diagram source cannot consume
  `var(--relab-chart-*)`. The generated tokens document the values hand-copied into each `.mdx`
  file's `classDef` lines.

## Colors

The palette is identical to `www/`'s: cyanotype blue for structure and interaction, manila for
data labels. Docs consumes it as `--relab-brand-*` custom properties, generated by
`scripts/sync_brand_assets.py` from `assets/tokens.json` / `assets/palette.json`, byte-identical
to `www/src/styles/tokens.css`. **Do not hand-edit these values here**; change
`assets/palette.json` (or `tokens.json` for radius, shadow, and chart values) and run
`just assets-sync`.

### Primary

- **Cyanotype Blue** (`light-dark(#1f4c96, #8fb8ff)`, `--relab-brand-primary`): brand anchor.
  Mapped onto `--sl-color-accent`, so it carries every link, active nav item, and focus ring
  Starlight renders.
- **Cyanotype Blue, Strong** (`light-dark(#143567, #bad3ff)`, `--relab-brand-primary-strong`):
  hover and pressed states; mapped to `--sl-color-accent-high`.
- **Cyanotype Blue, Soft** (`light-dark(rgba(31,76,150,.08), rgba(143,184,255,.14))`,
  `--relab-brand-primary-soft`): tinted fills, the active sidebar-link background and the
  `.relab-card-grid` item background; mapped to `--sl-color-accent-low`.
- **Active sidebar-link ink** (`rgb(18,49,75)` light / `rgb(234,247,255)` dark,
  `components.css:60,71`): the one hand-authored colour in docs. The nearest token,
  `--relab-brand-primary-strong`, does not match. The pair was picked for contrast against the
  tinted active-row background (4.49:1 → 10.92:1 light, 8.57:1 dark). The detector flags both;
  the findings are expected.

### Secondary

- **Manila** (`light-dark(#8f6212, #e3b95c)`, `--relab-brand-accent`): the data-label colour. In
  docs' custom CSS it appears in exactly one place, `.rung-num` in `NineRLadder.astro`. It is
  **not** mapped to any Starlight interaction token (see the Named Rules).

### Neutral

- **Ink** (`light-dark(#16202e, #e9eff8)`, `--relab-brand-text`): body text, set on `body` in
  `base.css`.
- **Page Ground** (`light-dark(#fafbfe, #11141d)`, `--relab-brand-background`): mapped to
  `--sl-color-bg`.
- **Surface** (`light-dark(#f0f3fa, #1a2030)`, `--relab-brand-surface`): card and panel tone,
  matching the app's card and popover keys. Not yet mapped to any Starlight token. It used to be
  the (misnamed) page-ground value, so pair text contrast against Page Ground for body copy and
  against Surface only inside cards.
- **Divider** (`light-dark(#d9dfe8, #24314a)`, `--relab-brand-divider`): hairlines: the colophon's
  top rule and `NineRLadder`'s tier and rung borders (via `--sl-color-hairline` with this as
  fallback).
- **Chrome Wash**: `--sl-color-bg-sidebar` / `--sl-color-bg-nav` are
  `color-mix(in srgb, var(--relab-brand-primary) 5%, var(--relab-brand-background))`, replacing
  Starlight's stock neutral grey (`#f6f7f9`/`#23262f`), which read as a mismatched band against the
  flat page ground.

### Diagram & chart palette

A 7-hue categorical ramp, each hue a fill/stroke/text triplet, generated into
`tokens.generated.css` (`--relab-chart-<hue>-fill/-stroke/-text`) and used in every mermaid diagram
under `src/content/docs/architecture/*.mdx`. Same ramp as `assets/DESIGN.md`: blue and manila are
the brand primaries, verdigris and copper come from the alternative brand direction, and violet,
rose, and slate fill out the seven roles.

| Hue             | Fill      | Stroke    | Text      |
| --------------- | --------- | --------- | --------- |
| Blue (primary)  | `#e3ecfa` | `#1f4c96` | `#143567` |
| Manila          | `#f7ecd4` | `#8f6212` | `#5c3f0a` |
| Verdigris       | `#e0f2ed` | `#0e6b5e` | `#0a4f45` |
| Copper          | `#f9e7de` | `#a8542f` | `#6e371f` |
| Violet          | `#ede6f7` | `#6d4fa3` | `#44337a` |
| Rose            | `#fae4ec` | `#b0316e` | `#6e2048` |
| Slate (neutral) | `#f1f4f8` | `#5a6675` | `#16202e` |

`system-design.mdx`, `rpi-cam.mdx`, and `datamodel.mdx` assign hues by semantic category
(`actor`=blue, `backend`=manila, `frontend`=verdigris, `external`=copper, `datastore`=violet,
`hardware`=rose, `auth`/neutral=slate) through `classDef ... fill:#…,stroke:#…,color:#…` lines
copied verbatim from this table. The tokens in `tokens.generated.css` and the literals in each
`.mdx` are two copies kept in sync by hand.

Mermaid's own **chrome** (diagram background, un-classed node fill, line color) is themed by
`src/scripts/mermaid.ts` through `themeVariables`. `primaryBorderColor`/`primaryTextColor` read
live from `--relab-brand-primary`/`-text` via `resolveLightDark` (mermaid's `khroma` parser cannot
parse `light-dark()`). `background`/`primaryColor`/`lineColor`/`tertiaryColor` are hand-tuned hex
with no update path if the brand primary moves; the file's own comment says so. This is a named
drift risk.

### Named Rules

**The Accent-Is-Data Rule.** Manila (`--relab-brand-accent`) marks a *datum*, never a section or
an interactive affordance. In docs it appears in one custom-CSS location, the R-number in
`NineRLadder.astro`, and nowhere else in `brand.css`/`base.css`/`components.css`. It is never
mapped to `--sl-color-accent`; that would turn every Starlight link and active nav item manila,
which `assets/DESIGN.md` forbids. The accent never fills a button and never drives a hover or
pressed state; primary blue carries all interaction. Accent is for small text, never for mass;
bars and big figures stay ink.
*Mirrors assets/DESIGN.md:167 — change it there first.*

**The No-Eyebrow Rule.** Docs carries no eyebrows or kickers, same as `www/`. A mono uppercase
label that only restates the heading beneath it is chrome, not data. The app's `eyebrow` text
variant is the one sanctioned exception, and it is app-only: there an eyebrow labels a *value*
inside a compact tag, the Accent-Is-Data Rule in different clothes. No component in this subrepo
uses an eyebrow pattern. *Mirrors assets/DESIGN.md:169 — change it there first.*

## Typography

**Display Font:** IBM Plex Serif 600 (with Georgia, serif fallback)
**Body Font:** IBM Plex Sans 400–600 (with sans-serif fallback)
**Label/Mono Font:** IBM Plex Mono 400 (with monospace fallback)

**The Expo app diverges.** `app/` stays on platform system fonts (native feel, Dynamic Type, zero
load cost) and adopts only the *scale and palette*. Do not "unify" the app onto IBM Plex.
*Mirrors assets/DESIGN.md:33 — change it there first.*

**Character:** a serif/sans/mono superfamily split by role. The serif marks a heading, the sans
carries prose, and the mono marks data (R-numbers, tier labels, ladder-end captions, the
colophon). All three ship as self-hosted WOFF2 latin subsets, preloaded for the sans weight range
used above the fold.

Docs sets no type scale of its own. It maps the shared web scale from `assets/DESIGN.md` onto
Starlight's heading tokens (`--sl-text-h1/h2/h3/h4`) and leaves every other `--sl-text-*` token
(body, small, code) untouched. Starlight's stock ramp rendered 54px/35px/29px against a 16px body,
roughly 1.45× the brand scale, which read as a landing page inside a reference site.

### Hierarchy

- **H1** (600, 2.375rem / 38px, `--sl-text-h1`): page title. Matches the brand's "display 38".
- **H2** (600, 1.5rem / 24px, `--sl-text-h2`): major section heading. Matches brand "h2 24".
- **H3** (600, 1.1875rem / 19px, `--sl-text-h3`): subsection heading. Matches brand "heading 19".
- **H4** (600, 1.0625rem / 17px, `--sl-text-h4`): the brand scale has no fourth heading step, so
  this value is interpolated between H3 and Starlight's body size; not sourced from
  `assets/DESIGN.md`.
- **Body**: Starlight's own default (`--sl-text-base`, 16px), which already matches the brand's
  body step; not an override.

All four heading selectors also get `font-family: IBM Plex Serif, Georgia, serif` and
`letter-spacing: -0.01em` in `base.css`, on `h1, h2, h3, h4, .site-title, .hero`. Starlight exposes
no `--sl-font-headings` token.

**Relab-authored vs. Starlight-default:** the four heading *sizes* and the heading *font-family*
are Relab decisions (`base.css`). Body size, label size, code font size, and every other
`--sl-text-*` step are Starlight defaults. `--sl-font-mono` is repointed to
`--relab-brand-font-mono`. `--sl-font` is **not** overridden; `base.css` sets `font-family`
directly on `html, body`, which wins by source order but bypasses the token. A future Starlight
component that reads `--sl-font` directly would not pick up the brand sans.

## Layout

Single-column reading layout inherited from Starlight: fixed sidebar, header, centered content
column. The one change is content width: `--sl-content-width` is `45rem`, not Starlight's `54rem`.
**Measured in the browser: 720px at 16px IBM Plex Sans renders 72 characters per line**, inside
the 45-75 range. (A rem-to-character estimate gave ~86ch and was wrong; trust the measurement.)
Mermaid diagrams are the sole content allowed to exceed this column: on viewports ≥72rem,
`.relab-mermaid` breaks out to `calc(100% + 4.5rem)` with `-2.25rem` inline margins. Below that
breakpoint the column is already full-width, so no break-out happens. The header grid gets one
density tweak at ≥50rem
(`grid-template-columns: minmax(max-content, auto) minmax(14rem, 1fr) auto`) to keep the widened
`SiteTitle` wordmark, search box, and `SocialIcons`/CTA cluster proportioned. Sidebar width, TOC
column, mobile nav collapse breakpoints, and header height (`--sl-nav-height`) are Starlight
defaults.

## Elevation & Depth

**Flat, with no floating tier in docs' own CSS.** Docs has no dialog, sheet, or menu of its own,
so it never uses `--relab-radius-overlay` or `--relab-shadow-overlay`. `tokens.generated.css`
still ships those values for the whole monorepo; `base.css` uses only `--radius-control` and
`--radius-card`.

The monorepo rule: inline surfaces (cards, rows, inputs) are flat, a 1px hairline border plus a
surface fill, no shadow. Shadow is reserved for one tier, `shadow-overlay`, on surfaces that float.
*Mirrors assets/DESIGN.md:121 — change it there first.*

Depth in the rendered page comes from Starlight's own chrome (search modal, mobile nav drawer),
which docs does not restyle. The one frame docs authors, `.relab-mermaid`, is a bordered, tinted
panel: 1px `color-mix()` border, tinted background, `border-radius: var(--radius-card)`, no
box-shadow.

## Shapes

The full scale is control 6px, card 8px, overlay 12px, full 9999 (avatars and true pills only).
*Mirrors assets/DESIGN.md:111 — change it there first.*

Docs draws from the bottom two rungs only. `--radius-control` (6px) sizes the site-title logo image
and the sidebar active-link box-shadow inset; `--radius-card` (8px) sizes `.relab-card-grid` items
and the `.relab-mermaid` frame. Borders are 1px hairlines in `--relab-brand-divider` or a
`color-mix()` tint of primary, never heavier. `NineRLadder`'s staircase (see
[Components](#components)) is the one custom shape: each rung's `border-left` + `border-bottom`
pair chains into a continuous descending flight.

## Components

### Navigation (Starlight-inherited, lightly re-skinned)

Sidebar link styling, mobile collapse, and the search trigger are unmodified Starlight. The one
override is the **active-page state** (`.sidebar-pane a[aria-current="page"]`, `components.css`):
a `color-mix()`-tinted primary background (14% light / 22% dark) with a matching inset box-shadow
ring and bold text. Header layout comes from two swapped component slots:

- **`SiteTitle`** (`src/components/SiteTitle.astro`): the wordmark, theme-swapped via two `<img>`
  elements toggled by Starlight's `dark:sl-hidden`/`light:sl-hidden` classes (there is no CSS-only
  single-asset swap for an `<img src>`). It adds a "Docs" text cue after a 1px vertical rule in
  `--sl-color-gray-5`. The cue's text color is `gray-2` (10.92:1 light / 8.57:1 dark); `gray-3`
  was 4.49:1 in dark mode, under WCAG AA.
- **`SocialIcons`** (`src/components/SocialIcons.astro`): renders the GitHub icon plus a
  **primary CTA button** ("Open app") for the `external`-typed social link. Filled
  `--relab-brand-primary`, `--radius-control` corners, `--relab-brand-primary-strong` on hover; it
  drops below 30rem viewport width.

### Cards (Relab-authored)

`.relab-card-grid` (`components.css`): an auto-fit grid (`minmax(15rem, 1fr)`) of plain `<li>`
cards for the landing-page section links. **Shape:** `--radius-card` (8px). **Background:**
`color-mix(in srgb, var(--relab-brand-primary) 4%, transparent)`, not the flat
`--relab-brand-surface` token. **Border:** 1px, `color-mix()` primary at 18%. No hover state:
cards are plain links.

### Colophon (Relab-authored, signature pattern)

`.relab-colophon` (`components.css`, content from `Colophon.generated.astro`) sets research
metadata (affiliation, authors, citation DOI, license, funding, contact) in mono at 13px/1.6, with
one hairline rule above, no cards and no icons. It replaced a shields.io badge row that loaded four
third-party images.

### NineRLadder (signature custom component)

`src/components/NineRLadder.astro`: the 9R framework drawn as a descending staircase, one figure
per page, not a reusable widget. Ten rungs across three tiers (make / extend-life /
materials-only), each `<li class="rung">` indented by `calc(var(--step) * var(--stair))` where
`--step` is the strategy's rank (0–9). The indent alone draws the staircase. **No bar or width
encodes "value retained"**: the 9R order is ordinal, and a bar would invent a magnitude the source
taxonomy (Potting et al. 2017) never measured. Rung numbers (`R0`…`R9`) are mono in the **manila
accent**, the component's only accent use. The stair unit shrinks from `1.15rem` to `0.5rem` under
50rem rather than switching layout.

### Mermaid diagrams (third-party, partially themed, drift risk)

Rendered client-side via `mermaid` + `@mermaid-js/layout-elk`, orchestrated by
`src/scripts/mermaid.ts`. **Chrome** (background, un-classed node fill, line color) is themed via
`themeVariables`, partly live (`primaryBorderColor`/`primaryTextColor` resolve `light-dark()`
brand tokens at runtime) and partly hand-tuned hex with no update path (see Colors § Diagram &
chart palette). **Content** (node and edge categorical colors) is themed via literal hex
`classDef` lines in the `.mdx` files. The wrapping frame (`.relab-mermaid`: border, radius,
background tint, horizontal scroll for overflow) is Relab-authored in `components.css`.

### API reference pages (third-party, **not themed**)

`src/pages/api/*` use `@scalar/api-reference`, rendered through `api-reference-page.astro` +
`src/scripts/api-reference.ts`. Scalar's `style.css` is imported unmodified and **no Relab CSS
variable, theme override, or Scalar theme option is passed**. The `api-reference` config sets only
functional options (`baseServerURL`, `hideClientButton`, `persistAuth: false`,
`telemetry: false`). The reference renders in Scalar's vendor default theme. The only Relab chrome
on these pages is the shell in `api-reference-page.astro`'s `<style>` block: the sticky switcher
nav between Public/Device/RPi-camera references, built from `--relab-brand-primary` and
`--radius-control`. It also sets `<meta name="theme-color">`, parsed at build time out of
`brand.css`'s raw text by a regex on `--relab-brand-theme-color`.

## Do's and Don'ts

### Do

- **Do** treat `tokens.generated.css` as read-only. It is generated from `assets/tokens.json` by
  `scripts/sync_brand_assets.py` and byte-identical to `www/`'s copy; edit the JSON and run
  `just assets-sync`.
- **Do** map any new Starlight interaction-state override onto the primary blue family, never
  manila. Starlight's `accent` token is its *interaction* color, not Relab's *data-label* accent.
- **Do** keep the manila accent scarce and small (the R-number in `NineRLadder`), per "accent is
  for small text, never for mass".
- **Do** reuse the chart ramp's hue-to-category mapping (actor=blue, backend=manila,
  frontend=verdigris, external=copper, datastore=violet, hardware=rose, neutral=slate) in a new
  architecture diagram, and copy the literal hex from the table above.
- **Do** let mermaid diagrams break out of the prose column on wide viewports; keep the reading
  measure narrow for prose.

### Don't

- **Don't** add eyebrows or kickers to any docs heading or section; the No-Eyebrow Rule applies
  to `www/` and `docs/`.
- **Don't** point `--sl-color-accent` at `--relab-brand-accent` (manila).
- **Don't** assume mermaid diagram content colors are bound to `tokens.generated.css`; they are
  hand-copied literals in each `.mdx` file. Changing the token alone does not update diagrams.
- **Don't** assume the Scalar API reference pages inherit brand theming; only the wrapping shell
  nav is on-brand.
- **Don't** use Tailwind utility classes in docs; the subrepo ships none, and Tailwind's preflight
  reset broke markdown list rendering here.
- **Don't** add a floating or shadowed surface to docs without also using `--radius-overlay` and
  `--shadow-overlay`. A shadow with no radius-scale backing breaks the flat/one-floating-tier
  discipline the rest of the monorepo holds.
