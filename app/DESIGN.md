---
name: Relab App
description: Field data-collection app for circular-economy product teardowns — the colour of engineering documentation.
colors:
  background: '#FAFBFE'
  foreground: '#16202E'
  card: '#F0F3FA'
  primary: '#1F4C96'
  primary-foreground: '#FFFFFF'
  secondary: '#565E71'
  muted: '#E0E2EC'
  muted-foreground: '#44474F'
  manila: '#8F6212'
  manila-foreground: '#FFFFFF'
  destructive: '#BA1A1A'
  border: '#C4C6D0'
  input: '#74777F'
  ring: '#1F4C96'
  status-success: '#2E7D32'
  status-warning: '#A05A00'
  status-info: '#1565C0'
  status-offline: '#5A6675'
  status-live: '#8F6212'
typography:
  display:
    fontFamily: system-ui
    fontSize: 38px
    lineHeight: 44px
  title:
    fontFamily: system-ui
    fontSize: 24px
    lineHeight: 30px
  heading:
    fontFamily: system-ui
    fontSize: 19px
    lineHeight: 24px
  body:
    fontFamily: system-ui
    fontSize: 16px
    lineHeight: 26px
  label:
    fontFamily: system-ui
    fontSize: 13px
    lineHeight: 18px
    letterSpacing: 1.3px
  caption:
    fontFamily: system-ui
    fontSize: 13px
    lineHeight: 18px
  data:
    fontFamily: Menlo, monospace
    fontSize: 14px
    lineHeight: 20px
  eyebrow:
    fontFamily: system-ui
    fontSize: 13px
    lineHeight: 18px
    letterSpacing: 1.3px
rounded:
  control: 6px
  card: 8px
  overlay: 12px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.control}'
    height: 44px
  button-outline:
    textColor: '{colors.primary}'
    rounded: '{rounded.control}'
    height: 44px
  button-destructive:
    backgroundColor: '{colors.destructive}'
    textColor: '#FFFFFF'
    rounded: '{rounded.control}'
    height: 44px
  chip:
    backgroundColor: '{colors.card}'
    textColor: '{colors.primary}'
    rounded: '{rounded.control}'
    height: 44px
  input:
    textColor: '{colors.foreground}'
    rounded: '{rounded.control}'
    height: 44px
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.card}'
  status-pill:
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    height: 24px
---

# Design System: Relab App

## Overview

**Creative North Star: "Cyanotype & Manila — the colour of engineering documentation"**

*Mirrors assets/DESIGN.md:8 — change it there first.*

The app is a field instrument. Its user is at a bench with a product in pieces, hands occupied.
Prussian blue carries every action; manila marks the data. Surfaces are flat, edges are sharp,
and nothing floats unless it floats above something else. Where expressive and legible conflict,
legible wins.

The app diverges from www and docs in two ways, each a rule below: it stays on **platform system
fonts** instead of IBM Plex, and it keeps the **eyebrow** type variant.

**Key Characteristics:**

- Flat base, exactly one floating tier; no ambient shadow anywhere else.
- Blue is interaction, manila is data. The two never trade jobs.
- 44px touch floor, monospace with tabular figures for every measurement.
- Every token is a scheme-aware pair.
- Motion is functional and always honours `prefers-reduced-motion`.

### Why brand rules are restated here rather than referenced

`assets/DESIGN.md` is the estate-wide brand source. The five brand rules are restated here in
full so that someone building a screen reads them. Each copy carries a
`Mirrors assets/DESIGN.md:NN` marker; `rg "Mirrors assets/DESIGN.md"` lists every copy. Change a
mirrored rule in `assets/DESIGN.md` first, then update its copies. Do not consolidate them back
into references.

## Colors

A cyanotype palette: Prussian blue against near-white paper, with one manila accent reserved for
data. Both schemes are generated from `assets/palette.json` into `src/theme/palette.generated.ts`
and verified by `src/theme/__tests__/palette-sync.test.ts`. Do not hand-edit either.

### Primary

