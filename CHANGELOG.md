# Changelog

## [0.3.2](https://github.com/CMLPlatform/relab/compare/v0.3.1...v0.3.2) (2026-09-10)


### Features

* **app:** Add a "?" keyboard shortcuts overlay ([#219](https://github.com/CMLPlatform/relab/issues/219)) ([8e7ccb7](https://github.com/CMLPlatform/relab/commit/8e7ccb76b2354069649c422bd38b3f92b9aab1e1))
* **app:** Serve the theme-adaptive favicon on web ([#208](https://github.com/CMLPlatform/relab/issues/208)) ([eaded5e](https://github.com/CMLPlatform/relab/commit/eaded5e314a665451a96c0b3b654adea3ccbe37d))
* **deploy:** Allow 'build nocache' over the deploy key ([#210](https://github.com/CMLPlatform/relab/issues/210)) ([7b8c27b](https://github.com/CMLPlatform/relab/commit/7b8c27b6beb3edb8e483ebfca1363c4a48447772))
* **deploy:** Drop capabilities on the tunnel ([#254](https://github.com/CMLPlatform/relab/issues/254)) ([1999923](https://github.com/CMLPlatform/relab/commit/1999923cffc90dd80ce31c9037c6681d5395d1fd))
* **deploy:** Let timers run as a dedicated deploy user ([#201](https://github.com/CMLPlatform/relab/issues/201)) ([d8d46ca](https://github.com/CMLPlatform/relab/commit/d8d46ca327b5445d76d419e92d43cb51e2ffadf1))
* **deploy:** Restricted remote deploys and the deploy-user host setup ([#203](https://github.com/CMLPlatform/relab/issues/203)) ([9556bcd](https://github.com/CMLPlatform/relab/commit/9556bcd8ea018bc76f20f7465096f7cf0ec3cef2))
* **edge:** Skip bot fight mode for keyed e2e runs and public product reads ([#206](https://github.com/CMLPlatform/relab/issues/206)) ([1cb4479](https://github.com/CMLPlatform/relab/commit/1cb4479040cacdaaf3b19ab22fcc7cdc58ac8c60))
* **images:** Add a 2560px thumbnail tier for the lightbox ([#268](https://github.com/CMLPlatform/relab/issues/268)) ([ad9af5d](https://github.com/CMLPlatform/relab/commit/ad9af5d63b7c573bea4733b0ae303f6fa9967918))


### Bug Fixes

* Acceptance-run fixes for the app CSP header and e2e lanes ([#202](https://github.com/CMLPlatform/relab/issues/202)) ([279ca0e](https://github.com/CMLPlatform/relab/commit/279ca0e0333f138396553006ace83d3f8928547c))
* Act on the v0.3.0..HEAD codebase review ([#247](https://github.com/CMLPlatform/relab/issues/247)) ([edba860](https://github.com/CMLPlatform/relab/commit/edba86027d9b102eeb109e5533c7b68bc1385f47))
* **api:** Allow the staging edge key header in CORS preflights ([#216](https://github.com/CMLPlatform/relab/issues/216)) ([1c70913](https://github.com/CMLPlatform/relab/commit/1c7091385a1dde0d456733c66e9e1da3d20292c5))
* **app,docs:** Never reuse a leftover preview server in E2E ([#229](https://github.com/CMLPlatform/relab/issues/229)) ([487017c](https://github.com/CMLPlatform/relab/commit/487017c944c6a0cee6608fd8bbc8ca413269d793))
* **app:** Clearer user-facing copy for search and support contact ([#218](https://github.com/CMLPlatform/relab/issues/218)) ([9def3fb](https://github.com/CMLPlatform/relab/commit/9def3fbfb19403536c04b01ac99a8e5d82854320))
* **app:** Finish the heading pass and guard it with lint ([#225](https://github.com/CMLPlatform/relab/issues/225)) ([6134d39](https://github.com/CMLPlatform/relab/commit/6134d394e7289bc66ec667a660f53efaf0b32f55))
* **app:** Give the public profile one h1 and refresh three stale E2E specs ([#233](https://github.com/CMLPlatform/relab/issues/233)) ([e2e1501](https://github.com/CMLPlatform/relab/commit/e2e150184ddceda8ca0336e275c865b8aa0d74fe))
* **app:** Keep photographs out of Smart Invert and gate the rule ([#230](https://github.com/CMLPlatform/relab/issues/230)) ([9300c84](https://github.com/CMLPlatform/relab/commit/9300c849d5857aa6b9b889563ff10992c594d2e5))
* **app:** Label the last unlabelled controls and gate the rule ([#226](https://github.com/CMLPlatform/relab/issues/226)) ([b07000f](https://github.com/CMLPlatform/relab/commit/b07000fec34a4574b8dba5ab4d942d8263477b38))
* **app:** Read the detail back target from the fetched record ([#209](https://github.com/CMLPlatform/relab/issues/209)) ([6aa003e](https://github.com/CMLPlatform/relab/commit/6aa003e873c2ad201fcfb249c98a0ba12616dd17))
* **app:** Stop a concurrent product save losing an edit ([#264](https://github.com/CMLPlatform/relab/issues/264)) ([ef04261](https://github.com/CMLPlatform/relab/commit/ef04261d897e23de2c49527a0c39ba6805f01185))
* **app:** Stop the entry-focus ring outlining the page column ([#223](https://github.com/CMLPlatform/relab/issues/223)) ([59583f8](https://github.com/CMLPlatform/relab/commit/59583f869358cce37dc8ad526c93a4d1b9ede830))
* **app:** V0.3 UI critique and QA follow-ups ([#221](https://github.com/CMLPlatform/relab/issues/221)) ([341a24f](https://github.com/CMLPlatform/relab/commit/341a24f92effbf9617bb07241db399c09d03e747))
* **app:** Web layout regressions found after the prod cutover ([#200](https://github.com/CMLPlatform/relab/issues/200)) ([39021c2](https://github.com/CMLPlatform/relab/commit/39021c2f00ed90cce70f4ce48e10e8f5af4a8471))
* **backend:** Correct the background-work paths behind the upload split ([#261](https://github.com/CMLPlatform/relab/issues/261)) ([162d2da](https://github.com/CMLPlatform/relab/commit/162d2da0b8395cab954f6939db8dfc75df73db63))
* **backend:** Delete products with components without tripping raiseload ([#217](https://github.com/CMLPlatform/relab/issues/217)) ([10e5703](https://github.com/CMLPlatform/relab/commit/10e5703fe353b72a3563edb9345dc33d602ba172))
* **backend:** Stop the pg_trgm move cleanly when the superuser owns the extension ([#215](https://github.com/CMLPlatform/relab/issues/215)) ([0e84db8](https://github.com/CMLPlatform/relab/commit/0e84db8f6893a5d7c364ab4f1032f688f01270cf))
* **backup:** Guard the uploads volume against silent data loss ([#269](https://github.com/CMLPlatform/relab/issues/269)) ([5e648ea](https://github.com/CMLPlatform/relab/commit/5e648eac2cf341a0e48a799308f39d31d08c41dc))
* **backup:** Rebuild before stamping, and say what the stamp did ([#271](https://github.com/CMLPlatform/relab/issues/271)) ([9a8fee1](https://github.com/CMLPlatform/relab/commit/9a8fee1c851316951e63f9c910e3dd43cd3b78d7))
* **ci:** Use the suppression comment form CodeQL honors ([#251](https://github.com/CMLPlatform/relab/issues/251)) ([bb0c003](https://github.com/CMLPlatform/relab/commit/bb0c0034b76eb02b46a8f9130ca22eb608c5e4ba))
* **deploy:** Fail clearly when .env exists but is unreadable ([#249](https://github.com/CMLPlatform/relab/issues/249)) ([2771aec](https://github.com/CMLPlatform/relab/commit/2771aecbb2b22ed55bad01d2559212cdc5b7100e))
* **deploy:** Give hand-run compose the stack's real identity ([#238](https://github.com/CMLPlatform/relab/issues/238)) ([6e0ba3a](https://github.com/CMLPlatform/relab/commit/6e0ba3ada7368402d30f1b62e5cbb090213baf8d))
* **deploy:** Include /snap/bin in the deploy user's PATH ([#204](https://github.com/CMLPlatform/relab/issues/204)) ([f4457df](https://github.com/CMLPlatform/relab/commit/f4457dfe66a4c31d98f9156caf28579c4b323db4))
* **deploy:** Make three release-path failures loud ([#260](https://github.com/CMLPlatform/relab/issues/260)) ([8e07f02](https://github.com/CMLPlatform/relab/commit/8e07f0287558af158bbfef4b5cec9ed3fa51ffe3))
* **deploy:** Refuse to render systemd timers as root ([#199](https://github.com/CMLPlatform/relab/issues/199)) ([0861c52](https://github.com/CMLPlatform/relab/commit/0861c52fa6560a7240451078066e7ce2f7de7c3d))
* **deploy:** Remove the scratch container's anonymous volume ([#246](https://github.com/CMLPlatform/relab/issues/246)) ([764d277](https://github.com/CMLPlatform/relab/commit/764d277fb292cda38dee9d98f9459d7167be0525))
* **edge:** Let CORS preflights past bot fight mode on the api hosts ([#214](https://github.com/CMLPlatform/relab/issues/214)) ([47400bd](https://github.com/CMLPlatform/relab/commit/47400bd7a344719e20acc7cca01b522b2d2905ce))
* **images:** Serve real thumbnails in product lists ([#222](https://github.com/CMLPlatform/relab/issues/222)) ([aa91535](https://github.com/CMLPlatform/relab/commit/aa915355607528fe50ae8416ef0a55335e5e0dde))
* **infra:** Gate cloudflare applies on the plan they apply ([#257](https://github.com/CMLPlatform/relab/issues/257)) ([e86e064](https://github.com/CMLPlatform/relab/commit/e86e064741fee3a23104235923b4489aec6dc310))
* Point registration failure and accessibility copy at what's actually true ([#207](https://github.com/CMLPlatform/relab/issues/207)) ([84440bd](https://github.com/CMLPlatform/relab/commit/84440bdd99e34caf98221a0d297290cf05aa8a9a))
* **security:** Keep addresses out of logs, narrow the edge exemption ([#262](https://github.com/CMLPlatform/relab/issues/262)) ([a747df7](https://github.com/CMLPlatform/relab/commit/a747df72969d74665236b9d67caaf55afcddd12c))
* **watchdog:** Parse restic's Z-suffixed timestamps on the system python ([3d3fab2](https://github.com/CMLPlatform/relab/commit/3d3fab23ffb6de9465559ff155e04af0d3ed2f48))
* **watchdog:** Say why the git probe failed ([#272](https://github.com/CMLPlatform/relab/issues/272)) ([38367a0](https://github.com/CMLPlatform/relab/commit/38367a0c1277a1902bb187d40b33109f4c3f4b09))
* **www:** Never reuse a leftover preview server in E2E ([#227](https://github.com/CMLPlatform/relab/issues/227)) ([c01084b](https://github.com/CMLPlatform/relab/commit/c01084be1af3194e9774fb30ba0f64295c25c7d8))


### Performance Improvements

* **app:** Budget the web export's first-load JavaScript ([#243](https://github.com/CMLPlatform/relab/issues/243)) ([d47c4df](https://github.com/CMLPlatform/relab/commit/d47c4df2bb9d730301b559fbe7d75353b40ccdd9))
* **auth:** Stop transactional email from blocking the response ([318eb2c](https://github.com/CMLPlatform/relab/commit/318eb2c87bc86132633335de67532c845d5b4b90))
* **backend:** Benchmark uploads across a spread of photo sizes ([#241](https://github.com/CMLPlatform/relab/issues/241)) ([ecb4000](https://github.com/CMLPlatform/relab/commit/ecb4000beec36f6b688f34c173e62aab49d4b61d))
* **backend:** Make the k6 baseline measure something, and fix what it found ([#237](https://github.com/CMLPlatform/relab/issues/237)) ([c157b78](https://github.com/CMLPlatform/relab/commit/c157b7872b25ce22fad92817514183dc6d172bf2))
* **docker:** Allowlist the backend context and cache Metro across builds ([#228](https://github.com/CMLPlatform/relab/issues/228)) ([e3f33d8](https://github.com/CMLPlatform/relab/commit/e3f33d88e2a4aad2b8156841e3589b6d7366600f))
* **docker:** Shrink build contexts and drop a dead migrations layer ([#224](https://github.com/CMLPlatform/relab/issues/224)) ([72a39c2](https://github.com/CMLPlatform/relab/commit/72a39c222024b3e3f95ac763cbf53e5686b10368))
* **docker:** Shrink the runtime images ([#236](https://github.com/CMLPlatform/relab/issues/236)) ([133016f](https://github.com/CMLPlatform/relab/commit/133016f3db740896e7bffac0a902e9d47ca42f29))
* **images:** Take the wide thumbnails off the upload response path ([#239](https://github.com/CMLPlatform/relab/issues/239)) ([ecb0174](https://github.com/CMLPlatform/relab/commit/ecb017497e461c9a921292017f2497eb9325aebb))

## v0.3.1 - 2026-09

### Description

A maintenance release. It carries the toolchain forward, closes one interface bug that
crashed on device, repairs two production provisioning faults, and puts the workflow
files under static analysis.

### Fixes

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

### Maintenance

- Jest 30, pnpm 12, AsyncStorage 3, and React Native Testing Library 14
- Refreshed container images, the Cloudflare Terraform provider, and the lockfiles
- Held Babel and TypeScript at the majors their toolchains still support
- Declared the licence in package metadata and added CODEOWNERS
- Corrected the production cutover runbook against the live host

## v0.3.0 - 2026-09

### Description

Security, research output, and identity. The backend now meets the OWASP ASVS 5.0 baseline:
multi-factor authentication, audit logging, upload scanning, token revocation, and rate limits. A
dataset release pipeline tracks contributor consent and publishes under CC BY 4.0. Every surface
moved onto the Cyanotype design system under the name "Relab". Deployment is reproducible: restic
backups, systemd timers, Cloudflare configuration as code, and telemetry over OTLP.

### Breaking Changes

- Registration requires a username; public profiles moved to `/users`, account screens to `/account`
- Recovery codes replace the email-based MFA reset
- Product dismantling time fields removed
- Newsletter signup and `/organizations` removed
- Stored videos must be HTTP URLs; media lookups are scoped by parent id and type
- `frontend-app` renamed to `app`, `frontend-web` to `www`

### Features

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

## v0.2.0 - 2026-04

### Description

Major expansion of the platform: reworked authentication, overhauled frontend-app and frontend-web, Raspberry Pi camera live streaming, observability, and a substantially hardened CI/CD pipeline.

### Features

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

## v0.1.0 - 2025-06

### Description

Initial release of the Relab platform for circular economy and computer vision research.

### Features

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
