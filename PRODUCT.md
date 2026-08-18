# Product

What Relab is, who it serves, and which facts about it are settled. This covers the product as a
whole; `app/`, `www/`, and `docs/` are surfaces of it. Per-surface strategy lives in the surface
briefs.

## Purpose

Relab is a data collection and viewing platform for a PhD at Leiden University (CML), built around
the circular economy and the 9R strategies. Users document a physical product, break it into
components, and tag those components with materials and circularity observations. The output is a
structured, citable research dataset about how real products are built and how recoverable their
materials are.

Success has an order, and it is load-bearing:

1. PhD evidence and credibility. The platform must stand up as defensible research infrastructure.
1. Outside contribution and a published dataset. Both are real goals. Neither outranks credibility
   when they conflict.

Proof beats conversion. A surface that recruits contributors at the cost of looking like serious
research infrastructure has made the wrong trade. Capture accuracy also outranks capture speed.

Non-goals, from `docs/.../project/use-cases.md`: not a PLM system, not mass-scale crowdsourcing,
not an automated computer-vision pipeline, not an elastic cloud platform.

## Platform

Web ships. `build` is `expo export -p web`, E2E runs Playwright against that export, and the
deployed surface is `app.cml-relab.org` behind Caddy.

Native iOS and Android are configured in `app/app.json` but this repo's tooling does not build or
release them. Native remains a live target, so design nothing that could not be carried to a phone
build.

## Users

The audience is staged, in build order:

1. CML lab researchers and students. Now, primary. Internal, authenticated, trained.
1. External contributors. Near term. Public profiles at `/users/[username]`, a
   `profile_visibility` preference, and email-verification gating already anticipate them.
1. Repair-café visitors. Medium term. Untrained, one-off, on-site.
1. General citizen scientists. Long term.

Levels 3 and 4 are a trajectory, not a current requirement. They are recorded because they change
what "good" means for onboarding, empty states, terminology, and error recovery. A trained lab user
tolerates schema vocabulary that a repair-café walk-in will not.

Access rules:

- Signed-out visitors can browse. `/` redirects to `/products` and the list renders anonymously.
- Verification gates creation. Unverified accounts see "Verify your email to start creating".
- A username is required to own records.
- `isSuperuser` grants the backend's `/admin` routes and nothing in the app. The app displays it as
  a badge and is not planned to become an admin surface.

Accounts carry a `role` of `contributor` (default) or `lab`, alongside the three booleans. `lab`
grants non-image research-file upload and the larger upload quota. Only a superuser assigns a role,
through `PUT /v1/admin/users/{user_id}/role`; `role` is absent from the self-service update schema.
Existing accounts were backfilled to `contributor`, so lab members are promoted by hand after
deploy. The enum stops at two values on purpose: a "viewer" is an unverified account and an "admin"
is a superuser, so more rungs would give each of those two sources of truth.

## Positioning

Site line: "Relab | Product data and disassembly records for the circular economy."

The mechanism a neighbouring product could not truthfully copy: teardown records captured by people
with the product physically disassembled in front of them. Recursive product → component hierarchy
of unbounded depth, photographic evidence at every node, and per-node circularity observations.
Field-captured primary data, not scraped specifications or inferred bills of materials.

Relab works downstream, at the point of failure, with the people who already open products. That
vantage captures as-failed composition, wear, and recoverability that as-designed producer
specifications never record.

The sharpest comparison: repair groups have logged more than 400,000 records under the Open Repair
Data Standard, but those are event-level, with no component hierarchies, no masses, no geometry.
Relab's contribution is exactly that missing depth.

**Careful with the 9R framing.** The 9R strategies motivate the project and supply its wordmark.
They are not applied per record. The platform does not tag a record with an R-strategy and does not
recommend one. Do not write copy implying records are classified, scored, or captured against the
9R ladder.

## Operating context

**The bench.** A person with a product taken apart in front of them, hands occupied, camera in use,
working through a hierarchy one node at a time. Capture is interleaved with disassembly, not done
afterward from notes.

**Capture-first creation.** `/products/new` opens straight into a capture screen, POSTs, then
`replace`s to the record in edit mode. It uses `replace` so a back gesture cannot re-submit the
form. `components/new` repeats this one level down. Nesting is uncapped; breadcrumbs truncate at 12
ancestors.

