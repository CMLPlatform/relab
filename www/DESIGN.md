---
name: Relab — Web
description: The marketing and research-provenance site for Relab, set as engineering documentation.
colors:
  primary: '#1f4c96'
  primary-strong: '#143567'
  primary-soft: rgba(31, 76, 150, 0.08)
  accent-manila: '#8f6212'
  ink: '#16202e'
  ink-heading: rgb(23, 38, 55)
  muted: rgb(83, 102, 122)
  page-surface: '#fafbfe'
  surface-raised: '#f0f3fa'
  page-border: rgba(23, 38, 45, 0.12)
  control-border: 'color-mix(in srgb, #1f4c96 70%, #fafbfe)'
  ring: '#1f4c96'
  chart-mark: '#2f6bc7'
  divider: '#d9dfe8'
typography:
  display:
    fontFamily: IBM Plex Serif, Georgia, serif
    fontSize: clamp(2rem, 3.2vw, 2.375rem)
    fontWeight: 600
    lineHeight: 1.16
    letterSpacing: -0.01em
  headline:
    fontFamily: IBM Plex Serif, Georgia, serif
    fontSize: clamp(1.6rem, 2.4vw, 2.2rem)
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.01em
  record-title:
    fontFamily: IBM Plex Serif, Georgia, serif
    fontSize: 1.35rem
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.01em
  subhead:
    fontFamily: IBM Plex Serif, Georgia, serif
    fontSize: 1.08rem
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.01em
  body:
    fontFamily: IBM Plex Sans, Segoe UI, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.625
  body-compact:
    fontFamily: IBM Plex Sans, Segoe UI, sans-serif
    fontSize: 0.95rem
    fontWeight: 400
    lineHeight: 1.62
  label:
    fontFamily: IBM Plex Mono, monospace
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.1em
  data:
    fontFamily: IBM Plex Mono, monospace
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: tabular-nums
  meta:
    fontFamily: IBM Plex Sans, Segoe UI, sans-serif
    fontSize: 0.94rem
    fontWeight: 400
    lineHeight: 1.5
  metric:
    fontFamily: IBM Plex Sans, Segoe UI, sans-serif
    fontSize: clamp(2.4rem, 5vw, 3.6rem)
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: -0.02em
rounded:
  control: 6px
  card: 8px
  overlay: 12px
  full: 9999px
spacing:
  hairline-gap: 0.4rem
  xs: 0.6rem
  sm: 0.9rem
  md: 1.4rem
  lg: 2rem
  column-gap: 2.5rem
  shell: 2.75rem
  section: 3rem
  section-compact: 1.6rem
  page-gutter: 1rem
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '#ffffff'
    rounded: '{rounded.control}'
    padding: 0.8rem 1.15rem
  button-primary-hover:
    backgroundColor: '{colors.primary-strong}'
  button-outline:
    backgroundColor: transparent
    textColor: '{colors.primary-strong}'
    rounded: '{rounded.control}'
    padding: 0.8rem 1.15rem
  button-outline-hover:
    backgroundColor: '{colors.primary-soft}'
  button-large:
    height: 3.35rem
    padding: 0.6rem 1.35rem
  chip-tag:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: 0.2rem 0.55rem
  segmented-toggle:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    rounded: '{rounded.control}'
    padding: 0.34em 0.9em
  segmented-toggle-selected:
    backgroundColor: '{colors.primary-soft}'
    textColor: '{colors.primary-strong}'
  theme-toggle:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    rounded: '{rounded.control}'
    width: 2.1rem
    height: 2.1rem
  theme-toggle-selected:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink-heading}'
  blueprint-panel:
    backgroundColor: transparent
    rounded: '{rounded.card}'
    padding: 1.25rem
  blueprint-plate:
    backgroundColor: '{colors.surface-raised}'
    rounded: '{rounded.control}'
    padding: 0.4rem
  site-header:
    backgroundColor: '{colors.page-surface}'
    padding: 0.55rem 0
---

# Design System: Relab — Web

## Overview

**Creative North Star: "Cyanotype & Manila — the colour of engineering documentation."**

Before a product can re-enter the loop, someone has to document how it was made. Cyanotype blue
is the colour of that record; manila is the tag tied to the part. The www surface is where that
record is shown to people who have not seen it yet, so the site does not decorate the research.
It *is* a document about the research, reproduced at web scale. A visitor's first viewport is a
claim on the left and a real teardown schedule on the right, printed in duotone blue, because the
evidence is the pitch.

