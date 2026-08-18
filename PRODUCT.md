# Product

Scope: this record covers the Relab product as a whole. `app/`, `www/`, and `docs/` are
surfaces of it and share this truth; per-surface strategy lives in surface briefs, not here.

## Platform

web

Native iOS and Android are configured in `app/app.json` (bundle IDs, tablet support, adaptive
icon, local-network entitlement for the Pi), but this repo's tooling does not ship them. `build`
is `expo export -p web`; E2E is Playwright against the exported web build. There is no EAS
config, signing config, store listing, or CI native job. `app/README.md` states native releases
are run from a developer machine. Web is the surface that ships, is tested, and is deployed
(Caddy, `app.cml-relab.org`). Design work targets web; native remains a live future target, so
do not design anything that would be impossible to carry to a phone build.

## Users

Staged audience, in the order the product is actually being built for:

1. **CML lab researchers and students** (now, primary). Internal, authenticated, trained. They
   perform product teardowns and record what they find.
1. **External contributors** (near term, secondary). Contributors outside the lab adding
   teardown data. Already partly anticipated in the code: public contributor profiles at
   `/users/[username]`, a `profile_visibility` preference, and email-verification gating on
   creation.
1. **Repair-café visitors** (medium term, planned expansion). Untrained, one-off, on-site.
1. **General citizen scientists** (long term, planned expansion).

Levels 3 and 4 are a stated product trajectory, not a current requirement. They are recorded
here because they change what "good" means for onboarding, empty states, terminology, and error
recovery. A trained lab user tolerates schema vocabulary that a repair-café walk-in will not.

Additional confirmed audience facts:

- **Signed-out visitors can browse.** Nothing is gated behind a splash or login wall; `/`
  redirects to `/products` and the list renders for anonymous visitors.
- **Verification gates creation.** Signed-in but unverified users see "Verify your email to
  start creating" and the create affordance is withheld.
- **A username is required to own records**, enforced at routing and at the root layout.
- **`isSuperuser` is a displayed badge in the app, not a client capability.** No superuser-gated
  behaviour exists in `app/`. Confirmed 2026-08-18: what it actually grants is access to the
  backend's `/admin` routes. The app is not, and is not planned to be, an admin surface.

**Open decision: a role model (raised 2026-08-18, nothing designed or built).** Today the only
distinctions are three booleans: `isActive`, `isVerified`, `isSuperuser`. The maintainer wants
two things that both key off the same missing concept: storage quotas that differ per user, and
non-image research-file upload restricted to lab users. Both need one answer to "what kind of
user is this", which the current booleans cannot express. `isSuperuser` means backend admin,
not "trusted contributor". Recorded here because it constrains onboarding, account UI, and
empty states across every surface. Designing any of them around a role model that does not
exist yet would be inventing product truth.

## Product Purpose

Relab is a data collection and viewing platform for a PhD at Leiden University (CML), built
around the circular economy and the 9R strategies. Users document a physical product, break it
into components, and tag those components with materials and circularity observations: "that's
one full teardown" (`WelcomeCard.tsx`). The output is a structured, citable research dataset
about how real products are constructed and how recoverable their materials are.

**Success, in the maintainer's own ordering (confirmed 2026-08-18):**

1. **PhD evidence and credibility, first.** The platform must stand up as defensible research
   infrastructure: real records, citable, legible to funders, supervisors, and peers.
1. **Outside contribution and a published dataset, second.** Both are genuine goals; neither
   outranks credibility when they conflict.

This ordering is load-bearing. Proof and provenance beat conversion: a surface that recruits
contributors at the cost of looking less like serious research infrastructure has made the
wrong trade. It also makes capture accuracy and completeness matter more than capture speed.

Declared non-goals (`docs/.../project/use-cases.md`): not a PLM system, not mass-scale
crowdsourcing, not an automated computer-vision pipeline, not an elastic cloud platform.

## Positioning

Site line: "Relab | Product data and disassembly records for the circular economy."

The mechanism a neighbouring product could not truthfully copy: teardown records captured by
people with the product physically disassembled in front of them, with a recursive
product → component → component hierarchy of unbounded depth, photographic evidence at every
node, and per-node circularity observations (recyclability, disassemblability,
remanufacturability). It is field-captured primary data, not scraped specifications or
inferred bills of materials.

**Downstream, at the point of failure.** Relab works with the people who already open products.
That vantage captures as-failed composition, wear, and recoverability that as-designed producer
specifications never record.