**Raspberry Pi camera rig.** An optional paired capture device, enabled per user via the
`rpi_camera_enabled` preference. Pairing uses a 6-character code plus a camera name. Pi captures can
return `queued`, meaning the frame is on the device but not yet uploaded. A YouTube live-streaming
flow sits on the same device.

**Connectivity is not assumed.** Save mutations pause offline and fire on reconnect. The UI shows
"Queued — sends when online".

**Screen sizes.** Phone layout is the base. Web adapts at `md` (768) and `lg` (1024); at `lg` a
persistent `TopNav` replaces the stack header. `useBreakpoint()` is web-only, so native always reads
as phone.

## Constraints that shape design

**Data model.** One entity with `role: 'product' | 'component'` and a parent link. Physical
properties are weight, width, height, depth, with `undefined` as the deliberate "unset" sentinel.
Circularity properties are exactly three free-text notes: Recyclability, Disassemblability,
Remanufacturability.

**Uncertainty is data, not failure.** "Likely polypropylene, unconfirmed" is a good observation, and
contributors are told to leave a field empty rather than pick the closest wrong match. So an empty
or unconfirmed field must never render as an error, a warning, a red state, or a completeness
penalty. A record shown as a progress bar toward 100% would reward false precision and damage the
dataset.

**Two hardware tiers, and the low one is legitimate.** A phone or tablet plus a scale and a ruler is
enough to contribute usefully. The Pi rig only pays off for repeatable imagery across many products.
No surface may present it as a prerequisite.

**Uploads.** Images only in-app: jpeg, png, webp, gif, bmp, 10 MB hard cap each. The backend rejects
an upload unless extension, declared MIME type, and sniffed content agree. Uploads are sequential by
design. Quotas are tiered by role (contributor 1,000 files / 1 GB; lab 20,000 files / 20 GB) and
`/users/me` reports limits and usage. There is no per-product limit.

**Idempotency.** Creates carry an `Idempotency-Key` minted once per draft, so a retry, a rehydrated
draft, or a second Save press cannot double-create.

**CPV taxonomy.** Product and component types come from the EU procurement taxonomy, shipped as a
~2 MB bundled `cpv.json` loaded once per session.

**Auth.** Password plus exactly two OAuth providers (Google, GitHub). MFA is TOTP with single-use
recovery codes. OAuth-only accounts have no usable password, which changes whether unlinking a
social login requires one.

Runtime hardening lives in `app/Caddyfile`; the security baseline lives in
[.github/SECURITY.md](.github/SECURITY.md).

## Deliberately absent

Recorded so nobody assumes them into existence:

- **Video is URL-only.** `Product.videos` holds links. Self-hosted video is deferred, roughly a year
  out. Do not design upload affordances for it.
- **Non-image file upload is lab-only**, in a "Research files" block in the Media section, edit mode
  only, base product only. No general-purpose upload affordance exists outside it.
- **Offline queueing is web-only in practice.** `onlineManager` has no native connectivity listener
  yet, so a native build never pauses. Tracked as a TODO in `app/src/app/_layout.tsx`.
- **No localization.** All copy is hardcoded English. This becomes a real barrier at the repair-café
  stage and is currently unplanned.
- **Three documented design goals are not shipped:** the value-return-to-contributors loop, taxonomy
  interoperability, and per-record 9R classification. Copy implying any of them is live is a factual
  error.
- **No published dataset release, no screenshots, no app store listing, no testimonials, benchmarks,
  pricing, or adoption figures.** A first dataset release and the first screenshots are expected
  soon; write about them in the present tense only once they land.

**Three numbers that look alike and are not.** The pilot study produced 1,331 component records and
3,610 images from 78 products (`docs/src/content/docs/project/index.md`); those are historical, not
the live dataset. `www/src/lib/landing.ts` fetches live totals from `backend/app/api/stats` at build
time; those are current. `www/src/components/BrandHero.test.ts` pins a fallback fixture whose 3610
collides with the pilot image count by coincidence. Never conflate them.

## Brand commitments

- **The name is "Relab" in all text:** copy, titles, alt text, aria-labels, metadata. "R9lab" is a
  visual wordmark device that lives only in logo artwork. Never as text, never "R-nine-lab".
- **Never write "Reverse Engineering Lab".** This is an IP-law concern, not a style preference.
- **The name, logo, and wordmark carry no licence.** Nominative use needs no permission.
- **Direction: "Cyanotype & Manila — the colour of engineering documentation."** "Verdigris &
  Copper" is the documented fallback, still pending supervisor review.
