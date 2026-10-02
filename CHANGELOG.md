# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-10-02

**Upgrading from 0.3:** deploy hosts now pull published images, and the landing page and docs
move to Cloudflare Workers. Superusers need MFA before upgrading. The self-host guide and
`infra/cloudflare/README.md` list the steps.

Every release now goes to staging first and reaches production after review. Users can delete
their account, export their products, and see a product's bill of materials.

### Added

- Delete your own account ([#336], [#339])
- Export products as CSV or JSON ([#349])
- See a product's bill of materials and which of its fields are still missing ([#347], [#358])
- Embed the app, docs and website in other pages ([#360])
- Product type links and superuser moderation ([#340])

### Changed

- **Breaking:** Deploy hosts pull published, signed images instead of building them, chosen
  by `IMAGE_TAG` in the root `.env` ([#362], [#370], [#372])
- The landing page and docs run on Cloudflare Workers, and production deploys wait for review
  after staging ([#364], [#369])
- Editing an outdated copy of a product is refused, and the page shows who edited it last ([#363])
- Photos upload at full resolution, with higher upload limits per role ([#335], [#348])
- Faster uploads and API startup ([#329], [#381])

### Removed

- **Breaking:** The landing page and docs container images ([#364])

### Fixed

- Product editing: saving with no changes, Cmd/Ctrl+S, and the type label ([#358], [#380],
  [#381])
- Clearer errors with a retry button when a list fails to load ([#381])
- Keyboard focus and screen headings, camera pairing, and the MFA screen ([#381])
- Account deletion, upload quotas and thumbnails ([#353], [#381])
- Backups and deploys recover from failed steps ([#274], [#276], [#367], [#381])

### Security

- **Breaking:** Superuser powers require a session that passed MFA ([#342], [#372])
- Rate limits on every write route and per signed-in user ([#334], [#372])
- Photo metadata, such as location, is removed from every upload ([#346], [#372])
- Registration and sign-in leak less, and each service gets only the secrets it needs
  ([#376], [#381])

[#274]: https://github.com/CMLPlatform/relab/pull/274
[#276]: https://github.com/CMLPlatform/relab/pull/276
[#329]: https://github.com/CMLPlatform/relab/pull/329
[#334]: https://github.com/CMLPlatform/relab/pull/334
[#335]: https://github.com/CMLPlatform/relab/pull/335
[#336]: https://github.com/CMLPlatform/relab/pull/336
[#339]: https://github.com/CMLPlatform/relab/pull/339
[#340]: https://github.com/CMLPlatform/relab/pull/340
[#342]: https://github.com/CMLPlatform/relab/pull/342
[#346]: https://github.com/CMLPlatform/relab/pull/346
[#347]: https://github.com/CMLPlatform/relab/pull/347
[#348]: https://github.com/CMLPlatform/relab/pull/348
[#349]: https://github.com/CMLPlatform/relab/pull/349
[#353]: https://github.com/CMLPlatform/relab/pull/353
[#358]: https://github.com/CMLPlatform/relab/pull/358
[#360]: https://github.com/CMLPlatform/relab/pull/360
[#362]: https://github.com/CMLPlatform/relab/pull/362
[#363]: https://github.com/CMLPlatform/relab/pull/363
[#364]: https://github.com/CMLPlatform/relab/pull/364
[#367]: https://github.com/CMLPlatform/relab/pull/367
[#369]: https://github.com/CMLPlatform/relab/pull/369
[#370]: https://github.com/CMLPlatform/relab/pull/370
[#372]: https://github.com/CMLPlatform/relab/pull/372
[#376]: https://github.com/CMLPlatform/relab/pull/376
[#380]: https://github.com/CMLPlatform/relab/pull/380
[#381]: https://github.com/CMLPlatform/relab/pull/381

## [0.3.2] - 2026-09-10

A consolidation release after the production cutover. It repairs the interface and
deployment faults that the first weeks of real use surfaced, cuts upload and page-load
latency, and makes the release and backup paths fail loudly instead of quietly.

### Added

- A "?" overlay lists the app's keyboard shortcuts ([#219])
- The lightbox serves a 2560px tier, and product lists serve real thumbnails rather than
  full-size originals ([#268], [#222])
- A theme-adaptive favicon on web ([#208])
- Deploys run as a dedicated user over a restricted key, with a no-cache rebuild
  available when one is needed ([#201], [#203], [#204], [#210])

### Changed

- Uploads answer before the wide thumbnails are derived, and transactional email no
  longer blocks the response ([#239])
- The web export has a first-load JavaScript budget, checked on every run ([#243])
- Smaller runtime images and build contexts, with Metro cached across builds ([#224],
  [#228], [#236])
- A k6 baseline and an upload benchmark across a spread of photo sizes ([#237], [#241])

- CORS preflights carry the staging edge key and pass the edge's bot protections
  ([#206], [#214], [#216])
- E2E runs never reuse a leftover preview server ([#227], [#229])
- CodeQL suppressions use the comment form it honors ([#251])

### Fixed

- Two concurrent edits to the same product no longer lose one of the saves ([#264])
- Deleting a product that has components succeeds ([#217])
- Product detail returns to the list it was opened from ([#209])
- Registration failure, search, support-contact, and accessibility copy say what is
  actually true ([#207], [#218])
- One `h1` per page, labels on the last unlabelled controls, and a focus ring that no
  longer outlines the whole page column, each held in place by a lint rule ([#223],
  [#225], [#226], [#233])
- Photographs stay out of Smart Invert ([#230])
- Web layout regressions found after the cutover ([#200], [#221], [#247])
- The migration that moves `pg_trgm` stops cleanly when a superuser owns the extension
  ([#215])
- Background work after an upload runs on the paths it was meant to ([#261])
- Backups guard the uploads volume against silent data loss and rebuild before stamping
  ([#269], [#271])
- Deploy and release failures are loud: an unreadable `.env`, timers rendered as root,
  and compose run by hand under the wrong stack identity ([#199], [#238], [#246],
  [#249], [#260])
- The backup watchdog parses restic's Z-suffixed timestamps on the system Python, and
  says why a git probe failed instead of only that it did ([#272])

### Security

- Addresses stay out of the logs, and the edge exemption for automated runs is narrowed
  to the hosts and routes that need it ([#262])
- The tunnel container drops its capabilities ([#254])
- The app serves a Content-Security-Policy header ([#202])
- Cloudflare applies are gated on the plan they apply ([#257])

[#199]: https://github.com/CMLPlatform/relab/pull/199
[#200]: https://github.com/CMLPlatform/relab/pull/200
[#201]: https://github.com/CMLPlatform/relab/pull/201
[#202]: https://github.com/CMLPlatform/relab/pull/202
[#203]: https://github.com/CMLPlatform/relab/pull/203
[#204]: https://github.com/CMLPlatform/relab/pull/204
[#206]: https://github.com/CMLPlatform/relab/pull/206
[#207]: https://github.com/CMLPlatform/relab/pull/207
[#208]: https://github.com/CMLPlatform/relab/pull/208
[#209]: https://github.com/CMLPlatform/relab/pull/209
[#210]: https://github.com/CMLPlatform/relab/pull/210
[#214]: https://github.com/CMLPlatform/relab/pull/214
[#215]: https://github.com/CMLPlatform/relab/pull/215
[#216]: https://github.com/CMLPlatform/relab/pull/216
[#217]: https://github.com/CMLPlatform/relab/pull/217
[#218]: https://github.com/CMLPlatform/relab/pull/218
[#219]: https://github.com/CMLPlatform/relab/pull/219
[#221]: https://github.com/CMLPlatform/relab/pull/221
[#222]: https://github.com/CMLPlatform/relab/pull/222
[#223]: https://github.com/CMLPlatform/relab/pull/223
[#224]: https://github.com/CMLPlatform/relab/pull/224
[#225]: https://github.com/CMLPlatform/relab/pull/225
[#226]: https://github.com/CMLPlatform/relab/pull/226
[#227]: https://github.com/CMLPlatform/relab/pull/227
[#228]: https://github.com/CMLPlatform/relab/pull/228
[#229]: https://github.com/CMLPlatform/relab/pull/229
[#230]: https://github.com/CMLPlatform/relab/pull/230
[#233]: https://github.com/CMLPlatform/relab/pull/233
[#236]: https://github.com/CMLPlatform/relab/pull/236
[#237]: https://github.com/CMLPlatform/relab/pull/237
[#238]: https://github.com/CMLPlatform/relab/pull/238
[#239]: https://github.com/CMLPlatform/relab/pull/239
[#241]: https://github.com/CMLPlatform/relab/pull/241
[#243]: https://github.com/CMLPlatform/relab/pull/243
[#246]: https://github.com/CMLPlatform/relab/pull/246
[#247]: https://github.com/CMLPlatform/relab/pull/247
[#249]: https://github.com/CMLPlatform/relab/pull/249
[#251]: https://github.com/CMLPlatform/relab/pull/251
[#254]: https://github.com/CMLPlatform/relab/pull/254
[#257]: https://github.com/CMLPlatform/relab/pull/257
[#260]: https://github.com/CMLPlatform/relab/pull/260
[#261]: https://github.com/CMLPlatform/relab/pull/261
[#262]: https://github.com/CMLPlatform/relab/pull/262
[#264]: https://github.com/CMLPlatform/relab/pull/264
[#268]: https://github.com/CMLPlatform/relab/pull/268
[#269]: https://github.com/CMLPlatform/relab/pull/269
[#271]: https://github.com/CMLPlatform/relab/pull/271
[#272]: https://github.com/CMLPlatform/relab/pull/272

## [0.3.1] - 2026-09-08

A maintenance release. It carries the toolchain forward, closes one interface bug that
crashed on device, repairs two production provisioning faults, and puts the workflow
files under static analysis.

### Changed

- Jest 30, pnpm 12, AsyncStorage 3, and React Native Testing Library 14
- Refreshed container images, the Cloudflare Terraform provider, and the lockfiles
- Held Babel and TypeScript at the majors their toolchains still support
- Declared the licence in package metadata and added CODEOWNERS
- Corrected the production cutover runbook against the live host

### Fixed

- A button with an interpolated label, such as the cameras "Select all (2)" control, no
  longer crashes, and the label renders as one `Text` node instead of three gapped ones
- Provisioning hands only tables and sequences to the migrator role, so migrations that
  drop an enum type no longer fail mid-chain
- Stored files report their size, so the upload-size backfill fills the byte ledger
  instead of logging an error per row
- The lab-tier upload limits pass through the deploy stack, so they are tunable from the
  host `.env` as documented

### Security

- Monaco's transitive DOMPurify moved to a patched release
- CodeQL analyses the GitHub Actions workflows alongside the Python and TypeScript code
- Dropped two dependency advisory waivers that no longer match anything in the tree
- Vulnerability alerts still open pull requests for the Expo-managed packages that
  Renovate otherwise leaves alone

## [0.3.0] - 2026-09-07

Security, research output, and identity. The backend now meets the OWASP ASVS 5.0 baseline:
multi-factor authentication, audit logging, upload scanning, token revocation, and rate limits. A
dataset release pipeline tracks contributor consent and publishes under CC BY 4.0. Every surface
moved onto the Cyanotype design system under the name "Relab". Deployment is reproducible: restic
backups, systemd timers, Cloudflare configuration as code, and telemetry over OTLP.

### Added

#### Security and Hardening

- TOTP multi-factor authentication with recovery codes and step-up re-authentication
- Audit events for authentication, authorization denials, rate limits, and sensitive actions
- Token revocation on user deletion and sensitive account updates
- Argon2id passwords, a common-password blocklist, and registration that does not reveal existing emails
- `__Host`-prefixed auth cookies, explicit JWT algorithm and audience checks, auth tokens in URL fragments
- Upload allowlists, MIME and filename agreement, a quota ledger, and optional ClamAV scanning
- Rate limits on expensive and write routes; request body size enforced while streaming
- Row-level locks on destructive lookups; objects owned by others answer as not found
- Database and Redis TLS, least-privilege Postgres roles, trusted proxy CIDR validation
- Content Security Policy and HSTS on the API and the static sites
- Admin user erasure that anonymizes or deletes the user's content
- Browser JavaScript policy that blocks remote scripts, CDN assets, and analytics tags

#### Dataset and Research Outputs

- Dataset release build with Zenodo deposit tooling, consent scoping, and a report of exclusions
- Terms of use, release-credit consent, and recorded terms acceptance
- CC BY 4.0 dataset licence; API specification under Apache-2.0
- Contributor roles with upload quotas per role
- Data-model diagrams and dataset codebook generated into the docs site

#### Backend API

- Stats endpoints for totals, categories, and time series
- Accent-insensitive full-text and trigram search; fuzzy product-type label matching
- Idempotency keys on product and component creation
- Image derivatives with pixel dimensions and uploader metadata
- Email change verification and password-change notifications
- Indexes on foreign keys and search paths; autovacuum tuning for high-churn tables

#### Raspberry Pi Camera

- WebSocket relay bounded against unresponsive devices and disconnects mid-command
- Pairing records restored when a claim fails; device assertions expire and are checked for ownership
- Device key stays on the LAN; relay allowlist rejections answer 403
- Livestream and recording lifecycle fixed; healthy cameras no longer flap to offline
- Circuit breaker state kept in Redis with atomic failure recording

#### Brand and Design System

- Cyanotype design system: Prussian blue and manila with the IBM Plex superfamily
- Titillium-derived wordmark, flask marks, and a theme-adaptive favicon
- Design tokens generated from one source and synced across subrepos
- Shared brand assets with a sync-and-verify script

#### Frontend App

- Migrated off react-native-paper to Uniwind with vendored primitives
- Lucide icons; feature logic moved into `features/` modules
- Desktop top navigation, phone bottom navigation, and a responsive page scaffold
- Product detail rebuilt as a spec sheet with an expandable bill of materials
- Capture-first creation flow, offline resilience for field work, and infinite catalogue scroll
- MFA management, session revocation, and OAuth link and unlink with re-authentication
- Motion pass across galleries and overlays; focus traps and Escape to dismiss
- WCAG 2.2 tags enforced, accessibility statement published, accessibility lint on every PR

#### Frontend Web

- Landing page rebuilt around the 9R ladder, a teardown blueprint hero, and the method section
- Statistics panel fed by the public stats API with a monthly activity chart
- Build-time data layer with a fixture fallback so builds work without the API
- Static security headers aligned with the browser baseline

#### Documentation

- Public API reference hosted with Scalar and styled from the brand tokens
- Attack-surface baseline, review guidelines, and expanded privacy and session documentation
- Architecture diagrams in the brand palette

#### Deployment and Operations

- restic backups: hourly snapshots, maintenance, offsite copy, and a restore path
- Scheduled jobs on systemd timers; a watchdog for API health and backup freshness
- Cloudflare edge and zone configuration in OpenTofu with encrypted state and provider-mocked tests
- Host configuration in a single root `.env`; secrets export and restore for password managers
- Compose network and secret policy checks; Caddy and backup containers run as non-root
- Container logs, host metrics, and API metrics shipped over OTLP

#### Developer Experience and CI/CD

- One CI workflow with a single required check and a shared runtime setup action
- Each check has one home: git hooks fix staged files, `just` recipes verify, CI runs those recipes
- Pull requests run only the checks that gate them; image scans and coverage run after merge
- Markdown linting on rumdl; the browser JavaScript policy is a tested script instead of semgrep
- Every tool version pinned once, in the file its own tooling reads
- OpenAPI and generated API types checked for freshness in CI

#### Testing

- Backend suite split by execution cost with parallel integration runs
- Accessibility scans on www, docs, and the app web build; cross-browser E2E matrix
- Full-stack E2E against a seeded Docker backend; k6 performance baseline

### Changed

- **Breaking:** Registration requires a username; public profiles moved to `/users`, account screens to `/account`
- **Breaking:** Recovery codes replace the email-based MFA reset
- **Breaking:** Product dismantling time fields removed
- **Breaking:** Newsletter signup and `/organizations` removed
- **Breaking:** Stored videos must be HTTP URLs; media lookups are scoped by parent id and type
- **Breaking:** `frontend-app` renamed to `app`, `frontend-web` to `www`

## [0.2.0] - 2026-04-23

Major expansion of the platform: reworked authentication, overhauled frontend-app and frontend-web, Raspberry Pi camera live streaming, observability, and a substantially hardened CI/CD pipeline.

### Added

#### Authentication and Access Control

- Cookie- and refresh-token-based auth replacing session-only flow
- Custom OAuth router with frontend redirects (Google, GitHub)
- Login with username or email, superuser username support
- Rate limiting on login/register with dev/test bypass
- Last-login and IP tracking, email masking in logs
- YouTube OAuth association, toggle, and token cleanup on unlink

#### Backend API

- Full-text (tsvector) product search endpoint
- Pagination, `order_by`, `created_at`/`updated_at` filters on list routes
- Circularity properties on products; weight unit moved from kg to g
- Bounded recursive loading for category and product-tree endpoints
- Image processing pipeline: resize endpoint, product thumbnails, preview-thumbnail URLs with mtime cache-busting
- File cleanup service and script; file storage path bootstrapping
- User preferences field; product ownership and visibility controls
- Healthcheck endpoints
- Video patching and YouTube video ingestion via link

#### Raspberry Pi Camera Integration

- WebSocket pairing, management, and image capture UI
- Cross-worker WebSocket command relay
- LL-HLS proxy and telemetry endpoints
- YouTube live streaming integration
- Local access info retrieval and self-unpairing
- Background unpair notifications on camera delete
- Simplified rpi-cam plugin; dev mock script

#### Frontend App

- UI overhaul, ~1500 lint fixes, refactored test suite
- React Hook Form + Zod resolver across all auth forms
- Camera connection and capture hooks, streaming components
- Product detail, navigation, and new-product-reset fixes
- Cross-browser E2E tagging and expanded test coverage

#### Frontend Web

- Migrated from Expo to Astro
- Styling aligned with the app; newsletter and token-action forms
- Privacy policy page; E2E test suite

#### Observability and Operations

- OpenTelemetry integration with OTLP log/trace export and headers
- Migrated backend logging to Loguru
- Production and staging Docker Compose configurations
- Caddyfile hardening: CSP, static asset handling, SPA routing
- Manual Postgres backup script and rclone sync with stats

#### Email and Caching

- Migrated to fastapi-mail with MJML templates
- Redis-backed disposable-mail cache and refresh-token storage
- In-memory refresh-token fallback for Redis-less dev

#### Documentation

- Migrated from mkdocs-material to Astro
- Footer with copyright and social links; 404 fix

#### Developer Experience and CI/CD

- `just` task runner across the monorepo; migrated to `pnpm`
- Release-please replaces commitizen for version management
- Composite GitHub Actions: runtime setup, change detection, security change detection, Codecov upload
- Full-stack cross-browser E2E workflow; frontend-web E2E job
- Container security matrix, `.trivyignore` allowlist, gitleaks
- cspell spellcheck and pre-commit caching
- Devcontainers per service (backend, frontend-app, frontend-web, docs)
- Moved type checking from pyright to ty; Python 3.14
- `SecretStr` for secret env vars in core config

#### Testing

- Broad backend unit-test suite (auth, OAuth, relay, encryption, background data, organizations, newsletter preferences)
- Frontend-app and frontend-web test coverage expansion

## [0.1.0] - 2025-06-30

Initial release of the Relab platform for circular economy and computer vision research.

### Added

#### API and Backend

- RESTful API built with FastAPI
- Async database operations with SQLModel ORM
- PostgreSQL database integration
- Automated database migrations with Alembic
- Swagger API documentation

#### Authentication and Access Control

- User authentication and authorization
- OAuth integration (Google and Github)
- User organization and role management
- Admin API routes and SQLAdmin interface for data management

#### Data Management

- Support for products, components, and materials
- Hierarchical product and material structures
- Product-type and material categorization

#### Development and Deployment

- Automated code quality checks with pre-commit
- Ruff for linting and code style
- Pyright for static type checking
- Containerized deployment with Docker
- Dependency management with uv

#### Media and Storage

- File and image storage management
- Image and video upload for products
- Raspberry Pi Camera Plugin for remote image capture

[Unreleased]: https://github.com/CMLPlatform/relab/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/CMLPlatform/relab/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/CMLPlatform/relab/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/CMLPlatform/relab/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/CMLPlatform/relab/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CMLPlatform/relab/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CMLPlatform/relab/releases/tag/v0.1.0