Sharpest available comparison, and the one to reach for: under the Open Repair Data Standard,
repair groups have logged more than 400,000 repair records. But those are event-level and
carry no component hierarchies, no masses, no geometry. Relab's contribution is exactly that
missing depth, at the component level, with standardized imagery.

**Careful with the 9R framing.** The 9R strategies motivate the project and supply its framing
and wordmark. They are *not* applied per record: the platform does not tag a record with an
R-strategy and does not recommend one. `docs/.../project/index.md` calls 9R context "rather
than anything the platform applies to a record." `www/src/components/WhyRelab.astro` carries
a comment recording a previous walk-back of exactly this claim. Do not write copy implying
records are classified, scored, or captured "against" the 9R ladder.

## Operating Context

**The capture scene.** A person at a bench with a product taken apart in front of them, hands
occupied, camera in use, working through a hierarchy one node at a time. Capture is interleaved
with physical disassembly, not done afterward from notes.

**Capture-first creation.** `/products/new` opens straight into a capture screen (photos, name,
type), optionally pushes to `/category-selection` and back, POSTs immediately, then `replace`s
to `/products/[id]` in edit mode. It uses `replace`, not `push`, because a back gesture from a
saved record must not return to a form that would create it again. `components/new` repeats the same
move one level down. Nesting is uncapped; the breadcrumb trail truncates at 12 ancestors.

**Raspberry Pi camera rig.** An optional paired capture device, enabled per user via the
`rpi_camera_enabled` preference (with it off, the Cameras destination disappears from nav
chrome entirely). Pairing uses a 6-character code shown on the Pi's setup page or an SSH
banner, plus a camera name. Pi captures can return `queued`, meaning the frame is stored on the
device but not yet uploaded. A YouTube live-streaming flow with a privacy-status selector sits
on top of the same device.

**Connectivity is not assumed.** Save mutations pause offline and fire on reconnect; the UI
swaps the spinner for "Queued — sends when online" and a banner reads "Offline — your captures
will send when you're back online."

**Screen sizes in play.** Phone layout is the base. Web at `md` (768) and `lg` (1024) adapts:
at `lg` a persistent `TopNav` app bar replaces the stack header, and detail screens swap
section chips for an outline. `useBreakpoint()` is gated on `Platform.OS === 'web'`, so native
always reads as the phone layout.

## Capabilities and Constraints

**Data model.** One entity with `role: 'product' | 'component'` and a `parentID`/`parentRole`
link. Physical properties are weight, width, height, depth, with `undefined` as the deliberate
"unset" sentinel and keys kept required so rows never silently vanish. Circularity properties
are exactly three free-text notes: Recyclability, Disassemblability, Remanufacturability.
Leave them empty when there is no useful observation yet.

**Uncertainty is first-class data, not a failure state.** The data-collection guide calls
"Likely polypropylene, unconfirmed" a perfectly good observation. It tells contributors that
if no reference-data entry fits, they should leave the field empty rather than pick the closest
match. This is a hard constraint on every surface: an empty or unconfirmed field must never
render as an error, a warning, a red state, or a completeness penalty. Designing a record as a
progress bar toward 100% would actively damage the dataset by rewarding false precision.

**Two hardware tiers, and the low one is legitimate.** A phone or tablet plus basic tools, a
scale, and a ruler is explicitly enough to contribute usefully. The Raspberry Pi rig (fixed
camera position, controlled lighting, gridded mats) only pays off once someone is documenting
products regularly and wants repeatable images across many products. No surface should present
the Pi rig as a prerequisite or make phone-only contributors feel like second-class users.

**Authentication.** Password plus OAuth, exactly two providers (Google, GitHub) with a hostname
allowlist. MFA is TOTP with single-use recovery codes; both a TOTP code and a recovery code are
burned on submit. OAuth-only accounts have no usable password, which changes whether unlinking
a social login requires one.

**Uploads.** Images only, in-app. 10 MB per image, hard. Accepted types: jpeg, png, webp, gif,
bmp. The backend rejects an upload unless filename extension, declared MIME type, and sniffed
content all agree. Uploads are sequential by design (parallel large uploads overwhelm the
server), with a 30 s timeout. The server pre-computes derivative widths 200/800/1600, sparsely.
A 404 on delete is treated as success so retries are idempotent.

**Idempotency.** Creates carry an `Idempotency-Key` minted once per draft, so an automatic
retry, a rehydrated draft, or a second Save press cannot double-create. Retries are bounded at
3 and only for non-`ApiError` failures plus HTTP 409.