- **The accent is data, not decoration.** Manila labels facts: R-numbers, record IDs, status pills.
  It never fills a button and never drives a hover or pressed state. Primary blue carries all
  interaction. This is the rule most likely to be violated by visual enthusiasm, and the one that
  keeps the interface reading as engineering documentation.
- **Palette is machine-enforced.** `assets/brand.css` and `assets/palette.json` are the sources;
  `app/src/theme/__tests__/palette-sync.test.ts` fails if they drift.
- **Type: IBM Plex superfamily** on web and docs. The Expo app stays on platform system fonts for
  native feel and Dynamic Type, capped at 2×. It adopts the scale and palette, not the typeface.
- **Form language "Flat & Sharp":** radius 6/8/12/9999, inline surfaces flat with a 1px hairline,
  one `shadow-overlay` tier for things that genuinely float.
- **Icons: `lucide-react-native` at 16/20/24.** Brand marks are vendored Simple Icons SVGs rendered
  with `currentColor`, never recoloured to their own palette.
- **Voice:** circularity framing, lab vernacular (products, components, materials, samples).

## Principles

1. **The bench beats the desk.** Any step, confirmation, or mode switch between observing and
   recording costs real data.
1. **The dataset is the deliverable.** Accuracy outranks speed and delight. Idempotent creates,
   offline queueing, and unset sentinels all exist because a lost or duplicated observation is worse
   than a slow one.
1. **Nothing is gated that does not need to be.** Each existing gate earns its place. No new one
   should appear without the same justification.
1. **Vocabulary is a staged liability.** Prefer terminology that survives the audience expansion
   over terminology that mirrors the schema.

## Accessibility

**Target: WCAG 2.2 AA** across www, docs, and app. Chosen over 2.1 AA because Leiden University
public surfaces fall under the EU Web Accessibility Directive via EN 301 549.

All three surfaces tag `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`/`wcag22a`/`wcag22aa`; www and docs
fail on any violation, the app filters to `serious` and `critical` (RN-Web emits minor/moderate
noise it cannot fix). axe-core 4.12 ships exactly one 2.2-only rule, `target-size` (2.5.8), and it
is now enforced — it passes on www, docs, and the app's products and detail screens, backing up
`MIN_TAP_TARGET = 44`.

A named gap remains, narrower than before: **2.4.11 Focus Not Obscured** (sticky headers, the docs
sidebar) and **2.4.13 Focus Appearance** (pairs with `--color-ring` on www) have no axe rule at all
and are verified by hand.

Enforced today:

- axe in Playwright against the web build, gating on `serious` and `critical`. `color-contrast` is
  disabled there because RN-Web emits noise the app cannot fix; contrast is verified instead in
  `semantic-contrast.test.ts` and `palette-sync.test.ts` against the committed palette.
- `MIN_TAP_TARGET = 44`, with icon-only controls keeping a ≥44px hit area.
- `eslint-plugin-react-native-a11y` blocks: `lint:react` must pass with zero warnings.
- `prefers-reduced-motion` via `ReduceMotion.System` on Reanimated transitions.
- Screen-reader parity handled explicitly: `accessibilityLiveRegion` is Android-only and `aria-live`
  is web-only, so iOS gets an `AccessibilityInfo.announceForAccessibility` call.

No manual keyboard or assistive-technology pass has been run on any surface. Automated coverage is a
floor.

The public statement lives at `www/src/pages/accessibility.astro` (copy in
`src/copy/accessibility-content.ts`), linked from the site footer. It claims partial conformance and
names what is untested, which is the honest shape and the one the Web Accessibility Directive asks
for.

That page is the user-facing half only. The compliant artifact under the Dutch implementation
(Tijdelijk besluit digitale toegankelijkheid overheid) is a register entry per domain, filed through
the invulassistent at toegankelijkheidsverklaring.nl and signed by someone who can bind the
university. **Open, and not the maintainer's alone to close:** ask Leiden's accessibility
coordinator whether `cml-relab.org`, `app.cml-relab.org`, and `docs.cml-relab.org` are covered by an
existing entry or need their own. A second statement that contradicts the university's is worse than
none, so the page deliberately omits a feedback response window and an escalation body until that
answer lands. The decree's own baseline is WCAG 2.1 AA, so the 2.2 target clears it with room.