The form language is **Flat & Sharp**: the geometry of an engineering document. There is no
frosted chrome, no card shadow, no rounded-pill anything. Depth is done the way a drafting sheet
does it: a 1px hairline, a shade of surface, and generous vertical space. The page is one
continuous document rather than a stack of panels: sections are separated by a rule and by
`padding-block`, and carry no fill or radius of their own. Exactly one surface on the site earns
a frame, and it earns it by being a document reproduced inside a document.

Density is calm but not sparse. Prose is capped at a real measure (44rem for read-mode pages,
48–80ch for individual blocks). Figures are set in tabular mono, and every heading is IBM Plex
Serif, so the type register alone tells you whether you are reading a claim or a measurement.
Motion exists only where it reports something: a figure refreshing, a bar being measured, a
schedule dealing itself out of its assembly, a brand mark handing off to the header. Nothing
bounces, nothing floats, and nothing animates purely to prove it can.

**Key Characteristics:**

- Cyanotype blue for every interaction; manila reserved for data labels
- Flat and sharp: hairlines and surface tone instead of shadow
- IBM Plex superfamily, three voices: Serif for headings, Sans for prose, Mono for data
- One document, not a deck of panels: sections divided by a rule, never by a card
- Photographs are duotoned into the palette so a wall of bench shots reads as one schedule
- WCAG 2.2 AA, with contrast reasoning written into the token file itself

**On the duplicated brand rules below — the duplication is deliberate.** Several rules here
(accent, eyebrows, elevation, radius, the typeface split) are restated in full from
`assets/DESIGN.md` and also appear in `docs/DESIGN.md` and `app/DESIGN.md`. That is not sloppiness
and must not be "helpfully" deduplicated into a citation.

The reason is mechanical. Whoever edits a component reads the design file next to it and does not
open a second one, so a rule that lives only as a cross-reference is a rule nobody follows.
`assets/DESIGN.md` is worse than inconvenient here: it sits at a path no design tooling looks in,
which searches a subrepo root and the repo root only. A pointer to it is enforced by nothing.

Each restatement therefore carries a `Mirrors assets/DESIGN.md:NN` marker.
Run `rg "Mirrors assets/DESIGN.md"` to list every copy across the repo and check them against
source in one command. `assets/DESIGN.md` remains the place to change a rule first.

## Colors

A Prussian-blue-on-cool-paper palette in a strict light/dark pair, with one warm ochre held in
reserve for data.

Every value below is authored as a `light-dark()` pair in `src/styles/brand.css` and
`src/styles/tokens.css`. Those two files are the normative source, and the pair is the value: the
frontmatter above carries only the light half, because its schema has no room for both. Read the
dark half from the stylesheet, and never flatten a pair to a single hex. Radius, shadow, scrim, and
the categorical chart ramp live in `src/styles/tokens.generated.css`, which is generated from
`assets/tokens.json` by `scripts/sync_brand_assets.py`:
**that file is never edited by hand, and its values are not editable from here.**

### Primary

- **Cyanotype Blue** (`--color-primary`): the brand anchor and the site's entire interaction
  vocabulary: links, the filled CTA, the outline button's label, focus rings, the drafting grid
  behind the blueprint panel, and the duotone that tints every photograph.
- **Prussian Deep** (`--color-primary-strong`): the state shade. Filled buttons deepen to it on
  hover; the outline button and the selected segmented toggle wear it as label ink.
- **Blue Wash** (`--color-primary-soft`): an 8% (14% dark) tint of the primary. The canonical
  tinted-fill: outline-button hover, selected measure toggle. It is the only "filled" state that
  is not a solid.

### Secondary

- **Manila** (`--color-accent`): the ochre of a parts tag. A data-label colour only, and on www it
  is deliberately almost absent. See the Accent Rule below.

### Tertiary

- **Data-Viz Blue** (`--color-chart-mark`): the primary brightened into the data-viz band, because
  the brand blues are tuned for text and links, not for large fills. It is the only ink allowed on
  a bar: the stats activity chart's columns, the crosshair dot, and every mass-share bar in the
  teardown schedule.

### Neutral

- **Ink** (`--color-text`): body prose across the site.
- **Heading Ink** (`--color-on-surface`): a cooler ink for headings, hero figures, part masses
  and chart peak labels: anything that is a statement rather than a sentence. Cooler, not
  stronger — it is slightly *below* Ink on the light ground (14.8:1 against 15.9:1) and slightly
  above it in dark (17.0:1 against 15.9:1), so it is a register, not a contrast step. Both clear
  AAA everywhere they are used; neither is load-bearing for legibility.