**Persisted cache is default-closed.** Only `products`, `baseProduct`, `component`, `brands`,
and `productTypes` survive a reload; camera, telemetry, profile, stats, and auth queries stay
memory-only.

**CPV taxonomy.** Product and component types come from the standard EU procurement taxonomy
(CPV), shipped as a ~2 MB bundled `cpv.json` loaded once per session, code-split on web. The
in-app explanation is: "Pick the closest match — it powers filtering and the research
statistics."

**Web runtime hardening** (`app/Caddyfile`): nosniff, HSTS, `no-referrer`, COOP `same-origin`,
CORP `same-site`, `Permissions-Policy: camera=(self)`, TRACE/TRACK/CONNECT rejected. CSP still
requires `script-src 'unsafe-inline' 'unsafe-eval'` (Expo web bootstrap) and `style-src 'unsafe-inline'` (RN Web); a stricter report-only policy ships as the hardening target. Embeds
are limited to `youtube-nocookie.com`.

### Known gaps and undecided facts

Recorded so future work neither fabricates nor silently assumes them:

- **Offline queueing is web-only in practice.** `onlineManager` has no native connectivity
  listener wired yet, so a native build never reports offline and never pauses. Tracked as a
  TODO in `app/src/app/_layout.tsx`.
- **Upload quota and per-role capabilities are an OPEN DESIGN DECISION** (raised 2026-08-18).
  No per-user or per-product storage limit exists in `app/` today; only the 10 MB per-image cap.
  The maintainer's stated direction is tiered caps by role, which also gates the file-upload
  question below. Nothing is designed or built. See the note under Users before assuming any
  role model exists.
- **Non-image file upload: backend likely yes, app deliberately not yet.** The data-collection
  guide promises ENVI, HDF5, NITF, and GeoTIFF research-file uploads and the backend is believed
  to implement them; the app has no picker or code path. Confirmed 2026-08-18: if the app ever
  gains one it is to be restricted to lab users, tied to the role decision above. Do not design
  a general file-upload affordance.
- **Video is URL-only by design, not by omission.** `Product.videos` holds links added alongside
  images. Confirmed 2026-08-18: self-hosted video is deliberately deferred, roughly a year out.
  Do not design upload affordances for video.
- **`profile_visibility`:** `public`, `community`, `private`. Confirmed 2026-08-18:
  **"community" means signed-in app users.** Public is everyone including signed-out visitors;
  private is the owner only.
- **No localization.** No i18n framework or locale files; all copy is hardcoded English. Docs
  declare `en-US`.
- **Usage figures are live, not stored.** `backend/app/api/stats` serves totals (`teardowns`,
  `parts`, `mass_kg`, `images`, `users`) and `www/src/lib/landing.ts` fetches them at build
  time. So current numbers DO exist and www may display them; they are simply not committed
  anywhere. Two things that look like the same number are not: the pilot figures under Evidence
  on Hand are a bounded historical study, and the landing fixture is a fallback. Neither may be
  presented as current scale, and the three must never be conflated.
- **Three documented design goals are not shipped**, per
  `docs/src/content/docs/project/index.md`: the value-return-to-contributors loop, taxonomy
  interoperability, and per-record 9R classification. Treat all three as aspirations. Copy
  implying any of them is live is a factual error, not an overstatement. (See also the 9R
  caution under Positioning.)

## Brand Commitments

- **Name is "Relab" in all text:** copy, titles, alt text, aria-labels, metadata. **"R9lab" is
  a purely visual wordmark device** that lives only in logo artwork: never as text, never
  "R-nine-lab".
- **Never write "Reverse Engineering Lab"** in new copy or branding. IP-law concern, not a
  style preference.
- **The name, logo, and wordmark carry no licence.** Not AGPL, not Apache-2.0, not CC BY.
  Nominative use (citation, screenshots in a paper) needs no permission.
- **Direction: "Cyanotype & Manila — the colour of engineering documentation."** Runner-up
  "Verdigris & Copper" is retained as a documented fallback, still pending supervisor review
  with no resolution recorded.
- **Palette is machine-enforced.** `assets/brand.css` (web) and `assets/palette.json` (app) are
  the sources; `app/src/theme/__tests__/palette-sync.test.ts` fails if they drift.
- **Accent rule, hard: manila is a data-label colour** (R-numbers, record IDs, live/status
  pills, strategy tags). "The accent never fills a button or drives a hover/pressed state."
  Primary blue carries all interaction.
