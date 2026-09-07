# Changelog

## v0.3.0 - 2026-09

### Description

Security, research output, and identity. The backend was hardened against the OWASP ASVS 5.0 baseline
(multi-factor authentication, audit logging, upload scanning, token revocation, rate limits), the
platform gained a publishable dataset pipeline with consent tracking and a CC BY 4.0 licence, and the
whole product moved onto the Cyanotype design system behind a single visual identity. Deployment
became reproducible: restic backups, systemd timers, Cloudflare edge configuration as code, and
telemetry over OTLP.

### Breaking Changes

- Registration requires a username; public profiles moved to `/users`, account screens to `/account`
- Email-based MFA reset replaced by single-use recovery codes
- Product dismantling time fields removed
- Newsletter signup flows removed
- Stored videos must be HTTP URLs; media lookups are scoped by parent id and type
- `frontend-app` renamed to `app`, `frontend-web` to `www`; product name settled as "Relab"

### Features

#### Security and Hardening

- TOTP multi-factor authentication with enrollment, challenge, recovery codes, and step-up re-auth
- Structured audit events for authentication, authorization denials, rate limits, and sensitive actions
- Refresh and access token revocation on user deletion and sensitive account updates
- Argon2id password policy, common-password blocklist, and non-enumerable registration
- `__Host`-prefixed auth cookies, explicit JWT algorithm and audience policy, auth tokens in URL fragments
- Upload allowlists, content validation, MIME/filename agreement, quota ledger, and optional ClamAV scanning
- Targeted rate limits on expensive and write routes; streamed request body size enforcement
- Row-level locks on destructive lookups; foreign-owned objects hidden behind not found
- Database and Redis TLS configuration, least-privilege Postgres roles, trusted proxy CIDR validation
- Content Security Policy and HSTS across the API and the static sites
- Admin user erasure with an anonymize-or-delete content policy
- Browser JavaScript policy blocking remote scripts, CDN assets, and analytics tags

#### Dataset and Research Outputs

- Dataset release build with Zenodo deposit tooling, consent scoping, and reported exclusions
- Terms of use, release-credit consent, and recorded terms acceptance
- CC BY 4.0 dataset licence; API specification licensed under Apache-2.0
- Contributor roles with role-tiered upload quotas
- Generated data-model diagrams and dataset codebook published to the docs site

#### Backend API

- Stats context with totals, category, and time-series endpoints over a read model
- Accent-insensitive full-text and trigram search; fuzzy product-type label matching
- Idempotency keys on product and component creation
- Published image derivatives with pixel dimensions and uploader metadata
- Email provider architecture with change verification and password-change notifications
- Index coverage for foreign keys and search paths; autovacuum tuning for high-churn tables

#### Brand and Design System

- Cyanotype design system: Prussian blue and manila with the IBM Plex superfamily
- Titillium-derived wordmark, flask marks, and a theme-adaptive favicon
- Design tokens (palette, radius, shadow, type, chart) generated from source and synced across subrepos
- Shared brand assets centralized with a sync-and-verify script

#### Frontend App

- Migrated off react-native-paper to NativeWind, then to Uniwind with vendored primitives
- Icons unified on a Lucide-backed primitive; feature logic moved into `features/` modules
- Desktop top navigation, phone bottom navigation, and a responsive page scaffold
- Product detail rebuilt as a navigable spec sheet with an expandable bill of materials
- Capture-first creation flow, offline resilience for field work, and infinite catalogue scroll
- MFA management, session revocation, and OAuth link and unlink with re-authentication
- Motion pass across galleries, overlays, and status seams; focus traps and Escape-to-dismiss
- WCAG 2.2 tags enforced, accessibility statement published, per-PR React Native accessibility lint

#### Frontend Web

- Landing page rebuilt around the 9R ladder, a live teardown blueprint hero, and the method section
- Homepage statistics panel fed by the public stats API with a monthly activity chart
- Build-time data layer with a fixture fallback so builds work without the API
- Static security headers aligned with the browser baseline

#### Documentation

- Public API reference hosted with Scalar and styled from the brand tokens
- Attack-surface baseline, review guidelines, and expanded privacy and session documentation
- Architecture diagrams moved onto the brand categorical ramp

#### Deployment and Operations

- restic backups replacing raw scripts: hourly snapshots, split maintenance, offsite copy, restore path
- Scheduled jobs run from systemd timers; deploy watchdog for API health and backup freshness
- Cloudflare edge and zone configuration in OpenTofu with encrypted state and mocked-provider tests
- Host configuration folded into a single root `.env`; secrets export and restore for password managers
- Compose network and secret policy checks; Caddy and backup containers run as non-root
- Container logs, host metrics, and API metrics shipped over OTLP with bounded logging

#### Developer Experience and CI/CD

- One CI workflow with a single branch-protection context and a shared runtime setup action
- Each check has one home: git hooks fix staged files, `just` recipes verify, CI runs those recipes
- Pull requests run only the checks that gate them; image scans and coverage moved post-merge
- Markdown linting consolidated on rumdl; the browser JavaScript policy replaced semgrep with a tested script
- Every tool version pinned exactly once in the file its own tooling reads
- OpenAPI and generated API type freshness gated in CI

#### Testing

- Backend suite reorganized by execution cost with parallel integration runs
- Accessibility scans on www, docs, and the app web build; cross-browser E2E matrix
- Full-stack E2E against a seeded Docker backend; k6 performance baseline with recalibrated thresholds

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