- **Muted Slate** (`--color-muted`): secondary prose, captions, mono labels, nav-adjacent chrome,
  step numbers, and every "this is context, not content" line. Deliberately distinct from the
  shared brand `muted`; www's is a page-chrome override, and `tokens.css` says so.
- **Ground** (`--color-page-surface`, the brand background): the page ground, and also the sticky
  header's fill so the bar reads as part of the sheet rather than as a layer over it. It is the
  paper half of every inverse pair too: the chart tooltip's text and the 2px ring that keeps the
  tooltip dot legible where it crosses a bar are this token against `--color-on-surface`.
- **Card** (`--color-surface-raised`, the brand surface): the tone of a teardown plate, the
  drafting callout badge, and the theme toggle's face once a theme is explicitly chosen. It is a
  *tint away from* the ground, not a step toward white: darker than the ground in light and
  lighter in dark, which is how the shared brand system separates a card from its page.
- **Hairline** (`--color-page-border`): the site's structural line. Every section divider, every
  frame, every drafting rule. Translucent at 12% and measured at roughly 1.3:1 against the page,
  because it separates content rather than identifying a control.
- **Control Boundary** (`--color-control-border`): the border of anything whose border is the
  *only* thing marking it as a control: outline buttons, the measure toggle group, the theme
  toggle. Mixed 70% primary into the page ground rather than set solid, so it reads as chrome
  rather than as a second primary action. Measured at 3.9:1 light and 5.1:1 dark to clear WCAG
  1.4.11.
- **Focus Ring** (`--color-ring`): solid brand primary, never a tint. A translucent ring lands
  around 1.4:1 on both the page and card surfaces, well under the 3:1 that 1.4.11 requires. The
  solid primary clears it at 7.5:1 light and 9.3:1 dark.

### Named Rules

**The Accent Rule.** Manila is a **data-label** colour: record IDs, live/status pills, small data
highlights. It marks a *datum*, never a section. It never fills a button and never drives a
hover or pressed state. Primary blue carries **all** interaction. And accent is for small text,
never for mass: bars, big figures and any large element stay ink. When in doubt on something
large, use ink. *Mirrors assets/DESIGN.md:173 — change it there first.*

**The Two-Border Rule.** A border that separates or frames content uses the hairline
(`--color-page-border`). A border that is the only thing identifying a control uses the control
boundary (`--color-control-border`). Never reach for the hairline on an interactive edge: it
measures ~1.3:1 and 1.4.11 wants 3:1.

**The Mixed-Not-Raw Rule.** New tints derive from a token with `color-mix()`: the drafting grid
is 7% primary, the plate frames 45% primary, the bar track 12% primary. Never introduce a raw hex
into a component. There are exactly two hand-authored exceptions, and the values are recorded here
so an audit does not have to re-derive whether each is drift:

- `--color-chart-mark`: `light-dark(#2f6bc7, #6fa8ff)`, the primary brightened into the data-viz
  band, because the brand blues are tuned for text and links rather than large fills.
- The flipped button label ink: `light-dark(rgb(255,255,255), rgb(12,18,32))` on `.btn-primary`.
  It inverts against the filled primary, so it cannot derive from the surface it sits on.

Both are annotated in `tokens.css` and `components.css` where they live. The detector will flag the
second as an undocumented colour. That finding is expected and should not be suppressed, because an
ignore would also silence a genuinely new raw hex at the same value.

## Typography

**Display Font:** IBM Plex Serif 600 (with Georgia, serif)
**Body Font:** IBM Plex Sans 400–600 (with Segoe UI, sans-serif)
**Label/Mono Font:** IBM Plex Mono 400–500 (with monospace)

**The Expo app deliberately diverges.** `app/` stays on platform system fonts (native feel,
Dynamic Type support, zero load cost) and adopts only the *scale and palette*, not the typeface.
Intentional, not drift: do not "unify" the app onto IBM Plex.
*Mirrors assets/DESIGN.md:33 — change it there first.*

**Character:** One superfamily, three voices that never blur. The serif gives headings the weight
of a printed report without any editorial flourish. The sans is the neutral instrument panel
around it. The mono is the register of the lab bench: every ID, count, mass and measurement is
set in it with `tabular-nums` so columns of figures line up down the page. Faces are self-hosted
latin subsets (`/fonts/*.woff2`, `font-display: swap`), with the Sans regular preloaded.

### The ramp is now a token set, not a hand-authored scale