- **Type: IBM Plex superfamily** (Serif 600 display, Sans 400–600 UI, Mono 400 data) on web and
  docs. **The Expo app intentionally stays on platform system fonts:** native feel, Dynamic
  Type, zero load cost. The app adopts the scale and palette, not the typeface. Dynamic Type
  scaling is capped app-wide at 2×.
- **Form language "Flat & Sharp":** radius 6/8/12/9999 (control/card/overlay/full); inline
  surfaces flat with a 1px hairline and no shadow; one `shadow-overlay` tier for things that
  genuinely float. This explicitly replaces the retired react-native-paper/MD3 look.
- **Icons: one family, `lucide-react-native`,** at 16/20/24. Brand marks (GitHub, Google,
  YouTube, LinkedIn) are the only exception: vendored Simple Icons SVGs (CC0-1.0) rendered
  with `currentColor`, never recoloured to their own brand palette.
- **Logo:** a font-derived 9, vertically squished so it reads both as a loop and as a mirrored
  "e". The flask emblem is retired. Titillium is the promoted canonical mark.
- **Voice:** circularity framing, lab vernacular (products, components, materials, samples).

## Evidence on Hand

**Exists and is usable:**

- Brand artwork in `assets/`: logo, mark, wordmark, and OG images in light/dark SVG and PNG,
  plus `brand.css`, `palette.json`, `tokens.json`, fonts, icons, and `logo-src/`.
- App-side synced assets in `app/src/assets/images/`, including the `bg-light`/`bg-dark` auth
  photo backdrops.
- The bundled CPV taxonomy dataset, `app/src/assets/data/cpv.json`.
- A built web export at `app/dist/`.
- 26 published documentation pages under `docs/src/content/docs/`, covering the 9R framework,
  codebook, dataset, licensing, roadmap, use cases, five user guides, six architecture pages,
  and three operations pages.
- A four-layer licensing statement: platform software AGPL-3.0-or-later; API specification and
  generated client types Apache-2.0; site content CC BY 4.0; curated dataset releases CC BY
  4.0, planned.
- Terms of service and privacy policy pages on the marketing site.
- Citation metadata in `CITATION.cff`, with ORCIDs for van Lierde and Donati.
- Production URLs: `cml-relab.org`, `app.cml-relab.org`, `docs.cml-relab.org`.
- **Pilot study results** (`docs/src/content/docs/project/index.md:40-42`), the only real
  outcome numbers that exist. 78 small durable consumer
  products: 46 documented in a controlled laboratory, 32 at two workshops by 135 participants,
  mostly LCA practitioners and researchers. Produced **1,331 component records and 3,610
  images**. Laboratory records were substantially deeper than workshop ones. **These are pilot
  figures, not the size of the live dataset.** The docs are emphatic on this, and no surface
  may present them as current totals.
- **Concept DOI** `10.5281/zenodo.16637742`, version DOI `10.5281/zenodo.19703316`
  (`CITATION.cff:25,28`; mirrored into `www/src/copy/research.generated.ts:10-11`, which is
  generated from CITATION.cff by `scripts/sync_brand_assets.py` and therefore cannot drift;
  also pinned by `tests/test_project_identity.py:25`).
- **Funding:** Leiden University Starter Fund; Depack grant (Leiden University Fund);
  Sectorplan Gelden (a research infrastructure fund of the Dutch government, worth glossing
  for non-Dutch readers)
  (`www/src/copy/research.generated.ts:14`, `docs/src/components/Colophon.generated.astro:17`).
- **Contact:** `relab@cml.leidenuniv.nl` (`README.md:159`,
  `docs/src/content/docs/operations/install.md:341`,
  `docs/src/content/docs/project/dataset.md:91`).
- **Live record counts and the one real product image.** `www/src/lib/landing.ts` fetches a live
  teardown record from the API at build time, falling back to a committed fixture and never
  throwing. The counts it returns are real current data, unlike the pilot figures above. The
  record it renders is also **the only genuine product imagery in the entire estate**. There
  are no screenshots anywhere. Note that `www/src/components/BrandHero.test.ts:7` pins a
  fixture of `{teardowns: 47, parts: 1600, mass_kg: 340, images: 3610, users: 12}`; its `3610`
  collides numerically with the pilot image count and is *not* the same number.

**Does not exist. Do not fabricate:**

- **No published dataset release yet.** "No release has been published yet, so nothing is
  distributed under those terms today." Confirmed 2026-08-18: a first release is expected within
  roughly a month, so treat this as imminent rather than hypothetical. But do not write copy in
  the present tense until it lands.