- **Prussian Blue** (`#1F4C96` light / `#8FB8FF` dark): Every interactive element. Buttons,
  links, focus rings, active navigation, selected state. If a thing responds to touch, it is
  blue.

### Secondary

- **Slate** (`#565E71` / `#BEC6DC`): Supporting chrome and secondary labels where full
  foreground weight would over-emphasise.

### Tertiary

- **Manila** (`#8F6212` / `#E3B95C`): Data labels only — R-numbers, record IDs, live and status
  pills, strategy tags. Never an interaction colour.

### Neutral

- **Paper** (`#FAFBFE` / `#11141D`): Page background.
- **Ink** (`#16202E` / `#E2E6EE`): Primary text.
- **Card** (`#F0F3FA` / `#1A2030`): Cards, panels, list rows. Reached in code as `bg-card`.
- **Muted Ink** (`#44474F` / `#C4C6D0`): Secondary text; meets 4.5:1 on paper in both schemes.
- **Hairline** (`#C4C6D0` / `#44474F`): The canonical border. Dividers, card edges, input
  strokes.

### Status

Scheme-aware pairs in `src/theme/tokens.ts`: success `#2E7D32`/`#7BC67E`, warning
`#A05A00`/`#FFB74D`, danger = destructive, info `#1565C0`/`#90CAF9`, offline `#5A6675`/`#9E9E9E`,
live = manila.

### Named Rules

**The Data-Label Rule.** The manila accent is a **data-label colour** — R-numbers, record IDs,
small data labels, live/status pills, strategy tags. **Accent is for small text, never for
mass.** It never fills a button, never drives a hover or pressed state, and never paints bars,
big figures, or large areas. Interaction is always primary blue. *Mirrors
assets/DESIGN.md:167-184 — change it there first.*

**The One Tint Rule.** `tokens.surface.accent` (primary at 12%) is the single selected/tinted
fill: chips, history rows, toggles, active nav. The Tailwind spelling is `bg-primary/12`.
`bg-primary/10` is a bug.