`assets/tokens.json` defines the ramp and `scripts/sync_brand_assets.py` emits it into
`src/styles/tokens.generated.css` as `--relab-type-{role}-size` / `-line`, plus
`--relab-type-label-tracking`. Sizes are rem so browser font scaling works (WCAG 1.4.4); line
heights are unitless ratios.

**Use the token, not a literal.** Until this ramp was emitted, web had no type tokens at all (the
generator defined the block and skipped it). So www hand-authored its scale and drifted to 18
distinct sizes in the 11-25px band where the system defines six. Those 18 are now consolidated onto
the ramp. A new literal `font-size` is drift by default. The detector flags it, and the correct
response is to pick a role or add a step to `tokens.json`, never to add an ignore.

| Role      | Size             | Line   | Use                                                   |
| --------- | ---------------- | ------ | ----------------------------------------------------- |
| `display` | 2.375rem (38px)  | 1.1579 | reserved; www uses fluid `clamp()` for display type   |
| `title`   | 1.5rem (24px)    | 1.25   | record title, stat tile values                        |
| `heading` | 1.1875rem (19px) | 1.2632 | section `h3`                                          |
| `body`    | 1rem (16px)      | 1.625  | prose, nav and footer links, part rows                |
| `data`    | 0.875rem (14px)  | 1.4286 | mono measurements, the hero metric line               |
| `label`   | 0.8125rem (13px) | 1.3846 | uppercase tracked labels (`+0.1em`)                   |
| `caption` | 0.8125rem (13px) | 1.3846 | captions, provenance, step detail                     |
| `micro`   | 0.75rem (12px)   | 1.3333 | chart axis text, chips, colophon terms, plate indices |

`micro` was added during the consolidation: www legitimately had six distinct sizes below 13px
(chart labels at 11px, dense chrome at 12-12.8px), and the ramp's floor was 13. Folding them all
upward would have visibly inflated the interface. The app has declined this step (its only sub-13
values are drift it intends to fix), so `micro` is web-only for now.

Two local aliases in `tokens.css` deliberately stay literals because neither lands on a ramp step:
`--font-size-body-compact` (0.95rem) and `--font-size-meta` (0.94rem), both sitting between `data`
and `body`. They are labelled as such in the file.

`clamp()` declarations are untouched by the ramp: fluid display and headline type is chosen per
viewport, not per step.

### Hierarchy

- **Display** (Serif 600, `clamp(2rem, 3.2vw, 2.375rem)`, 1.16, `-0.01em`): the hero headline and
  every page `h1`. Capped at the brand's 38/44 display step and floored at 2rem so it still fits a
  phone. Uses `text-wrap: balance` rather than a hand-tuned `ch` measure. A serif's "0" is a poor
  proxy for mixed-case width, so balancing picks the break instead.
- **Headline** (Serif 600, `clamp(1.6rem, 2.4vw, 2.2rem)`, 1.1): every section `h2`. Drops to
  `clamp(1.35rem, 8vw, 1.95rem)` under 760px.
- **Record Title** (Serif 600, `title` token = 1.5rem, 1.1): the featured record's name in the
  teardown panel, and the stat tile values. Was a hand-authored 1.35rem before the consolidation.
- **Subhead** (Serif 600, `heading` token = 1.1875rem, 1.1): section `h3`. Was 1.08rem.
- **Body** (Sans 400, `1rem`/`1.625`): landing-page prose, footer copy. Blocks cap at 48–80ch;
  read-mode pages cap the whole column at 44rem so headings and paragraphs share one measure near
  the 75-character comfort ceiling.
- **Body Compact** (Sans 400, `0.95rem`/`1.62`): read-mode pages and the denser landing blocks.
  This is a deliberate density tier, not drift. `tokens.css` labels it as such.
- **Label** (Mono 500, `0.8125rem`, `+0.1em`, uppercase, muted): phase names, colophon terms, the
  stats subhead. A label names a *different* thing from the heading near it; it is never a
  restatement.
- **Data** (Mono 400, `data` token = 0.875rem, `tabular-nums`): the hero metric line and other
  measurements read as figures. Masses use `white-space: nowrap` so a value never breaks away from
  its unit.
- **Caption** (Mono 400, `caption` token = 0.8125rem): provenance lines, the record link, step
  detail, plate part names. One step below data: these describe a record rather than measure it.
- **Micro** (`micro` token = 0.75rem): chart axis text, chips, colophon terms, plate indices, the
  schedule extract line. Chart labels were 11px hard-coded in SVG and are now on the token.
