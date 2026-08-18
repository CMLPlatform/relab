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

**Creative North Star: "Cyanotype & Manila — the colour of engineering documentation."** Same
north star as `www/`, carried by inheritance rather than restated invention. See the [Named
Rule](#named-rules) below on how that inheritance actually works.

This is a **Starlight** site, and that fact governs almost everything about how its visual system is
built. Starlight ships a complete, opinionated design system of its own (typography scale, color
roles, sidebar chrome, code blocks, search UI) expressed as CSS custom properties (`--sl-color-*`,
`--sl-text-h1/h2/h3`, `--sl-font-mono`, `--sl-content-width`, and dozens more).

Relab's docs site does not re-author that system. It authors a **thin brand layer** (`brand.css`
and `tokens.generated.css`, ~123 lines combined), loaded before Starlight's own styles in
`customCss`. That layer then overrides a **deliberately short list** of Starlight's own tokens to
pull the site onto brand. Everything else Starlight defines is **unmodified Starlight default**,
not a Relab decision: spacing rhythm, sidebar layout mechanics, search modal, table styling, code
block chrome (Expressive Code), badge/aside components, right-hand table-of-contents behavior.

A reader auditing this file should read the frontmatter and the `### Relab-authored vs. Starlight-default` note under each section as the actual boundary. What's listed there was chosen;
anything else in the rendered page is upstream Starlight, un-revisited.

**On the duplicated brand rules below — the duplication is deliberate.** Several rules here
(accent, eyebrows, elevation, radius, the typeface split) are restated in full from
`assets/DESIGN.md` and also appear in `www/DESIGN.md` and `app/DESIGN.md`. That is not sloppiness
and must not be "helpfully" deduplicated into a citation.

The reason is mechanical. Whoever edits a component reads the design file next to it and does not
open a second one, so a rule that lives only as a cross-reference is a rule nobody follows.
`assets/DESIGN.md` is worse than inconvenient here: it sits at a path no design tooling looks in,
which searches a subrepo root and the repo root only. A pointer to it is enforced by nothing.

Each restatement therefore carries a `Mirrors assets/DESIGN.md:NN` marker.
Run `rg "Mirrors assets/DESIGN.md"` to list every copy across the repo and check them against
source in one command. `assets/DESIGN.md` remains the place to change a rule first.

The four re-skin points that do the entire job are page background (`--sl-color-bg`,
`--sl-color-bg-sidebar`, `--sl-color-bg-nav`) and the accent/interaction triad
(`--sl-color-accent-low/DEFAULT/-high`, mapped to primary blue, **not** manila — see the Named
Rule). The other two are the heading size ramp (`--sl-text-h1/h2/h3/h4`, pulled down from
Starlight's stock landing-page-sized defaults to the brand's reference-document scale) and the
mono font family (`--sl-font-mono`).

**Three** Starlight component slots are swapped for custom `.astro` files, per `astro.config.mjs`:
`SiteTitle` and `SocialIcons`, because their content (the wordmark, the "Open app" CTA) has no
Starlight token to hook into. The third, `Head`, injects the font preload and favicon links.