- **No screenshots anywhere in the repo** as of 2026-08-18. The only images are brand marks and
  two backdrop photos. The maintainer has approved creating some, so this gap is expected to
  close; until it does, no surface may imply product imagery exists.
- **No app store listing or store metadata.** Confirmed 2026-08-18: native iOS and Android are
  not shipped to anyone and are blocked on legal review of Android and App Store permissions,
  expected to clear in roughly six months. Native is a real near-term target, not an
  abandoned one.
- **No testimonials, customers, benchmarks, pricing, or adoption figures.**
- **No accessibility conformance statement or VPAT** yet. The WCAG target under Accessibility &
  Inclusion is stated in test files, DESIGN.md, and this record. It has never been stated as a
  public commitment on any published page. Confirmed 2026-08-18: the maintainer has approved
  publishing a simple conformance statement against the WCAG 2.2 AA target. It must state the
  enforcement gap honestly rather than claim full conformance.
- **No manual keyboard or assistive-technology pass** has been run on any surface.

## Product Principles

1. **The bench beats the desk.** Capture happens with hands busy and a product in pieces.
   Anything that adds a step, a confirmation, or a mode switch between observing and recording
   costs real data.
1. **A dataset is the deliverable.** Accuracy and completeness outrank speed and delight.
   Where they conflict, protect the record: idempotent creates, offline queueing, and unset
   sentinels all exist because a lost or duplicated observation is worse than a slow one.
1. **Nothing is gated that does not need to be.** Browsing is open, creation requires a
   verified account, and ownership requires a username. Each gate earns its place; no new one
   should appear without the same justification.
1. **Vocabulary is a staged liability.** Today's users know what "amount in parent" and CPV
   mean. Tomorrow's repair-café visitor will not. Prefer terminology that survives the audience
   expansion over terminology that mirrors the schema.
1. **The accent is data, not decoration.** Manila labels facts; blue carries interaction. This
   is the single rule most likely to be violated by well-meant visual enthusiasm. It is the
   one that keeps the interface reading as engineering documentation.

## Accessibility & Inclusion

**Target: WCAG 2.2 AA**, aligned across www, docs, and app. Confirmed by the maintainer on
2026-08-18, chosen over 2.1 AA because Leiden University public surfaces are in scope for the
EU Web Accessibility Directive via EN 301 549. 2.2 is the forward-safe target.

**The target and the automated gate are different things, deliberately.** axe-core's rule
coverage for 2.2-only criteria is too sparse to gate CI on. So the automated suite continues to
tag `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` and gates on `serious` and `critical`. That is the
right engineering call and should not change. It does mean there is a real, named gap between
what is committed to and what is enforced: the 2.2-only criteria are verified by hand, not by
CI. The three that actually bite:

- **2.5.8 Target Size (Minimum)**: the RN surface most of all.
- **2.4.11 Focus Not Obscured (Minimum)**: sticky headers and the docs sidebar.
- **2.4.13 Focus Appearance**: pairs with the existing `--color-ring` work on www.

No manual keyboard or assistive-technology pass has been done on any surface. Automated
coverage is a floor, not the target.

Enforced today:

- axe runs in Playwright against the web build; CI gates on `serious` and `critical` only.
  `color-contrast` is disabled there because RN-Web rendering emits noise the app cannot fix.
  Contrast is instead verified in unit tests (`semantic-contrast.test.ts`, `palette-sync.test.ts`)
  against the committed palette, which claims 4.5:1 for every pairing in both schemes.
- `MIN_TAP_TARGET = 44`; DESIGN.md states a 44/48px touch floor and requires icon-only controls
  to keep a ≥44px hit area.
- `eslint-plugin-react-native-a11y` is blocking: `lint:react` must pass with zero warnings.
- `prefers-reduced-motion` is respected via `ReduceMotion.System` on Reanimated transitions.
- Screen-reader parity is handled explicitly, not assumed: `accessibilityLiveRegion` is
  Android-only and `aria-live` is web-only, so iOS gets an explicit
  `AccessibilityInfo.announceForAccessibility` call.
- Named criteria are honoured with inline citations in component code: 1.1.1, 1.3.1, 1.4.1,
  2.1.1, 2.4.3, 2.5.3, and 3.3.1.

Inclusion note tied to the staged audience: the app is English-only with no i18n framework. A
repair-café or citizen-science expansion makes that a real barrier, and it is currently
unplanned.