- **Meta** (Sans 400, `0.94rem`, often italic, muted): page meta lines, chart captions, the
  affiliation line, the 9R aside. Italic marks it as an editorial note about the page rather than
  part of it.
- **Metric** (Sans 600, `clamp(2.4rem, 5vw, 3.6rem)`, 0.95, `-0.02em`): the one hero figure. Set
  in *proportional* digits deliberately: `tabular-nums` gives every digit the width of a `0`,
  which reads loose at display size. Tiles below it use `1.55rem`/600 with the same treatment.

### Named Rules

**The No-Eyebrow Rule.** www carries **no eyebrows or kickers**. A mono uppercase label that only
restates the heading under it is chrome. Provenance lines sit *under* the title as captions, never
above it as kickers. (This is web-specific: the app's `eyebrow` variant stays, because there it
labels a value inside a compact tag rather than announcing a section. That is the Accent Rule
wearing different clothes, not a separate rule.)
*Mirrors assets/DESIGN.md:175 — change it there first.*

**The Mono-Is-Measurement Rule.** Mono is reserved for things that were measured or assigned: an
ID, a count, a mass, a date, a licence term. Prose is never set in mono to look technical.

## Layout

The site is a single centred column, not a grid system. `--frame-width` is 1280px and
`--content-width` 1248px; the page shell is `min(100% - 2rem, 1248px)` with `2.75rem` of vertical
padding, tightening to `min(100% - 1.25rem, …)` and `1.5rem`/`2rem` below 760px. The sticky header
and the footer are full-bleed bars whose inner content aligns to that same column.

Sections space themselves with `padding-block: 3rem` (2rem below 760px) and are divided by a 1px
hairline `border-top`. The grid gap is explicitly set to `0` so the rule falls in the middle of
the gap rather than at one edge of it. The first section in a shell drops both its rule and its
top padding. Read-mode pages tighten the section rhythm to `1.6rem`. They run many more
sections than the landing page, and 3rem would strand each clause on its own screen.

Multi-column blocks are plain CSS grid with `minmax(0, 1fr)` tracks and a single collapse point
each, chosen per block rather than from a shared breakpoint scale. The hero split (1fr/1fr,
2.5rem gap) collapses at 1000px, the method flow (3 columns, 2rem) at 900px, the motivation beats
and footer colophon at 860px, the general mobile treatment at 760px, the stats hero divider at
620px, and the footer chrome again at 480px. The activity chart is the exception. Below 44rem it
scrolls inside its own container with an edge mask rather than shrinking its labels toward
illegibility. **The page itself never scrolls sideways.**

Spacing rhythm runs on a loose rem scale rather than a strict 4/8 grid: `0.3–0.4rem` inside a
label/value pair, `0.6–0.9rem` between related rows, `1.4rem` between blocks in a panel, `2rem`
between grid columns, `2.5rem` across the hero split. Touch targets hold the 44px floor even where
the visible control is smaller: the theme toggle paints at 2.1rem and carries an invisible
centred 44×44 `::after`; footer social links are 44×44 boxes around a 1.18rem glyph.

## Elevation & Depth

**This site has no elevation.** There is not a single `box-shadow` in `www/`, and no
`backdrop-filter` either. The last one, a frosted sticky header, was removed because scrolled
body text still read through it. Depth is entirely tonal and linear: a 1px hairline, a shade of
surface, and space.

The shared brand system does reserve one floating tier (`--relab-shadow-overlay` and
`--relab-scrim`, both present in `tokens.generated.css`) for things that genuinely float: menus,
dialogs, sheets, snackbars. **Nothing on www floats, so both tokens are currently unused here.**
That is a fact worth preserving: if a future overlay needs a shadow, it uses that token and only
that token, at that one tier.

The two surface tiers (ground → card) are the brand's own neutrals. www
used to hand-author a three-step ramp of its own (cool paper → near-white → white) because the
brand vocabulary had no card tone on web; that gap closed, so the tiers point at
`--relab-brand-background` and `--relab-brand-surface` instead of reconstructing them. The third
tier went with the repoint: the brand defines a ground and a card, and nothing on the site needed
a tone above the card that the ground could not carry as an inverse. Both are opaque; the one
place that still mixes toward transparent is the teardown plate, at 82%, so the drafting grid
under it reads through.

### Named Rules

