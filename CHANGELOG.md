# Changelog

## [1.0.0](https://github.com/CMLPlatform/relab/compare/relab-v0.2.0...relab-v1.0.0) (2026-04-23)


### ⚠ BREAKING CHANGES

* release v0.2.0

### Features

* Add commitizen for automated version management ([2351a43](https://github.com/CMLPlatform/relab/commit/2351a43434a9cecc3fe566694c338316e9b56c8f))
* Add pre-commit autoupdate hook ([c3d1e95](https://github.com/CMLPlatform/relab/commit/c3d1e9519f2c48bbd662411f1a13f57ead321dc6))
* Add robots.txt ([e19af19](https://github.com/CMLPlatform/relab/commit/e19af19b5742282533815de27b7a021e14e15042))
* Add toggle for all vs. my products ([9c373ce](https://github.com/CMLPlatform/relab/commit/9c373cef2371839a18e7a970a85a725e8428bf81))
* **backend:** Add caching to brands endpoint ([b60bf5b](https://github.com/CMLPlatform/relab/commit/b60bf5b9c4b8af525ed8ea62faaeb588e6c68748))
* **backend:** Add owner ID to product read schema ([2d22d3f](https://github.com/CMLPlatform/relab/commit/2d22d3fe5856890e56c18d53c37da186367a2002))
* **backend:** Add product type seeding for CPV codes ([e7a7a3d](https://github.com/CMLPlatform/relab/commit/e7a7a3da08237333738d2fbb2e07efc952e2a6d4))
* **backend:** Add unique brands endpoint ([0539778](https://github.com/CMLPlatform/relab/commit/053977873cd6b3f87cee4a10d36bf33a9cf468a4))
* **backend:** Add version to taxonomy ([d774bd7](https://github.com/CMLPlatform/relab/commit/d774bd763b8252c7a5fe438f2037085f2923f6a9))
* **backend:** Automated backups of user uploads in prod docker setup ([9588980](https://github.com/CMLPlatform/relab/commit/9588980f243b98d37d80244a7e826b84bdd53411))
* **backend:** Fix reference to migrations entrypoint  and add seeding options ([bcf6e59](https://github.com/CMLPlatform/relab/commit/bcf6e59563f9497ab7f74b7ede2e5d80899ef09e))
* **backend:** Improve taxonomy seeding scripts and add cpv seeding script ([97a0f5b](https://github.com/CMLPlatform/relab/commit/97a0f5b9f4ce7919490aceb455c866a9a3a41e5a))
* **backend:** Increase max length of string fields in database ([3c07a56](https://github.com/CMLPlatform/relab/commit/3c07a56a9e6853a35179969c560840eee8318cd7))
* **backend:** WIP: add CPV seeding script ([67d8515](https://github.com/CMLPlatform/relab/commit/67d8515c4bcedfd8f1c34fb5e29645af01eed827))
* **cicd:** Update json pre-commit hook to support jsonc and run linting ([a41d4d3](https://github.com/CMLPlatform/relab/commit/a41d4d3ad8e110a3dea368c1038a7ab1c9bee6e2))
* **database:** Add automated database backups to production stack ([ebd8686](https://github.com/CMLPlatform/relab/commit/ebd8686e4c6eefce16422e2dd459036d536df96b))
* **docker:** Add devcontainer support ([d080a27](https://github.com/CMLPlatform/relab/commit/d080a276feced1ab4832116fce8844896aeb9e95))
* **docs:** Add uv setup for local doc development ([ec6745a](https://github.com/CMLPlatform/relab/commit/ec6745a3459b10b6bf8da67ce81236c3232a4593))
* **frontend-app:** Add file size validation and resize large images ([e2a10cf](https://github.com/CMLPlatform/relab/commit/e2a10cfd8f1dde7b8f619c1f834dfef342519f73))
* **frontend-app:** Add link to privacy policy in registration page ([3972b04](https://github.com/CMLPlatform/relab/commit/3972b0401eec218832a9704b6a490edd2631b7e6))
* **frontend-app:** Add navigation buttons for product images ([fc37f57](https://github.com/CMLPlatform/relab/commit/fc37f5754c8dc2df7b5d1f8e01c7d1a6b38ea734))
* **frontend-app:** Add register, reset password, and email verification flows to app frontend ([963bdf0](https://github.com/CMLPlatform/relab/commit/963bdf0489fc24270e5f993b4bee52e245ce5d83))
* **frontend-app:** Add simple search bar and add product name validation ([54b8ee1](https://github.com/CMLPlatform/relab/commit/54b8ee1e0ceea3318ddbb08f640f65be3a8300b7))
* **frontend-app:** Add user deletion button and user info and id to profile ([a72fb34](https://github.com/CMLPlatform/relab/commit/a72fb349d6b0bbc3e840946150d4b86006128b7e))
* **frontend-app:** Add welcome info card ([cb26a20](https://github.com/CMLPlatform/relab/commit/cb26a202070ea97c825ae2b075651e45e4cdba21))
* **frontend-app:** Allow user to navigate back during registration and validate email ([b3b0eba](https://github.com/CMLPlatform/relab/commit/b3b0ebabbc8b0bd25a368a72cb3d785fc67f51df))
* **frontend-app:** Relax product validation ([5bd8088](https://github.com/CMLPlatform/relab/commit/5bd80888c1b5ad6af86c17088d6ea6a020e7ae7c))
* Release v0.2.0 ([d72f53d](https://github.com/CMLPlatform/relab/commit/d72f53db400ac7bfce071da095a8933f4a2621a1))


### Bug Fixes

* **backend:** Allow all headers ([3c7485c](https://github.com/CMLPlatform/relab/commit/3c7485c929f69993fad469b94a2e03ca7733734c))
* **backend:** Allow unverified users access to /users endpoint ([d25b656](https://github.com/CMLPlatform/relab/commit/d25b65663a74c918a47ca4536d40942ae532b0f0))
* **backend:** Change env file format to support bash ([a4c8ace](https://github.com/CMLPlatform/relab/commit/a4c8aceb66b806e2bc46e0d8118cfadefbac7922))
* **backend:** Create user directory to allow tldextract to function in Docker container ([709a1c7](https://github.com/CMLPlatform/relab/commit/709a1c7cfb7e544e1b4e9066740ff3bb11c56613))
* **backend:** Ensure brand uniqueness in /brands endpoint ([b684d91](https://github.com/CMLPlatform/relab/commit/b684d91bcad2695378e4d346ef72ef31f24a0f6d))
* **backend:** Ensure logging works even when running app via uvicorn ([6a7d347](https://github.com/CMLPlatform/relab/commit/6a7d347a3ffd2a01e0c287ffda4a2d5a9aa0b0eb))
* **backend:** Exclude components from /products endpoint by default ([5544414](https://github.com/CMLPlatform/relab/commit/5544414a4daa76b814001ed6670dafe1a3231b5d))
* **backend:** Fix backend setup scripts ([83bacc3](https://github.com/CMLPlatform/relab/commit/83bacc36bd2ef174e3b8d77106729870ee875c5c))
* **backend:** Fix file storage router permission issues and add example for image metadata field ([af26a6b](https://github.com/CMLPlatform/relab/commit/af26a6b3bc301b5db9abe30ec7d2fe26aad1d962))
* **backend:** Fix import in auth router ([5b417e0](https://github.com/CMLPlatform/relab/commit/5b417e0f6935be60d128f3c0e3b786195f9f199e))
* **backend:** Improve layout of emails ([bbcb594](https://github.com/CMLPlatform/relab/commit/bbcb594ede3359d879490e274e117a31ac6e80aa))
* **backend:** Improve load behaviour for joined images ([ee3c874](https://github.com/CMLPlatform/relab/commit/ee3c874b11039dd4221b89ec5341304efc3f8c95))
* **backend:** Improve PostgreSQL connection handling in local setup script ([6840551](https://github.com/CMLPlatform/relab/commit/6840551272cb2289aec3d6c35527468a9ca18144))
* **backend:** Make CORS config more explicit ([fbc4ba6](https://github.com/CMLPlatform/relab/commit/fbc4ba6b23dbd85c3aac6395d2e850406c86f19f))
* **backend:** Manually fix CPV seeding script ([9762ca6](https://github.com/CMLPlatform/relab/commit/9762ca699c7d9c6e480bba44464a1c4ffe5439a7))
* **backend:** Re-allow user registration and make newsletter endpoints available in admin swagger docs ([b6fe638](https://github.com/CMLPlatform/relab/commit/b6fe63894b1660acc6167c3cbe1e665317445d8d))
* **backend:** Refactor frontend-web url variable ([8914dd5](https://github.com/CMLPlatform/relab/commit/8914dd569fab423d55fcc146d432ddc92076b3ec))
* **backend:** Remove irrelevant todo ([1804f23](https://github.com/CMLPlatform/relab/commit/1804f23659b716561827f2ebd97f3b428bb212c4))
* **backend:** Replace exit code with stdout in db check script ([43fd213](https://github.com/CMLPlatform/relab/commit/43fd213032a1a683aa0a2bb08b10b50f01d429a7))
* **backend:** Simplify cookie domain config ([57e0898](https://github.com/CMLPlatform/relab/commit/57e08987bf00975e53d64406f59525e58ae4f138))
* **backend:** Simplify use of pathlib parents ([e776407](https://github.com/CMLPlatform/relab/commit/e7764078711b856243750f3cfa7158cfc146a94e))
* **backend:** Small documentation improvements ([9f6f50a](https://github.com/CMLPlatform/relab/commit/9f6f50af17ae322b1b8914bb638f2d3a8c17a590))
* **backend:** Strip whitepace on string fields ([4908079](https://github.com/CMLPlatform/relab/commit/4908079940b329134dab90f901c8fdfa05984ed6))
* **backend:** TEMP FIX: Add parent_id and amount_in_parent by default in product read schema to allow breadcrumb UI in frontend ([fd4a4e3](https://github.com/CMLPlatform/relab/commit/fd4a4e39a797c5bbab4fdaf4863b9d41a974e7da))
* **backups:** Change from rclone to rsync and update default backup system paths ([6683662](https://github.com/CMLPlatform/relab/commit/66836625f24dd2b9ec1e34d52ad8b0e0817c7b0a))
* Correct version number in app.config.ts and ensure proper formatting in tsconfig.json ([be4334e](https://github.com/CMLPlatform/relab/commit/be4334eca6da26483e8fe13c37ab57f399b2f1ec))
* **database:** Update docker mount volume for PG 18 ([b04819a](https://github.com/CMLPlatform/relab/commit/b04819a6a02b6ff3c99985a4e7be4d99927085c0))
* **deps:** Add root-level pyproject.toml to renovate and delete dependabot config ([224b75a](https://github.com/CMLPlatform/relab/commit/224b75a77af56e67c94ffcd2e3310726ee02fc14))
* **deps:** Custom Renovate config ([8bbf6b4](https://github.com/CMLPlatform/relab/commit/8bbf6b404f98fcfc5c8a839a7dd28ac176da73ea))
* **deps:** Custom Renovate config ([95ee028](https://github.com/CMLPlatform/relab/commit/95ee0284a4487af0f3d2ed80c4db37334d3e32b6))
* **deps:** Manually fix postgres image SHA ([80c8df2](https://github.com/CMLPlatform/relab/commit/80c8df2f1a01b8d49baf827a57311db0b2605aa7))
* **deps:** Pin dependencies ([52e7da9](https://github.com/CMLPlatform/relab/commit/52e7da9c88beb9905aecfea4d15b8c7dca7879d4))
* **deps:** Pin dependencies ([37f6d5e](https://github.com/CMLPlatform/relab/commit/37f6d5ec50335dc9648112b1129ecb2be6625f70))
* **deps:** Update backend ([9090a47](https://github.com/CMLPlatform/relab/commit/9090a47f71c11923e02c12d16884335d9cbdcd39))
* **deps:** Update backend ([edf2162](https://github.com/CMLPlatform/relab/commit/edf21627d01a1f0227b632fa26d801d17be588e7))
* **deps:** Update expo monorepo ([0218e3e](https://github.com/CMLPlatform/relab/commit/0218e3e1debad45a3930b49e436c21197da17821))
* **deps:** Update expo monorepo ([9c305e4](https://github.com/CMLPlatform/relab/commit/9c305e4d39d544b7cf0b08399e2c43470339d3e3))
* **deps:** Update expo monorepo ([76f3f59](https://github.com/CMLPlatform/relab/commit/76f3f59a62eb5b75426c0939244dc121fcc62938))
* **deps:** Update expo monorepo ([c4bd5b3](https://github.com/CMLPlatform/relab/commit/c4bd5b3d2ea0795ed87b64674bad7990535cb0af))
* **docker:** Clean up docker build and compose files ([19ff042](https://github.com/CMLPlatform/relab/commit/19ff04256358f3db401a06918e828d3043b626a4))
* **docker:** Drop home directory creation in backend docker image ([6bf47e4](https://github.com/CMLPlatform/relab/commit/6bf47e48d904fa97c85d3c95ef904dbc2f2ca090))
* **docker:** Fix npm install in frontend dockerfile ([dabd0fd](https://github.com/CMLPlatform/relab/commit/dabd0fd835a66bb6c908a60313b270b9d3a2c8e6))
* **docker:** Fix typo in FRONTEND_APP_URL var ([7acc222](https://github.com/CMLPlatform/relab/commit/7acc222181a89fff517cabc58adfc79a8f8a8415))
* **docker:** Optimize docker setup for extensibility, faster builds and devcontainer support ([42d9b93](https://github.com/CMLPlatform/relab/commit/42d9b930ecc5dcf18f704abbb0fb7fe32f8e072c))
* **docker:** Pin Pydantic to 2.11 to fix breaking docker images ([27af206](https://github.com/CMLPlatform/relab/commit/27af20650e7abcb616b9c8f9b2b2756c41d6c068))
* **docker:** Update base image to slim version and adjust expo command syntax ([4a7787c](https://github.com/CMLPlatform/relab/commit/4a7787c7a2e079b79925a9579596c9a99c25c21b))
* **docs:** Fix license and changelog links in docs ([b957219](https://github.com/CMLPlatform/relab/commit/b9572198219687a32d57599228637423e59a30c9))
* **docs:** Generalize example db names ([e238b57](https://github.com/CMLPlatform/relab/commit/e238b579d3e73da218aaa193c956841b0ba74456))
* **docs:** Remove self-evident comments in pyproject.toml ([26d88c4](https://github.com/CMLPlatform/relab/commit/26d88c4fbbb8e5af2571d6089def31cec59c156f))
* **docs:** Update documentation on migrations and backup profiles ([37378f8](https://github.com/CMLPlatform/relab/commit/37378f8810fe87e5b93cc3e0f7960acd7daef83a))
* **docs:** Update installation and contribution docs based on new devcontainer setup ([91ee270](https://github.com/CMLPlatform/relab/commit/91ee27066e1b063e4ca9cc3593a1eda82aa1df60))
* **docs:** Update project name ([5a04c6b](https://github.com/CMLPlatform/relab/commit/5a04c6be1fd83c477858f15bb9f2fb5d757aa2de))
* **docs:** Update timestamps in documentation ([72fb5f7](https://github.com/CMLPlatform/relab/commit/72fb5f75a572411c7aa33626b84ff36d092619d5))
* **docs:** Update user registration link ([4e5b3e8](https://github.com/CMLPlatform/relab/commit/4e5b3e8cc72b90f997c25ee37eed407ecc16f41c))
* Ensure users cannot enter 0-value dimensions ([9d53fbf](https://github.com/CMLPlatform/relab/commit/9d53fbf791038dc18a74118ab67b13a1a52c16a8))
* **frontend-app:** Add back forgot password flow ([9da3394](https://github.com/CMLPlatform/relab/commit/9da3394c68315fd5c6d564cf85964351df579834))
* **frontend-app:** Add custom tooltip that works on mobile web ([aa47498](https://github.com/CMLPlatform/relab/commit/aa474980c4f8aa9cb57b796826f4ed135081c31a))
* **frontend-app:** Add exitDelay param ([1f7824c](https://github.com/CMLPlatform/relab/commit/1f7824c56a069856cab89df58b204db95473b122))
* **frontend-app:** Add format script and remove reset-project script from package ([e17adc9](https://github.com/CMLPlatform/relab/commit/e17adc91b931acf7e45e5b9cdc768e26f40463c5))
* **frontend-app:** Add localized float input ([561155d](https://github.com/CMLPlatform/relab/commit/561155da7d18004623d78c95a4ac535a0fe7d42a))
* **frontend-app:** Add timeout to auth flows) ([cf8dbf0](https://github.com/CMLPlatform/relab/commit/cf8dbf02abc18d0120d8d2ea39d4c8ea35306945))
* **frontend-app:** Fix circular import ([062a42c](https://github.com/CMLPlatform/relab/commit/062a42ce8c0314f19063726e91344fb47de228d9))
* **frontend-app:** Gracefully handle attempts of non-validated users to create products ([c98144b](https://github.com/CMLPlatform/relab/commit/c98144b37d2984390c714c93b2d0e6f650048ebc))
* **frontend-app:** Handle unavailable backend gracefully for authentication ([bc29c0c](https://github.com/CMLPlatform/relab/commit/bc29c0cf7f99f96625edf4d683a34730e2c32b5c))
* **frontend-app:** Make asset paths relative to src root ([90f6d34](https://github.com/CMLPlatform/relab/commit/90f6d34e353e55dd0a7d67def5e00cc75cea4c0d))
* **frontend-app:** Move to /src layout ([686962a](https://github.com/CMLPlatform/relab/commit/686962a1876ee2a0ebbf6cd3dc7be4956266c881))
* **frontend-app:** Refactoring based on linting ([992f4bc](https://github.com/CMLPlatform/relab/commit/992f4bc92314e7b8d98ad8e802b3d34d2e0e76e4))
* **frontend-app:** Remove redundant font asset ([286a3e2](https://github.com/CMLPlatform/relab/commit/286a3e20479a494400518876ba3ef487e4d757b6))
* **frontend-app:** Rename /database endpoint to /products ([8f776df](https://github.com/CMLPlatform/relab/commit/8f776dfeef66945c1282c6c08c6da29283983d09))
* **frontend-app:** Replace hardcoded api URL with dynamic env variable ([63127f5](https://github.com/CMLPlatform/relab/commit/63127f53f844e5d3fcb5f7ea55b1512c1ee96c0b))
* **frontend-app:** Store infocard state in local storage ([177b34c](https://github.com/CMLPlatform/relab/commit/177b34cfcd514ebdf117e6a5c98e9aa8627c5572))
* **frontend-app:** Use typescript root over relative import ([eeabda2](https://github.com/CMLPlatform/relab/commit/eeabda27bd75dd3536c96ce6fdc825adcee73332))
* **frontend-web:** Fix asset dir ([6128158](https://github.com/CMLPlatform/relab/commit/6128158e4ab37f373a82143bfbfb76e4327be1f7))
* **frontend-web:** Update privacy policy and content of homepage ([ef9623c](https://github.com/CMLPlatform/relab/commit/ef9623c70a119f2d8c698bbc54317628abd8a6df))
* **frontend:** Add explicit formatting script in package.json ([6ce7357](https://github.com/CMLPlatform/relab/commit/6ce735706e4d3c8019bd255f0bd3e242bb70a8b8))
* **frontend:** Fix favicon format ([5e13b8b](https://github.com/CMLPlatform/relab/commit/5e13b8b8f8b9b8b321c2e61fa95c0424ea4d479e))
* **frontend:** Remove auto-generated reset-project script ([5a785be](https://github.com/CMLPlatform/relab/commit/5a785be4631a7150f075747df67a044ad62c49a6))
* **frontend:** Update favicon ([6862eae](https://github.com/CMLPlatform/relab/commit/6862eae02227418195b970f72afafcd1a6dc55ea))
* **frontend:** Update serve command syntax and move env validation to build-time ([e774cd5](https://github.com/CMLPlatform/relab/commit/e774cd5c479496cf8de5536d0b4eab99b2ed65ae))
* **infra:** Enforce pull of latest cloudflared image ([cbcf675](https://github.com/CMLPlatform/relab/commit/cbcf67571dcc3ef29bd01b611b577f750e6b602c))
* **infra:** Update VS Code settings and extensions ([5425a6c](https://github.com/CMLPlatform/relab/commit/5425a6c3e11124b501c06ffc4f6d0d1d7ae844af))
* **infra:** Upgrade UV lock files ([8ef7aac](https://github.com/CMLPlatform/relab/commit/8ef7aacd32930cb252b8f8c4927e93c704e34169))
* **misc:** Misc. linting fixes ([ee5d86f](https://github.com/CMLPlatform/relab/commit/ee5d86f9eeac73c380f8b4ea2f5a5aa1935192d2))
* **models:** Update file URL path to include 'files' directory ([f2051d5](https://github.com/CMLPlatform/relab/commit/f2051d5310f4cafcffe87c02c629cf0a832092de))
* **pre-commit:** Fix alembic and pyright  pre-commit hooks ([b2a6fef](https://github.com/CMLPlatform/relab/commit/b2a6fef76f2697a751558bb8cf54f7e19c3951b5))
* **routing:** Rename subdomain: api2 -&gt; api ([676ff98](https://github.com/CMLPlatform/relab/commit/676ff9804eb336aa605f21669216e3fcfde7c187))
* **ui:** Fix favicon mime types ([45a0ecb](https://github.com/CMLPlatform/relab/commit/45a0ecb7094117c38cf1766d1454b52bda501160))
* Update contact email address ([6473bc7](https://github.com/CMLPlatform/relab/commit/6473bc7ae3b10b884521b71bef4799d415951238))
* Update default Python environment manager to use venv ([bea6466](https://github.com/CMLPlatform/relab/commit/bea6466d93515c2171f49ed0d4a3ce9b3b586aff))
* **vs code:** Fix suggested python venv settings for VS code integration ([ad3f63c](https://github.com/CMLPlatform/relab/commit/ad3f63c7ef6ccd6aa94e56d50a805ee2337df033))


### Documentation

* Add todos ([d9a3e3c](https://github.com/CMLPlatform/relab/commit/d9a3e3c59434faf4c517a519962e82a4adaf99a5))
* **frontend-app:** Add some Todos ([a815bc0](https://github.com/CMLPlatform/relab/commit/a815bc0ba2953c88a383f6e58e2bb6010aeae730))

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

Initial release of the Reverse Engineering Lab platform for circular economy and computer vision research.

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