Two third-party renderers — mermaid and Scalar's API reference — live inside this system as
embedded apps with their own theming surface. See [Elevation & Depth](#elevation--depth) and
[Components](#components) for how (and how incompletely) each is wired to the brand.

**Key Characteristics:**

- A brand layer of custom properties sits *underneath* Starlight's own token layer; only a
  short, named list of `--sl-*` tokens is overridden, everything else is Starlight's own design.
- No Tailwind. `base.css` states this explicitly: Tailwind's preflight reset previously stripped
  list bullets/indent from every markdown list, so docs styles with plain CSS and Starlight's
  own `sl-*` utility classes only.
- Reading measure is prioritized over Starlight's stock width: `--sl-content-width` is narrowed
  from Starlight's default 54rem to 45rem, a measured 72 characters per line. Only wide mermaid
  diagrams are allowed to break out of that column.
- The categorical 7-hue diagram palette from `assets/DESIGN.md` is real and consistently used
  across every architecture diagram, but it reaches mermaid as **literal duplicated hex per
  diagram**, not as a live token reference. Mermaid's diagram-source language cannot consume
  `var(--relab-chart-*)`, so the generated tokens exist as documentation-of-record for values
  that are hand-copied into each `.mdx` file's `classDef` lines.

## Colors

The palette is identical to `www/`'s: cyanotype blue for structure and interaction, manila
reserved for data labels. Docs consumes it as plain CSS custom properties (`--relab-brand-*`),
generated into this repo by `scripts/sync_brand_assets.py` from `assets/tokens.json` /
`assets/palette.json` — byte-identical to `www/src/styles/tokens.css`'s copy. **Do not hand-edit
these values here**; change `assets/palette.json` (or `tokens.json` for the radius/shadow/chart
values) and run `just assets-sync`.

### Primary

- **Cyanotype Blue** (`light-dark(#1f4c96, #8fb8ff)`, `--relab-brand-primary`): brand anchor.
  Mapped onto Starlight's own `--sl-color-accent`, so it carries every link, active nav item,
  and focus ring the framework renders — not just Relab-authored chrome.
- **Cyanotype Blue, Strong** (`light-dark(#143567, #bad3ff)`, `--relab-brand-primary-strong`):
  hover/pressed states; mapped to `--sl-color-accent-high`.
- **Cyanotype Blue, Soft** (`light-dark(rgba(31,76,150,.08), rgba(143,184,255,.14))`,
  `--relab-brand-primary-soft`): tinted fills — the active sidebar-link background and the
  `.relab-card-grid` item background; mapped to `--sl-color-accent-low`.
- **Active sidebar-link ink** (`rgb(18,49,75)` light / `rgb(234,247,255)` dark,
  `components.css:60,71`): the one place in docs that hand-authors a colour rather than deriving
  it. Deliberately tuned rather than drift: the nearest token, `--relab-brand-primary-strong`, is
  close but does not match. The pair was picked for contrast against the tinted active-row
  background above (measured 4.49:1 → 10.92:1 light, 8.57:1 dark). Recorded here with values so an
  audit does not have to re-derive the intent; the detector flags both and the findings are
  expected.

### Secondary

- **Manila** (`light-dark(#8f6212, #e3b95c)`, `--relab-brand-accent`): the data-label colour.
  In docs' own custom CSS it appears in exactly one place — `.rung-num` in `NineRLadder.astro`,
  labelling each R-strategy's number. It is intentionally **not** mapped to any Starlight
  interaction token (see the Named Rule below).

### Neutral

- **Ink** (`light-dark(#16202e, #e9eff8)`, `--relab-brand-text`): body text color, set directly
  on `body` in `base.css`.
- **Page Ground** (`light-dark(#fafbfe, #11141d)`, `--relab-brand-background`): mapped to
  `--sl-color-bg`, replacing a previous fixed-background photograph + blur treatment that taxed
  reading contrast on every page load.
- **Surface** (`light-dark(#f0f3fa, #1a2030)`, `--relab-brand-surface`): the card/panel tone,
  matching the app's card and popover keys. New on web and not yet mapped to any Starlight token;
  it used to be the (misnamed) page-ground value, so pair text contrast against Page Ground for
  body copy and against Surface only inside cards.
- **Divider** (`light-dark(#d9dfe8, #24314a)`, `--relab-brand-divider`): hairlines — the
  colophon's top rule, `NineRLadder`'s tier and rung borders (via `--sl-color-hairline` with this
  as fallback).
- **Chrome Wash**: `--sl-color-bg-sidebar` / `--sl-color-bg-nav` are not a Relab token directly.
  They're `color-mix(in srgb, var(--relab-brand-primary) 5%, var(--relab-brand-background))` — a
  computed one-liner replacing Starlight's stock neutral grey (`#f6f7f9`/`#23262f`), which read
  as a mismatched band once the page ground went flat.

### Diagram & chart palette

A 7-hue categorical ramp, each hue as a fill/stroke/text triplet, generated into
`tokens.generated.css` (`--relab-chart-<hue>-fill/-stroke/-text`) and used across every mermaid
diagram under `src/content/docs/architecture/*.mdx`. This is the same ramp defined in
`assets/DESIGN.md`. Blue and manila are the brand primaries; verdigris and copper are borrowed
from the alternative brand direction. Violet, rose, and slate fill out the seven roles diagrams
need.

| Hue             | Fill      | Stroke    | Text      |
| --------------- | --------- | --------- | --------- |
| Blue (primary)  | `#e3ecfa` | `#1f4c96` | `#143567` |
| Manila          | `#f7ecd4` | `#8f6212` | `#5c3f0a` |
| Verdigris       | `#e0f2ed` | `#0e6b5e` | `#0a4f45` |
| Copper          | `#f9e7de` | `#a8542f` | `#6e371f` |
| Violet          | `#ede6f7` | `#6d4fa3` | `#44337a` |
| Rose            | `#fae4ec` | `#b0316e` | `#6e2048` |
| Slate (neutral) | `#f1f4f8` | `#5a6675` | `#16202e` |

Confirmed by direct inspection of `system-design.mdx`, `rpi-cam.mdx`, and `datamodel.mdx`: each
assigns the hues by semantic category (`actor`=blue, `backend`=manila, `frontend`=verdigris,
`external`=copper, `datastore`=violet, `hardware`=rose, `auth`/neutral nodes=slate). The mapping
is applied via `classDef ... fill:#…,stroke:#…,color:#…` lines whose hex values are copy-pasted
verbatim from this table. Mermaid's diagram-source grammar has no way to reference a CSS custom
property. So the tokens in `tokens.generated.css` and the literals inside each `.mdx` are two
copies of the same source of truth, kept in sync by hand rather than by the build.

Separately, mermaid's own **chrome** (diagram background, node fill for un-classed nodes, line
color) is themed by `src/scripts/mermaid.ts` through Mermaid's JS `themeVariables` API. It uses a
small set of **hand-tuned hex values that are not derived from the chart ramp or from
`brand.css`**. The file's own comment says so: *"hand-tuned surfaces; if brand.css primary
changes, retune these (no machine link)."*

This is a real, named drift risk. `mermaid.ts`'s `primaryBorderColor`/`primaryTextColor` do read
live from `--relab-brand-primary`/`-text` (via `resolveLightDark`, because Mermaid's `khroma`
color parser can't parse `light-dark()`). But the
background/`primaryColor`/`lineColor`/`tertiaryColor` values are separately hand-picked hex with
no update path if the brand primary ever moves.

### Named Rules

**The Accent-Is-Data Rule.** Manila (`--relab-brand-accent`) marks a *datum*, never a section or
an interactive affordance. In docs it appears in exactly one custom-CSS location — the R-number
in `NineRLadder.astro` — and nowhere else in `brand.css`/`base.css`/`components.css`. It is never
mapped to `--sl-color-accent`; doing so would turn every Starlight link and active nav item
manila, which `assets/DESIGN.md` explicitly forbids. `base.css` states this reasoning inline.
The accent never fills a button and never drives a hover/pressed state; primary blue carries all
interaction. Accent is for small text, never for mass — bars and big figures stay ink.
*Mirrors assets/DESIGN.md:163 — change it there first.*

**The No-Eyebrow Rule.** Docs carries no eyebrows/kickers, same as `www/`. A mono uppercase label
that only restates the heading beneath it is chrome, not data; the app's `eyebrow` text variant
is the one sanctioned exception, and it is app-only. No component in this subrepo uses an eyebrow
pattern — confirmed by inspection of all four custom `.astro` components and `components.css`.
The app's exception is the same principle, not a contradiction. There, an eyebrow labels a *value*
inside a compact tag — the Accent-Is-Data Rule wearing different clothes, rather than announcing a
section. *Mirrors assets/DESIGN.md:165 — change it there first.*

## Typography

**Display Font:** IBM Plex Serif 600 (with Georgia, serif fallback)
**Body Font:** IBM Plex Sans 400–600 (with sans-serif fallback)
**Label/Mono Font:** IBM Plex Mono 400 (with monospace fallback)

**The Expo app deliberately diverges.** `app/` stays on platform system fonts — native feel,
Dynamic Type support, zero load cost — and adopts only the *scale and palette*, not the typeface.
This is intentional, not drift: do not "unify" the app onto IBM Plex.
*Mirrors assets/DESIGN.md:33 — change it there first.*

**Character:** A serif/sans/mono superfamily split by role rather than by hierarchy weight. The
serif marks "this is a heading," the sans carries reading prose, and the mono marks "this is
data" (R-numbers, tier labels, ladder-end captions, the colophon). All three ship as self-hosted
WOFF2 latin subsets, preloaded for the sans weight range used above the fold.

Docs does not set its own type scale. It maps the shared web scale from `assets/DESIGN.md` onto
**Starlight's own heading tokens** (`--sl-text-h1/h2/h3/h4`), leaving Starlight's `--sl-text-*`
tokens for everything else (body, small, code) untouched. Starlight's stock ramp rendered
54px/35px/29px against a 16px body — roughly 1.45× the brand's own scale, which read as a landing
page inside a reference site. So `base.css` overrides just the four heading steps:

### Hierarchy

- **H1** (600, 2.375rem / 38px, `--sl-text-h1`): page title. Matches the brand's "display 38"
  step exactly.
- **H2** (600, 1.5rem / 24px, `--sl-text-h2`): major section heading. Matches brand "h2 24".
- **H3** (600, 1.1875rem / 19px, `--sl-text-h3`): subsection heading. Matches brand "heading 19".
- **H4** (600, 1.0625rem / 17px, `--sl-text-h4`): the brand scale has no fourth heading step, so
  this value is interpolated between H3 and Starlight's stock body size — not sourced from
  `assets/DESIGN.md`.
- **Body**: left as Starlight's own default (`--sl-text-base`, 16px) — a Relab-adopted value in
  spirit (matches the brand's body step) but not an override; Starlight's stock value happened to
  already match.

All four heading selectors additionally get `font-family: IBM Plex Serif, Georgia, serif` and
`letter-spacing: -0.01em` in `base.css`, applied to `h1, h2, h3, h4, .site-title, .hero` as a flat
selector list. This is not routed through a `--sl-font-headings` token, because Starlight does not
expose one for headings the way it does for body/mono.

**Relab-authored vs. Starlight-default:** the four heading *sizes* and the heading *font-family*
are Relab decisions (`base.css`). Body size, label size, code font size, and every other
`--sl-text-*` step are unmodified Starlight defaults. `--sl-font-mono` is repointed to
`--relab-brand-font-mono`. `--sl-font` (the body/UI font Starlight itself defines) is **not**
overridden through Starlight's token — instead `base.css` sets `font-family` directly on
`html, body`, which wins by source order/specificity but bypasses the token. As a result, a future
Starlight component that reads `--sl-font` directly (rather than inheriting from `body`) would
not pick up the brand sans.

## Layout

Single-column reading layout inherited from Starlight's docs template: fixed sidebar, header, and
a centered content column. The one deliberate change is content width: `--sl-content-width` is
set to `45rem`, narrower than Starlight's stock `54rem`, because continuous prose at Starlight's
default measure sits well past comfortable reading width. **Measured in the browser: 720px at 16px
IBM Plex Sans renders 72 characters per line**, squarely in the 45-75 range. An earlier draft of
this file estimated ~86ch from the rem value alone and undersold the decision. That estimate was
wrong because a rem-to-character conversion assumes an average glyph width this typeface does not
have. Trust the measurement, not the arithmetic. Mermaid diagrams are the sole content type
allowed to exceed this column: on viewports ≥72rem, `.relab-mermaid` breaks out to
`calc(100% + 4.5rem)` with `-2.25rem` inline margins. Below that breakpoint the column is
already full-width, so no break-out happens (avoiding induced horizontal scroll). The header grid
gets one density tweak at ≥50rem (`grid-template-columns: minmax(max-content, auto) minmax(14rem, 1fr) auto`) to keep the widened `SiteTitle` wordmark, search box, and `SocialIcons`/CTA cluster
proportioned. Everything else in the layout — sidebar width, TOC column, mobile nav collapse
breakpoints, header height (`--sl-nav-height`) — is unmodified Starlight default.

## Elevation & Depth

**Flat, with no floating tier defined in docs' own CSS.** Unlike `www/` and the app, docs has no
dialog, sheet, or menu of its own, so it never reaches for `--relab-radius-overlay` or
`--relab-shadow-overlay`. `tokens.generated.css` still ships those values, since they're generated
for the whole monorepo. But `base.css` says outright it "only uses the two tiers docs actually
uses" (`--radius-control`, `--radius-card`): "it has no floating surface of its own, so no
overlay."

The monorepo rule this inherits: inline surfaces (cards, rows, inputs) are flat — a 1px hairline
border plus a surface fill, no shadow. Shadow is reserved for one tier, `shadow-overlay`, on
surfaces that genuinely float. Docs simply never reaches that tier.
*Mirrors assets/DESIGN.md:116 — change it there first.*

Depth in the rendered page comes entirely from Starlight's own component chrome (search modal,
mobile nav drawer), which docs does not restyle. The one visual "frame" docs authors itself —
`.relab-mermaid` — is a bordered, tinted panel, not a shadowed one: 1px `color-mix()` border,
tinted background, `border-radius: var(--radius-card)`, no box-shadow.

## Shapes

The full scale is control 6px, card 8px, overlay 12px, full 9999 (avatars and true pills only).
*Mirrors assets/DESIGN.md:106 — change it there first.*

Same flat-&-sharp scale as the rest of the monorepo, but docs only draws from the bottom two rungs —
it has no overlay-tier surface. `--radius-control` (6px) sizes the site-title logo image and the
sidebar active-link box-shadow inset; `--radius-card` (8px) sizes `.relab-card-grid` items and the
`.relab-mermaid` frame. Borders throughout are 1px hairlines in `--relab-brand-divider` or a
`color-mix()` tint of primary — never a heavier rule weight. `NineRLadder`'s staircase geometry (see
[Components](#components)) is the one place docs draws a genuinely custom shape: each rung's
`border-left` + `border-bottom` pair chains into a continuous descending flight, with no extra
structural elements.

## Components

### Navigation (Starlight-inherited, lightly re-skinned)

Sidebar link styling, mobile collapse, and the search trigger are unmodified Starlight
components. The one custom override is the **active-page state**
(`.sidebar-pane a[aria-current="page"]`, `components.css`): a `color-mix()`-tinted primary
background (14% light / 22% dark) with a matching inset box-shadow ring and bold text. This
replaces whatever Starlight's stock active-link treatment would otherwise render. Header layout
comes from two swapped component slots (not token overrides):

- **`SiteTitle`** (`src/components/SiteTitle.astro`): the R9lab wordmark, theme-swapped via two
  `<img>` elements toggled by Starlight's `dark:sl-hidden`/`light:sl-hidden` utility classes
  (there is no CSS-only single-asset swap for an `<img src>`). It also adds a "Docs" text cue,
  separated by a 1px vertical rule in `--sl-color-gray-5`. The rule's text color was tuned from
  `gray-3` (4.49:1 in dark mode, just under WCAG AA) to `gray-2` (10.92:1 light / 8.57:1 dark).
- **`SocialIcons`** (`src/components/SocialIcons.astro`): repurposed to render the GitHub icon
  plus a promoted **primary CTA button** ("Open app") for the `external`-typed social link. It's
  filled `--relab-brand-primary`, with `--radius-control` corners and
  `--relab-brand-primary-strong` on hover, and drops below 30rem viewport width to keep the
  collapsed header uncluttered.

### Cards (Relab-authored)

`.relab-card-grid` (`components.css`): an auto-fit CSS grid (`minmax(15rem, 1fr)`) of plain `<li>`
cards used for the landing-page section links. **Shape:** `--radius-card` (8px). **Background:**
`color-mix(in srgb, var(--relab-brand-primary) 4%, transparent)` — a near-imperceptible primary
tint, not the flat `--relab-brand-surface` token. **Border:** 1px, `color-mix()` primary at 18%.
No hover state is defined in CSS — cards are plain links, not interactive surfaces with their own
affordance.

### Colophon (Relab-authored, signature pattern)

`.relab-colophon` (`components.css`, content generated by `Colophon.generated.astro`) sets
research metadata (affiliation, authors, citation DOI, license, funding, contact) in mono at
13px/1.6, with one hairline rule above and deliberately **no cards and no icons**. The
component's own comment frames it as replacing a shields.io badge row that loaded four
third-party images and read as README furniture rather than reader-facing content.

### NineRLadder (signature custom component)

`src/components/NineRLadder.astro` — the 9R framework drawn as a literal descending staircase,
one figure per page (`architecture` docs), not a reusable widget. Ten rungs across three grouped
tiers (make/extend-life/materials-only), each `<li class="rung">` indented by
`calc(var(--step) * var(--stair))` where `--step` is the strategy's own rank (0–9). The indent
alone draws the staircase, no chart library. Deliberately **no bar or width encoding "value
retained"**: the component's own comment states the 9R order is ordinal. A bar would invent a
magnitude the source taxonomy (Potting et al. 2017) never measured. Rung numbers (`R0`…`R9`) are
set in mono and colored with the **manila accent** — the ladder's one and only accent use in the
entire component, consistent with the Accent-Is-Data Rule. Responsive: the stair unit itself
shrinks from `1.15rem` to `0.5rem` under 50rem rather than switching to a different layout.

### Mermaid diagrams (third-party, partially themed — drift risk)

Rendered client-side via `mermaid` + `@mermaid-js/layout-elk`, orchestrated by
`src/scripts/mermaid.ts`. **Chrome** (background, un-classed node fill, line color) is themed via
Mermaid's `themeVariables`, partly live (`primaryBorderColor`/`primaryTextColor` resolve
`light-dark()` brand tokens at runtime). The rest is partly hand-tuned hex with **no update
path** if the brand primary changes (see Colors § Diagram & chart palette). **Content** (the
actual node/edge
categorical colors) is themed via literal hex `classDef` lines duplicated by hand from the chart
ramp, not through this component at all. That theming lives in the `.mdx` content files.
The wrapping frame (`.relab-mermaid`: border, radius, background tint, horizontal scroll for
overflow) is fully Relab-authored in `components.css`.

### API reference pages (third-party, **not themed**)

`src/pages/api/*` use `@scalar/api-reference`, rendered through `api-reference-page.astro` +
`src/scripts/api-reference.ts`. Scalar ships its own `style.css`, imported unmodified. **No
Relab CSS variable, theme override, or custom Scalar theme option is passed at all.** The
`api-reference` config object only sets functional options (`baseServerURL`, `hideClientButton`,
`persistAuth: false`, `telemetry: false`), none of them visual. The interactive reference surface
therefore renders in Scalar's own vendor default theme, visually disconnected from the rest of
docs. The only Relab-authored chrome on these pages is the wrapping shell
(`api-reference-page.astro`'s own `<style>` block). It is the sticky switcher nav between
Public/Device/RPi-camera API references, built from the same brand primitives
(`--relab-brand-primary`, `--radius-control`) as the rest of the site. It also sets the
`<meta name="theme-color">` tag, whose value is parsed at build time out of `brand.css`'s raw
text via a regex match on `--relab-brand-theme-color`, rather than read as a token.

## Do's and Don'ts

### Do

- **Do** treat `tokens.generated.css` as read-only. It's generated from `assets/tokens.json` by
  `scripts/sync_brand_assets.py` and is byte-identical to `www/`'s copy; edit the source JSON and
  run `just assets-sync`.
- **Do** map new Starlight interaction states (if any get overridden) onto the primary blue
  family, never manila — Starlight's `accent` token is its *interaction* color, not Relab's
  *data-label* accent, and the two must not collide.
- **Do** keep the manila accent scarce and small when it does appear (the R-number in
  `NineRLadder`, per the app-wide "accent is for small text, never for mass" rule) — nothing in
  docs currently uses it any other way.
- **Do** reuse the categorical chart ramp's fixed hue-to-category mapping (actor=blue,
  backend=manila, frontend=verdigris, external=copper, datastore=violet, hardware=rose,
  neutral=slate) when adding a new architecture diagram, and copy the literal hex from the table
  above rather than inventing new values. The mapping's consistency across diagrams is the point.
- **Do** let mermaid diagrams break out of the prose column on wide viewports rather than
  widening the whole column to fit them; keep the reading measure narrow for prose.

### Don't

- **Don't** add eyebrows/kickers to any docs heading or section — the No-Eyebrow Rule applies to
  both `www/` and `docs/`; it is app-only.
- **Don't** point `--sl-color-accent` at `--relab-brand-accent` (manila) — it was deliberately
  left pointed at primary blue specifically to avoid this.
- **Don't** assume the mermaid diagram content colors are live-bound to `tokens.generated.css` —
  they are hand-copied literals in each `.mdx` file; changing the generated token alone will not
  update rendered diagrams.
- **Don't** assume the Scalar API reference pages inherit brand theming — they currently render
  in Scalar's unmodified vendor default theme; only the wrapping shell nav is on-brand.
- **Don't** reach for Tailwind utility classes in docs — the subrepo deliberately ships none;
  Tailwind's preflight reset previously broke markdown list rendering here.
- **Don't** add a floating/shadowed surface to docs without also adding `--radius-overlay` and
  `--shadow-overlay` usage deliberately. Docs currently has no floating tier at all, and
  introducing one silently (e.g. a shadow with no radius-scale backing) would break the
  flat/one-floating-tier discipline the rest of the monorepo holds.