**The No-Float Rule.** Inline surfaces (cards, rows, inputs, panels) are flat: 1px hairline plus
surface fill, no shadow, ever. If something needs to look raised, it gets a border-colour change
or a 2px lift, not a shadow. The teardown plate's hover is exactly this: the frame brightens to
45% primary and the plate rises 2px. Shadow is reserved for one tier only, `shadow-overlay`, on
surfaces that genuinely float. www never reaches it.
*Mirrors assets/DESIGN.md:123 — change it there first.*

## Shapes

Corners are small and consistent, and they come from `tokens.generated.css`: **6px** for controls
(buttons, the toggle group, chips, plate frames), **8px** for cards and panels (only the blueprint
panel uses it on www), **12px** for overlays (unused here), and `9999px` for true pills (unused
here, since nothing on this site is a pill).
Radius scale *Mirrors assets/DESIGN.md:113 — change it there first.*
Nested frames step down rather than repeat: a plate figure
inside a 6px plate uses `calc(var(--radius-control) - 2px)`. The drafting callout in its corner
carries that radius on one corner only, so it reads as printed into the frame rather than stuck
onto it.

Borders are the primary structural device and they are always 1px. The recurring silhouette is a
rectangle with a hairline top rule and nothing else: motivation beats, method phases, the hero's
affiliation line, and the footer's chrome band are all the same gesture at different scales. Bars
are the one exception to sharpness: the mass-share bar is 4px tall with a 2px radius, small enough
that a square end would read as a rendering artefact.

Two textures recur, both mixed from the primary and never from a raw hex: the blueprint panel's
1.5rem drafting grid at 7% primary, and the same grid at 0.75rem and 14% inside a blank plate. So
an unphotographed part reads as an unexposed frame rather than as a hole.

## Components

### Buttons

- **Shape:** Softly squared (6px control radius), inline-flex, 1px transparent border so outline
  and filled variants share a box.
- **Primary:** Filled cyanotype blue with white label ink, flipped to near-black in dark mode,
  where the primary is a light blue. Padding `0.8rem 1.15rem`; the large hero variant holds a
  `3.35rem` minimum height (`3.1rem` on mobile).
- **Hover / Focus:** Background deepens to Prussian Deep over 160ms on the site's single easing
  curve. Focus is the global 2px solid ring at 3px offset. Press is `scale(0.98)`, deliberately at
  the threshold of perception. It is transform-only, so a press never reflows the row it sits in.
- **Outline:** Transparent fill, control-boundary border, Prussian Deep label. Hover deepens the
  border to full primary and fills with the 8% blue wash. **Never the accent.** The pair reads as
  two doors (browse / contribute) rather than two competing pitches.
- **Stacked:** Either variant can carry a second line: the label, then what it costs the visitor
  ("No account needed"). The sublabel is 0.78rem/500 at 0.78 opacity, never dimmer, because it is
  real information about what the button will ask for. Rows are baseline-aligned so both primary
  labels sit on one line across the pair. Under 760px the button row becomes a single stretched
  column.
- **Disabled:** `cursor: progress`, 0.7 opacity.
- **Reduced motion:** transitions collapse to 0.01ms and the press transform is dropped entirely.
  The background change still acknowledges the press, because a 0.01ms scale is a jump, not motion.

### Chips

- **Style:** Hairline border, 6px radius, small uppercase mono in muted ink, `0.2rem 0.55rem`
  padding. Used for the product-type tag on the featured record and the "repeats per part" marker
  on the looping method phase.
- **State:** Static. Chips on www are labels, not filters. No selected state exists.

### Cards / Containers

- **Corner Style:** 8px card radius on the one framed panel; 6px on the plates inside it.
- **Background:** The blueprint panel is transparent over the page ground with a drafting grid
  painted into it; plates are 82% raised paper over that grid, so the grid shows faintly through.
- **Shadow Strategy:** None. See Elevation & Depth.
- **Border:** 1px hairline throughout; plate frames brighten to 45% primary on hover or
  focus-visible.
- **Internal Padding:** `1.25rem` on the panel, `0.4–0.65rem` on a plate, `0.9rem` grid gap
  between panel rows.

### Inputs / Fields

www has no text inputs. The only form controls are the segmented measure toggle and the theme
toggle, documented under Navigation and Signature Component. If a field is ever added, it takes
the control radius (6px), the control-boundary border, and the global focus ring.

### Navigation

- **Header:** Sticky, opaque page-ground fill, 1px hairline bottom rule, no shadow. Wordmark on
  the left, two links (App, Docs) on the right; both rows wrap, so enlarged text at a narrow
  viewport never forces sideways scroll. Links are 0.9rem/500 in heading ink, undecorated at rest,
  turning primary and underlined on hover and focus-visible. GitHub is deliberately *not* here.
  It is a project channel and lives once, in the footer.
