# Changelog

## [1.0.0](https://github.com/CMLPlatform/relab/compare/relab-v0.2.0...relab-v1.0.0) (2026-04-23)


### ⚠ BREAKING CHANGES

* release v0.2.0

### Features

* Add commitizen for automated version management ([2162465](https://github.com/CMLPlatform/relab/commit/21624655493aa941aec870ab67f24b2abb10899d))
* Add pre-commit autoupdate hook ([7401e30](https://github.com/CMLPlatform/relab/commit/7401e30fa1ac0d13168c50632edf32b969d0e91e))
* Add robots.txt ([e874e7e](https://github.com/CMLPlatform/relab/commit/e874e7e69accd14e62e2570f40196f9aab2ed9e5))
* Add toggle for all vs. my products ([67f40fa](https://github.com/CMLPlatform/relab/commit/67f40fae3c18574533f0676447912b516a342b27))
* **backend:** Add caching to brands endpoint ([79ce1c7](https://github.com/CMLPlatform/relab/commit/79ce1c7466654e21378c2d4cdb3b7308cbd4d1ab))
* **backend:** Add owner ID to product read schema ([5bc5d9f](https://github.com/CMLPlatform/relab/commit/5bc5d9f45ea4e152db8d7ae6fb4f434c3e886f30))
* **backend:** Add product type seeding for CPV codes ([faaae99](https://github.com/CMLPlatform/relab/commit/faaae99cd8b98483978e1f717fd4b72c640f2969))
* **backend:** Add unique brands endpoint ([bd9aead](https://github.com/CMLPlatform/relab/commit/bd9aead4ebd08d15e956b593cd1aec9380e99f38))
* **backend:** Add version to taxonomy ([34a3f34](https://github.com/CMLPlatform/relab/commit/34a3f343e0a69d820fd9e0bd6a382c8321593627))
* **backend:** Automated backups of user uploads in prod docker setup ([21e845e](https://github.com/CMLPlatform/relab/commit/21e845e5d34e8dfd5fdf92b8fe406709aad684b7))
* **backend:** Fix reference to migrations entrypoint  and add seeding options ([23febb1](https://github.com/CMLPlatform/relab/commit/23febb11a3c482cab75e088bfcd9b9df5620261f))
* **backend:** Improve taxonomy seeding scripts and add cpv seeding script ([61e3cd4](https://github.com/CMLPlatform/relab/commit/61e3cd4f89b8a310f9a2c8d3f97414e66c621ce9))
* **backend:** Increase max length of string fields in database ([177d953](https://github.com/CMLPlatform/relab/commit/177d953137463ab332d1ce0b52b0ce79dbbdccfe))
* **backend:** WIP: add CPV seeding script ([0437d7b](https://github.com/CMLPlatform/relab/commit/0437d7bda4734c470adb4364ae0b22fde041c853))
* **cicd:** Update json pre-commit hook to support jsonc and run linting ([bce7b18](https://github.com/CMLPlatform/relab/commit/bce7b18ea56b9e59258e65333ef6b297151dc39e))
* **database:** Add automated database backups to production stack ([a14c684](https://github.com/CMLPlatform/relab/commit/a14c684f4f0ba40932c514194bf6bd2b33f92105))
* **docker:** Add devcontainer support ([be7c7a4](https://github.com/CMLPlatform/relab/commit/be7c7a4551ee43b018172b6169a841ca647bb0e3))
* **docs:** Add uv setup for local doc development ([9fbe783](https://github.com/CMLPlatform/relab/commit/9fbe783a7e7865e2c5e526b8d6ddb32fdcb33bcf))
* **frontend-app:** Add file size validation and resize large images ([f103814](https://github.com/CMLPlatform/relab/commit/f103814b89304b2ac3fbe1ec16d852b6aa76fd7d))
* **frontend-app:** Add link to privacy policy in registration page ([5e04dfe](https://github.com/CMLPlatform/relab/commit/5e04dfe5aedc2c0621a26d8958bf26730b3cbbf2))
* **frontend-app:** Add navigation buttons for product images ([8fd8f66](https://github.com/CMLPlatform/relab/commit/8fd8f66c6d2b670ff189cfcf188c7e448575636b))
* **frontend-app:** Add register, reset password, and email verification flows to app frontend ([4048a02](https://github.com/CMLPlatform/relab/commit/4048a028bb1ca4e2b5041bd0c673408c238f95e5))
* **frontend-app:** Add simple search bar and add product name validation ([14c5e5c](https://github.com/CMLPlatform/relab/commit/14c5e5c328a45963f9a82d32069254d17e666ce4))
* **frontend-app:** Add user deletion button and user info and id to profile ([4118096](https://github.com/CMLPlatform/relab/commit/4118096349fe5ed5a7f2209672347af00d84797f))
* **frontend-app:** Add welcome info card ([d73a5c9](https://github.com/CMLPlatform/relab/commit/d73a5c93e8a984e0e4fab23350933d177c50868f))
* **frontend-app:** Allow user to navigate back during registration and validate email ([6747e27](https://github.com/CMLPlatform/relab/commit/6747e27848a764bc17f73de93b0c54e391e379f3))
* **frontend-app:** Relax product validation ([d4ae3de](https://github.com/CMLPlatform/relab/commit/d4ae3de16b3013b9fb7f23bb211a43f134ec036c))
* Release v0.2.0 ([5e13df2](https://github.com/CMLPlatform/relab/commit/5e13df20b9e4d31b64444683e8c468d6c0c4dff4))


### Bug Fixes

* **backend:** Allow all headers ([2882d44](https://github.com/CMLPlatform/relab/commit/2882d4452ca24d44260b8667aa1c398aac141c19))
* **backend:** Allow unverified users access to /users endpoint ([b75fe6c](https://github.com/CMLPlatform/relab/commit/b75fe6c1761f5dfa1fbef29210614d5fdbeacb5f))
* **backend:** Change env file format to support bash ([ff4b7c8](https://github.com/CMLPlatform/relab/commit/ff4b7c87a2938dbd088d1f598a9e5ff3cca37ea9))
* **backend:** Create user directory to allow tldextract to function in Docker container ([a0a85b1](https://github.com/CMLPlatform/relab/commit/a0a85b1bf0c04395bc62bbcd73593f9da3f2f6df))
* **backend:** Ensure brand uniqueness in /brands endpoint ([e544bee](https://github.com/CMLPlatform/relab/commit/e544beebb9be5aabef599caa8689323a2d6f251a))
* **backend:** Ensure logging works even when running app via uvicorn ([f19519e](https://github.com/CMLPlatform/relab/commit/f19519e663f0d93af650d8a80429d456dfc3f429))
* **backend:** Exclude components from /products endpoint by default ([bb4b8fc](https://github.com/CMLPlatform/relab/commit/bb4b8fcd1ac0fca5737d353f672ddd4e0172fcc0))
* **backend:** Fix backend setup scripts ([4b81b0b](https://github.com/CMLPlatform/relab/commit/4b81b0bef138e5d8816b1147f2e2e190711a21d9))
* **backend:** Fix file storage router permission issues and add example for image metadata field ([c4b6d94](https://github.com/CMLPlatform/relab/commit/c4b6d94d53ba5b235c3e5a52897d355ed5a2fe23))
* **backend:** Fix import in auth router ([e950d9a](https://github.com/CMLPlatform/relab/commit/e950d9accbd977c1ec83e185039f1ad01ffc9535))
* **backend:** Improve layout of emails ([1ee8ced](https://github.com/CMLPlatform/relab/commit/1ee8ced8da56645408dc15fbcb52b34f60e3b447))
* **backend:** Improve load behaviour for joined images ([528dd5d](https://github.com/CMLPlatform/relab/commit/528dd5d04b7495f6367050ac5aae79230f18a174))
* **backend:** Improve PostgreSQL connection handling in local setup script ([4cce76b](https://github.com/CMLPlatform/relab/commit/4cce76b96b494df27ceb73ebb5660f6b0b632a9a))
* **backend:** Make CORS config more explicit ([1f508c3](https://github.com/CMLPlatform/relab/commit/1f508c3a170574228152441947ec5c43857aa2ad))
* **backend:** Manually fix CPV seeding script ([cc2def9](https://github.com/CMLPlatform/relab/commit/cc2def9c71026d2db5f77e3c649d8f4499a8b9df))
* **backend:** Re-allow user registration and make newsletter endpoints available in admin swagger docs ([4374817](https://github.com/CMLPlatform/relab/commit/4374817d07ee9475a1c47eac5306933f2756a6aa))
* **backend:** Refactor frontend-web url variable ([c154a66](https://github.com/CMLPlatform/relab/commit/c154a66ddcaea46273a8b6bd64d7548f79cda600))
* **backend:** Remove irrelevant todo ([7e63391](https://github.com/CMLPlatform/relab/commit/7e633915cf5ad9f886cb73f8a34cbcca0ec15f09))
* **backend:** Replace exit code with stdout in db check script ([bfa6f37](https://github.com/CMLPlatform/relab/commit/bfa6f376f637b1dbf60b3744db6e913a860240fc))
* **backend:** Simplify cookie domain config ([dad9421](https://github.com/CMLPlatform/relab/commit/dad94214c18b144bf641b24fd70bcc7006d644c1))
* **backend:** Simplify use of pathlib parents ([2d3c985](https://github.com/CMLPlatform/relab/commit/2d3c985f13c3219e2d96080bde595a56a14b7a46))
* **backend:** Small documentation improvements ([668b2e4](https://github.com/CMLPlatform/relab/commit/668b2e413a6a69fa162bd1b0fa1d88e6d38f616d))
* **backend:** Strip whitepace on string fields ([99c47c9](https://github.com/CMLPlatform/relab/commit/99c47c934a347d51b48ce85a8ecdff08131b175a))
* **backend:** TEMP FIX: Add parent_id and amount_in_parent by default in product read schema to allow breadcrumb UI in frontend ([9be495f](https://github.com/CMLPlatform/relab/commit/9be495fdf7d3bce2b4e25fd7be9df4c248f992a1))
* **backups:** Change from rclone to rsync and update default backup system paths ([c05ff6d](https://github.com/CMLPlatform/relab/commit/c05ff6d0cade72fbc03ad2cfa3804d09d2150651))
* Correct version number in app.config.ts and ensure proper formatting in tsconfig.json ([ebaf4a4](https://github.com/CMLPlatform/relab/commit/ebaf4a4e7a21350d457e135bde0220cf6f3b9e35))
* **database:** Update docker mount volume for PG 18 ([5123cb8](https://github.com/CMLPlatform/relab/commit/5123cb842f7e2a1e5e9a96e4b5773130c1b08045))
* **deps:** Add root-level pyproject.toml to renovate and delete dependabot config ([a77bca6](https://github.com/CMLPlatform/relab/commit/a77bca651eec4dc9840c67c4d86516b4062e13e4))
* **deps:** Custom Renovate config ([647ed7c](https://github.com/CMLPlatform/relab/commit/647ed7cc7117afde66e07184d82de56dc1c5e6eb))
* **deps:** Custom Renovate config ([ee1e1f1](https://github.com/CMLPlatform/relab/commit/ee1e1f1430629b6468807d7ffbcbec9d793715b5))
* **deps:** Manually fix postgres image SHA ([786fd65](https://github.com/CMLPlatform/relab/commit/786fd65b22c6498687172e3912d8ae2b4847082a))
* **deps:** Pin dependencies ([2252b89](https://github.com/CMLPlatform/relab/commit/2252b899b1bbda3c0f9d3a320b4680965f6f2d37))
* **deps:** Pin dependencies ([93c5b9f](https://github.com/CMLPlatform/relab/commit/93c5b9fc3b06073a903de9364d0bd8a9138ccc90))
* **deps:** Update backend ([14bf7d5](https://github.com/CMLPlatform/relab/commit/14bf7d59b9d4b31d4e783de9efdc88a4f471b41b))
* **deps:** Update backend ([222c914](https://github.com/CMLPlatform/relab/commit/222c9143af5c0d8cab576886cd55d691218ef8ae))
* **deps:** Update expo monorepo ([952bb82](https://github.com/CMLPlatform/relab/commit/952bb823e0f7d88e6b62e62dfcf758fd5e4205b3))
* **deps:** Update expo monorepo ([0c8c1d8](https://github.com/CMLPlatform/relab/commit/0c8c1d89b71b23a5ce08e738fd5e323703b47721))
* **deps:** Update expo monorepo ([d15f537](https://github.com/CMLPlatform/relab/commit/d15f537d98619efbb85011a09946f5f5ff6d45e4))
* **deps:** Update expo monorepo ([a885e1c](https://github.com/CMLPlatform/relab/commit/a885e1c48b3abf99a355369e4f33d63b5629c279))
* **docker:** Clean up docker build and compose files ([553cd66](https://github.com/CMLPlatform/relab/commit/553cd662fdc7b0c579dc6270394463f5a3b0d16e))
* **docker:** Drop home directory creation in backend docker image ([b41c040](https://github.com/CMLPlatform/relab/commit/b41c040a923609a5bea1734c45ff99e405b28b50))
* **docker:** Fix npm install in frontend dockerfile ([ed0e33d](https://github.com/CMLPlatform/relab/commit/ed0e33daff358886043a36c2295fde9dfd27d956))
* **docker:** Fix typo in FRONTEND_APP_URL var ([7b642a9](https://github.com/CMLPlatform/relab/commit/7b642a9bc17059f3183b458dd57cca55967696d1))
* **docker:** Optimize docker setup for extensibility, faster builds and devcontainer support ([d91317d](https://github.com/CMLPlatform/relab/commit/d91317d2bfc48468ee8b2d1b8e79334e29a10f6c))
* **docker:** Pin Pydantic to 2.11 to fix breaking docker images ([704026b](https://github.com/CMLPlatform/relab/commit/704026bdb827d371d80b7159ebf0ce8189150593))
* **docker:** Update base image to slim version and adjust expo command syntax ([6e90d35](https://github.com/CMLPlatform/relab/commit/6e90d35a808f8d7a4b8b73ac73a5558e03182c71))
* **docs:** Fix license and changelog links in docs ([2195c64](https://github.com/CMLPlatform/relab/commit/2195c64247e75696450625587325bbb9911ebb1b))
* **docs:** Generalize example db names ([571c8d9](https://github.com/CMLPlatform/relab/commit/571c8d95d71bda021543760242bb63818b718295))
* **docs:** Remove self-evident comments in pyproject.toml ([8ddf954](https://github.com/CMLPlatform/relab/commit/8ddf954cbeac8cb54301f19d2208fc38267eb209))
* **docs:** Update documentation on migrations and backup profiles ([30f4cb3](https://github.com/CMLPlatform/relab/commit/30f4cb3903fbb4e431f3cbd93710da0d22998b07))
* **docs:** Update installation and contribution docs based on new devcontainer setup ([6edcd21](https://github.com/CMLPlatform/relab/commit/6edcd214e8a38f9c597c9d12178edbf9f2c25d87))
* **docs:** Update project name ([f5c39cb](https://github.com/CMLPlatform/relab/commit/f5c39cb42db17cc5ad1657fb0c1927f19f00a45c))
* **docs:** Update timestamps in documentation ([7bdb7d2](https://github.com/CMLPlatform/relab/commit/7bdb7d22ea5dc7498db89b496ce6b4b0840fdbfc))
* **docs:** Update user registration link ([d23ef4e](https://github.com/CMLPlatform/relab/commit/d23ef4e49e48c58cd6523f3a6842beed86499923))
* Ensure users cannot enter 0-value dimensions ([e43aab6](https://github.com/CMLPlatform/relab/commit/e43aab600114c0fc5dbaa8402e20af569d3158d7))
* **frontend-app:** Add back forgot password flow ([bca5ae5](https://github.com/CMLPlatform/relab/commit/bca5ae50628da9be7bea44852ebbafdc0dc829be))
* **frontend-app:** Add custom tooltip that works on mobile web ([6ee01cc](https://github.com/CMLPlatform/relab/commit/6ee01cc0564b84b4b7f450f82535137e41db051b))
* **frontend-app:** Add exitDelay param ([1d991cb](https://github.com/CMLPlatform/relab/commit/1d991cb4eee65fa414619e3fbd2d48092a0de79a))
* **frontend-app:** Add format script and remove reset-project script from package ([0e435dd](https://github.com/CMLPlatform/relab/commit/0e435dd365808f893dc3f354fd8bdbeba308430e))
* **frontend-app:** Add localized float input ([1b4e2a5](https://github.com/CMLPlatform/relab/commit/1b4e2a563aa09309ab344f91edd62ad67954dbfc))
* **frontend-app:** Add timeout to auth flows) ([4603423](https://github.com/CMLPlatform/relab/commit/46034232f0bed7ade29267fc82fe21e994d7accd))
* **frontend-app:** Fix circular import ([613cff5](https://github.com/CMLPlatform/relab/commit/613cff5ad325735f6727f318c05ac05aeb0733df))
* **frontend-app:** Gracefully handle attempts of non-validated users to create products ([6174fa7](https://github.com/CMLPlatform/relab/commit/6174fa7e7d4b11c64983692c6569e80d540b6118))
* **frontend-app:** Handle unavailable backend gracefully for authentication ([9b87dc9](https://github.com/CMLPlatform/relab/commit/9b87dc9ccb2ec97e810749f8bfc8ed8ad60734f3))
* **frontend-app:** Make asset paths relative to src root ([d659472](https://github.com/CMLPlatform/relab/commit/d659472dca98d06b4603cb108216b03ae446209e))
* **frontend-app:** Move to /src layout ([d185bc4](https://github.com/CMLPlatform/relab/commit/d185bc40fe807c1b60394c296278b1183341d12c))
* **frontend-app:** Refactoring based on linting ([61d16e8](https://github.com/CMLPlatform/relab/commit/61d16e8fedd87be2ebc82b6d129a0d248c30f853))
* **frontend-app:** Remove redundant font asset ([33a94d8](https://github.com/CMLPlatform/relab/commit/33a94d8193c22489a42912f921261084890e867e))
* **frontend-app:** Rename /database endpoint to /products ([6c0639d](https://github.com/CMLPlatform/relab/commit/6c0639db71c2cbd16e833853c593cbb7214ba560))
* **frontend-app:** Replace hardcoded api URL with dynamic env variable ([6147977](https://github.com/CMLPlatform/relab/commit/61479774a4dbfab960efeb134ac3475f0898fb64))
* **frontend-app:** Store infocard state in local storage ([af0d602](https://github.com/CMLPlatform/relab/commit/af0d60228e2d50cfb03b3896ed7bd06acc010329))
* **frontend-app:** Use typescript root over relative import ([40347d0](https://github.com/CMLPlatform/relab/commit/40347d0a01e8b11840ef26df439578900b299f2f))
* **frontend-web:** Fix asset dir ([722824d](https://github.com/CMLPlatform/relab/commit/722824db16233f208c381624ad0cce23ecb87739))
* **frontend-web:** Update privacy policy and content of homepage ([dba3f63](https://github.com/CMLPlatform/relab/commit/dba3f63631f313b31b7355113f62f71c9ea03794))
* **frontend:** Add explicit formatting script in package.json ([a6a3465](https://github.com/CMLPlatform/relab/commit/a6a3465b4f85282bcbc0ece47d1e92aebcc757c3))
* **frontend:** Fix favicon format ([defe96c](https://github.com/CMLPlatform/relab/commit/defe96cf88185d1a85300e4bfeacfdf5ee660ef9))
* **frontend:** Remove auto-generated reset-project script ([4ee16c7](https://github.com/CMLPlatform/relab/commit/4ee16c73862f8c56afb7cfa2ffd30ac768c36ddb))
* **frontend:** Update favicon ([1ddd1e5](https://github.com/CMLPlatform/relab/commit/1ddd1e55925f72deaad6e8f54b0b2d01ba14e169))
* **frontend:** Update serve command syntax and move env validation to build-time ([254a13d](https://github.com/CMLPlatform/relab/commit/254a13d34f06e643c1bc21718327ac39187472c0))
* **infra:** Enforce pull of latest cloudflared image ([791d923](https://github.com/CMLPlatform/relab/commit/791d9238e1651c7da139d11d245ae92453fdc6c6))
* **infra:** Update VS Code settings and extensions ([e68ea2f](https://github.com/CMLPlatform/relab/commit/e68ea2f0e37d6611f6cecdc0b32d77b03812b106))
* **infra:** Upgrade UV lock files ([bb43b08](https://github.com/CMLPlatform/relab/commit/bb43b08b652e254cc53ae3b2b6be69c7455b0e0b))
* **misc:** Misc. linting fixes ([7e6b142](https://github.com/CMLPlatform/relab/commit/7e6b142ac337a1eb5eebf8f50b42815b688e37a3))
* **models:** Update file URL path to include 'files' directory ([e2e39be](https://github.com/CMLPlatform/relab/commit/e2e39be60f260aa6c97a695acf93e66d1a918f5b))
* **pre-commit:** Fix alembic and pyright  pre-commit hooks ([e2e2143](https://github.com/CMLPlatform/relab/commit/e2e21434a7f487bdecbfe680d6001260896b9cce))
* **routing:** Rename subdomain: api2 -&gt; api ([d1d256d](https://github.com/CMLPlatform/relab/commit/d1d256d5d5781000e8215283b6a28453a0749883))
* **ui:** Fix favicon mime types ([e4610a9](https://github.com/CMLPlatform/relab/commit/e4610a9c7350dfc46371e8f879204ec88c714808))
* Update contact email address ([caa8590](https://github.com/CMLPlatform/relab/commit/caa8590ce7277bfcf428a870f4c65c22b5e80033))
* Update default Python environment manager to use venv ([3996075](https://github.com/CMLPlatform/relab/commit/3996075e22013c1a76bff3b57e815d3995e0ec79))
* **vs code:** Fix suggested python venv settings for VS code integration ([05e921f](https://github.com/CMLPlatform/relab/commit/05e921f0207a6d351decb011f963b0fe9f18fd22))


### Documentation

* Add todos ([6852227](https://github.com/CMLPlatform/relab/commit/68522278e83953a8e238ac524105d0d493e5b01f))
* **frontend-app:** Add some Todos ([f5890c5](https://github.com/CMLPlatform/relab/commit/f5890c587fe78dc572758ee53d86655160bfc4ef))

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