**The Primary-Strong Rule.** Pressed and hover states on filled controls use the `primary-strong`
shade (`#143567` light / `#BAD3FF` dark), not alpha on the primary. In Tailwind:
`active:bg-primary-strong` / `hover:bg-primary-strong`. In dark mode `primary-strong` is
*lighter* than `primary` (#BAD3FF over #8FB8FF).

`assets/brand.css` and `assets/palette.json` are reconciled by the `BRAND_PARITY` table in
`scripts/sync_brand_assets.py`; `just assets-check` fails if `primaryStrong` drifts between them.

## Typography

**Display / UI Font:** platform system font (San Francisco on iOS, Roboto on Android, system UI
stack on web)
**Data / Label Font:** platform monospace (Menlo on iOS, `monospace` elsewhere), with
`font-variant: tabular-nums`

**Character:** Neutral and native. The app borrows the scale and palette of the brand's IBM Plex
system without shipping the typeface.

### Hierarchy

- **Display** (38/44): The one big number or name on a screen. Profile hero, account identity.
- **Title** (24/30): Screen and section titles.
- **Heading** (19/24): Subsection headers, card titles.
- **Body** (16/26): Prose, descriptions, form values. Selectable by default.
- **Label** (13/18, +1.3 tracking): Field labels and dense chrome.
- **Caption** (13/18): Helper text, timestamps, secondary annotations.
- **Data** (14/20, monospace, tabular figures): Every measurement, ID, count, and code. If it is
  a number the user might compare to another number, it is `data`.
- **Eyebrow** (13/18, +1.3 tracking, uppercase, muted ink): Labels a **value inside a compact
  tag**.

### Named Rules

**The System-Font Rule.** The app stays on platform system fonts (native feel, Dynamic Type
support, zero load cost). It adopts the brand's scale and palette, not its typeface. www and docs
use IBM Plex; do not "unify" this. *Mirrors assets/DESIGN.md:33-35 — change it there first.*

Dynamic Type is capped at 2x on **every** text primitive: both `AppText` and `ui/text` apply the
cap by default. `ui/text` renders every button label plus HeroStats, ComponentRow, GoLiveDialog
and ProductDelete.

**The Eyebrow-Is-A-Datum Rule.** `eyebrow` labels a **value inside a compact tag**. It is not a
kicker above a heading; www and docs carry none. *Mirrors assets/DESIGN.md:169-173 —
change it there first.*

**The Ramp Rule.** Every text size comes from the eight variants above. An inline `fontSize:`
is a defect unless it carries a comment naming the reason no ramp step fits.

## Layout

`PageContainer` is the scaffold: a max-width column with gutters that widen at `md` (768) and
`lg` (1024), plus `fullBleed` and `phoneFullBleed` escape hatches for galleries and hero media.

Breakpoints are web-only: `useBreakpoint()` gates `isMd`/`isLg` on `Platform.OS === 'web'`, so a
native tablet reads as phone-tier.

The chrome swap at `lg` is the one structural change: the persistent `TopNav` app bar appears and
the stack header hides, never both. Below `lg`, stack headers plus the bottom tab bar. Detail
screens render the same nav item component in a horizontal chip row on phone and a 200px outline
column at `lg`.

Spacing rhythm is 4/8/16 with an 8px minimum gap.

## Elevation & Depth

**Flat base, one floating tier.** Inline surfaces (cards, rows, inputs, chips) are flat: a 1px
hairline border plus a `card` fill, **no shadow**. Shadow is reserved for surfaces that float
above the page.

### Shadow Vocabulary

- **`shadow-overlay`** (light `0 8px 24px rgba(20,40,80,.16)`, dark `0 8px 24px rgba(0,0,0,.55)`):
  Menus, dialogs, bottom sheets, the FAB, toasts. This is the only shadow in the system.

`src/theme/tokens.ts` reads this from `designTokens.rn.shadowOverlay[scheme]`, the RN-shaped
variant the generator emits next to the CSS string. Never re-declare the values in the app. The
Android `elevation` is a scheme pair (8 light / 12 dark).

### Named Rules

**The Inverse-Pair Rule.** `inverseSurface` may only carry `inverseOnSurface` (primary text) and
`tokens.text.inverseMuted` (secondary). Both inks assume an inverted backdrop; on a same-polarity
surface the text disappears. Take the ground and both inks together from `useInverseSurface()`
(`src/theme/inverseSurface.ts`). Tooltips, toasts and the live-stream banner use it. On the
current palette the pair gives 10.5:1 dark / 11.8:1 light for primary ink and 5.4:1 / 5.8:1 for
muted.

**The One Tier Rule.** There is exactly one shadow. Inline surfaces get a hairline and no
shadow; floating surfaces get `shadow-overlay`. A second elevation tier, a coloured glow, or a
shadow stacked on an already-floating element is a defect. *Mirrors
assets/DESIGN.md:119-127 — change it there first.*

## Shapes

Flat and sharp. This replaces the MD3/Paper era of pill buttons, ambient shadows, and oversized
radii.

| Token            | Value  | Use                                        |
| ---------------- | ------ | ------------------------------------------ |
| `radius.control` | 6px    | Buttons, inputs, chips, segmented controls |
| `radius.card`    | 8px    | Cards, panels, list rows                   |
| `radius.overlay` | 12px   | Dialogs, bottom sheets, menus, FAB         |
| `radius.full`    | 9999px | Avatars and **true pills only**            |

All four map through `src/constants.ts:41`. Use the token, never a literal.

### Named Rules

**The True-Pill Rule.** `radius.full` is for avatars and genuine pills only. A 44×44 icon button
with `rounded-full` is not a pill. *Mirrors assets/DESIGN.md:111-114 —
change it there first.*

## Components

### Buttons

- **Shape:** Gently squared (6px, `radius.control`), 44px minimum height.
- **Primary:** Solid Prussian blue, white text. Pressed: `active:bg-primary/90`.
- **Outline / Ghost / Tonal:** Blue ink, transparent or 12% tinted fill, hairline border on
  outline.
- **Destructive:** Solid `#BA1A1A`, white text. Never the keyboard default in a dialog.
- **Loading:** Inline spinner tinted to the variant's foreground; the label stays.

### Chips

- **Style:** Two segments — a title segment in blue on `card`, and a value segment on solid
  primary with white ink. 6px radius, 44px minimum height.
- **Error:** Danger-tinted fill **plus** a border **plus** an alert icon **plus** ", required"
  composed into the accessible name. Never colour alone.

### Cards / Containers

- **Corner:** 8px (`radius.card`).
- **Background:** `card`. **Border:** 1px hairline. **Shadow:** none, ever.

### Inputs / Fields

- **Style:** Borderless by default on a `card` fill; bordered variant available. 6px radius,
  44px minimum height.
- **Error:** Message rendered by `FormField` with a `nativeID` linked via
  `accessibilityLabelledBy`, so the error is programmatically associated, not merely adjacent.

### Navigation

- **Below `lg`:** stack header plus custom bottom tab bar.
- **At `lg` (web):** persistent `TopNav`, stack header hidden.
- **Items:** `min-h-11`, active `bg-primary/12` with blue ink, inactive at 70% opacity, web
  `focus-visible:ring-2`.

### Focus indicators

Every interactive control takes `WEB_FOCUS_RING` from `src/constants.ts`:
`focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring` — a 2px Prussian-blue outline, 2px clear of the control.

### Named Rules

**The Painted-Focus Rule.** Every control carries a base-layer reset (`shadow-none`,
`outline-none`) that silently disarms the usual focus mechanisms: a Tailwind ring compiles to a
box-shadow that `shadow-none` flattens, and `outline-2` compiles to
`outline-style: var(--tw-outline-style)`, which `outline-none` sets to `none`. The width and
colour compute and nothing appears.

So the indicator is an explicit `outline` plus `outline-solid`. **Never assert a focus indicator
by its utility class.** Assert the computed result, `outlineStyle !== 'none'` while
`:focus-visible` matches; `app/e2e/accessibility.spec.ts` does this. Never add a focus style
without measuring it in a browser.

### Status Pill

24px tall, `radius.control`, `label` type. Solid or soft variant. The **live** pill is the one
sanctioned manila fill in the app.

### Signature: the Spec Row

Monospace value, manila eyebrow label, hairline separator. This is the app's most characteristic
pattern.

## Do's and Don'ts

### Do

- **Do** use `tokens.surface.accent` (or `bg-primary/12`) for every selected or tinted fill.
- **Do** use the `data` variant for every measurement, ID, count, and code.
- **Do** pair every colour-carried meaning with a second signal: an icon, a border, or text.
- **Do** apply `MIN_TAP_TARGET` (44) to every interactive control, including icon-only ones.
- **Do** pass `ReduceMotion.System` on every Reanimated animation.
- **Do** keep entrance motion in the 150–300ms band, with exits shorter.
- **Do** comment any departure from a token, naming what it departs from.

### Don't

- **Don't** paint manila on anything large: no bars, no big figures, no glows, no banners.
- **Don't** use manila or any accent for hover, pressed, focus, or selection. Interaction is
  blue.
- **Don't** add a second shadow tier, a coloured glow, or a shadow on an inline surface.
- **Don't** use `rounded-full` on anything that isn't an avatar or a true pill.
- **Don't** introduce an inline `fontSize:` without a comment explaining why no ramp step fits.
- **Don't** reintroduce MD3 `*Container` roles (`errorContainer`, `primaryContainer`, …) or the
  tonal `elevation.level*` surfaces. They were Paper-era residue and are gone from the theme;
  `tokens.surface.accent` is the tinted fill.
- **Don't** pair `inverseOnSurface` or `inverseMuted` with anything except `inverseSurface`;
  take all three from `useInverseSurface()`.
- **Don't** render an empty or unconfirmed field as an error, a warning, a red state, or a
  completeness penalty. Uncertainty is research data. **Never add a completeness meter or a
  progress-to-100% bar**: it rewards false precision and damages the dataset.
- **Don't** reintroduce react-native-paper, or add a new icon family alongside
  `lucide-react-native`.