- **Footer:** Two bands. A research colophon set as mono uppercase terms in a 6.5rem track against
  0.875rem definitions (collapsing to one column at 860px). Then comes the site chrome under a
  hairline: copyright, policy links, contact, three brand marks, and the theme control behind a
  vertical rule. Footer links are 0.95rem/500 muted, going primary and underlined on hover/focus.
- **Brand marks:** GitHub, LinkedIn and YouTube are vendored monochrome SVGs filled with
  `currentColor` at 1.18rem inside 44×44 targets. **Never recoloured into their own brand
  palettes.**
- **Brand handoff:** On the landing page the hero's mark melts upward over the first 140px of
  scroll while the header's fades in behind it, so the brand is never on screen twice. Built on
  `animation-timeline: scroll()` with longhand properties only (the minifier folds the shorthand
  into something no browser parses). Firefox has no scroll-timeline support, so both marks stay
  visible there for the whole page. This is an accepted fallback, not a bug, and the same
  fallback applies under reduced motion.

### Stats Panel

- **Character:** A ledger, not a dashboard. One hero figure separated by a vertical hairline from
  a wrapping row of tiles, then an activity chart under a mono uppercase subhead.
- **Segmented toggle:** A single control row above what it scopes. The group carries the
  control-boundary border, 6px radius, and `overflow: hidden`. Buttons are borderless 0.78rem/500
  muted text that go heading-ink on hover and take the blue wash plus Prussian Deep ink when
  `aria-pressed="true"`. Focus insets to `-2px` because the group clips its overflow.
- **Chart:** Hand-built SVG. Grid lines and axis labels are recessive hairline and 11px mono
  tabular; bars are the data-viz blue; the peak label and tooltip panel are heading ink with print
  white text. Text never wears the data colour. The bar beside it carries identity. On first
  reveal only, bars grow from their own baseline over 300ms with a 40ms stagger capped at 240ms.
  Re-renders from the toggle paint at full height, because the toggle is a comparison control and a
  ramp would delay the comparison.

### Theme Toggle

A 2.1rem square (1.9rem below 760px) with the control-boundary border, raised-paper fill and a
0.92rem glyph, cycling system → light → dark. Hover deepens the border to full primary, matching
the outline button; an explicit light or dark choice swaps the fill to print white and the glyph to
heading ink. A 44×44 invisible `::after` carries the pointer target without inflating the visible
box.

### The Blueprint Schedule (signature component)

`HeroTeardown.astro` is the site's showpiece and the largest single concentration of design risk:
734 lines, and the only framed surface on the page. It renders a featured product teardown as an
engineering parts schedule: a document reproduced inside a document, which is what earns it the
frame everything else on the site is denied.

- **Frame:** 1px hairline, 8px card radius, no shadow, `1.25rem` padding, and a 1.5rem drafting
  grid mixed at 7% primary painted across the whole panel.
- **Record header:** Title (serif 1.35rem) and product-type chip on one row, a mono provenance
  caption under them ("Teardown №412 · live record"), and an index-print photograph of the
  assembled product in a `clamp(6rem, 18vw, 8.5rem)` track at 4:3. The print is deliberately the
  size of an index print, not a hero image. At the panel's full width, a larger image would dwarf
  the parts, which are what the page is about. When there is no photograph the second track
  disappears entirely rather than leaving a reserved gap.
- **Two layouts, chosen by the data:** if any shown part carries a photograph the schedule becomes
  a grid of plates (`repeat(auto-fill, minmax(9.5rem, 1fr))`); if none do, it stays a compact list.
  Equal-width cells are what keeps the mass bars comparable across a grid the way they were
  comparable down a list.
- **The cyanotype:** every photograph is `grayscale(1) contrast(1.06)` under a primary-hue
  `mix-blend-mode: color` layer. The blend takes hue and saturation from the tint and lightness
  from the image, so a light area prints pale blue and a dark one Prussian. That is what a
  cyanotype does. This is the whole reason a wall of inconsistent bench photographs reads as one
  schedule. `isolation: isolate` keeps the blend inside its frame. In dark mode exposure stops down
  to 0.6, the same correction a darkroom would make. So the plates read as prints on the page
  rather than as light sources on it.
- **Look-closer:** on hover or `:focus-visible` the duotone lifts to the real photograph, the frame
  brightens to 45% primary and the plate rises 2px over 240ms. `:focus-visible`, not
  `:focus-within`: clicking a disclosure would otherwise strand one colour photograph in a
  schedule of blue prints. Nothing is hidden behind the pointer, so this owes no equivalent; the
  keyboard gets it anyway.
- **Drafting callout:** a square mono tabular index number tucked into the plate's top-left corner
  with borders on two sides: the number a parts diagram writes next to a part, not a badge.
- **Mass bar:** a 4px track at 12% primary with a data-viz-blue fill sized to the part's share of
  the product's recorded mass. It animates its length in over 300ms because the length *is* the
  datum: the bar arrives as a measurement being taken. Bars wait for their own plate to land.
- **The one authored moment:** on load, plates deal themselves out of the assembly: each starts
  stacked back toward the first cell, leaning, and settles into its seat over 420ms with a 42ms
  stagger. The lean and delay both cap at index 6/10 so a twenty-part product neither flings plates
  off the panel nor takes three seconds to finish. Fill is `backwards`, never `both`: a forwards
  fill would keep re-applying the transform and swallow the hover rise.
- **Disclosure:** parts with subcomponents use native `<details>`, closed in the baked HTML so
  opening never counts as layout shift. The native marker is suppressed and replaced with a ▸/▾
  glyph. The height transition rides on `interpolate-size: allow-keywords` plus
  `::details-content` with `allow-discrete`, so older browsers keep the snap.
- **Honesty:** the panel shows the six heaviest parts and says so ("Showing the 6 heaviest of 18
  recorded parts"). A fixture instead of live data is labelled as such and carries no invented
  record number. A schedule that quietly drops two thirds of a record is the one thing this panel
  cannot afford to be.

Everything here is baked at build time and paints without JavaScript.

## Do's and Don'ts

### Do

- **Do** carry all interaction on primary blue: links, filled and outline buttons, hover, pressed,
  selected, and focus states.
- **Do** separate sections with a 1px hairline `border-top` and `padding-block`, and keep the grid
  gap at 0 so the rule lands in the middle of the space.
- **Do** set every ID, count, mass, date and measurement in IBM Plex Mono with `tabular-nums`, and
  every heading in IBM Plex Serif.
- **Do** use `--color-control-border` on any border that is the only thing identifying a control,
  and `--color-page-border` on anything that merely separates or frames content.
- **Do** derive new tints with `color-mix()` from an existing token (7% primary for a drafting
  grid, 12% for a bar track, 45% for an active frame) rather than introducing a hex.
- **Do** put a scroll-driven or load-driven animation only where it reports something real (a
  figure refreshing, a bar measuring, a schedule assembling) and always behind
  `prefers-reduced-motion: no-preference`.
- **Do** keep a 44px pointer target even where the visible control is smaller, using an invisible
  centred `::after` or a padded link box.

### Don't

- **Don't** fill a button with manila, or let the accent drive a hover, pressed or selected state.
- **Don't** put manila on anything large: bars, hero figures, tiles and headings stay ink.
- **Don't** write an eyebrow or kicker. A mono uppercase label that restates the heading beneath it
  is chrome; put provenance *under* the title as a caption instead.
- **Don't** add a `box-shadow` to an inline surface. There are none on this site, and the reserved
  `--relab-shadow-overlay` tier is for things that genuinely float. Nothing on www does.
- **Don't** reintroduce `backdrop-filter`. Blur is the last thing a document-grade brand should
  hide its chrome behind, and the frosted header was removed for exactly that reason.
- **Don't** reach for a utility framework. www styles with authored CSS in `src/styles/` plus
  per-component scoped `<style>` blocks; consistency is enforced by the generated tokens, not by
  a utility scale. Tailwind was installed here once, migrated five class attributes over three
  commits, and was then contradicted by every component built after it -- the same round trip
  docs made before removing it. Both subrepos now ship none.
- **Don't** hand-edit `src/styles/tokens.generated.css`. It is generated from `assets/tokens.json`
  by `scripts/sync_brand_assets.py`; change the source and run `just assets-sync`.
- **Don't** let a chart or table force the page to scroll sideways. Give it its own
  `overflow-x: auto` container with an edge mask, the way the activity chart does.
- **Don't** use a `ch` cap to tune a serif headline's line breaks. Use `text-wrap: balance`; a
  serif's "0" is a poor proxy for mixed-case width.
- **Don't** show the brand mark twice at once. The hero's mark and the header's are a handoff, not
  two logos.
