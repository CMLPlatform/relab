# Architecture

High-level map of `app`.

## Stack

- **Runtime:** Expo SDK 57, React 19, React Native 0.86, React Native Web.
- **Routing:** [Expo Router](https://docs.expo.dev/router/introduction/) (file-based, typed routes).
- **Data fetching:** [TanStack Query](https://tanstack.com/query) against a
  FastAPI backend. Types are generated from the backend's OpenAPI schema.
- **Client state:** React context + feature-local hooks/reducers.
- **Forms:** React Hook Form + Zod resolvers.
- **UI kit:** NativeWind v5 + vendored react-native-reusables primitives in src/components/base/.
  Theme (colors, type scale, semantic tokens) is delivered via `AppThemeProvider`/`useAppTheme()`
  (src/theme/); react-native-paper is not used — do not reintroduce it.
- **Compiler:** React Compiler enabled via `babel-plugin-react-compiler`.

## Source layout

```text
src/
├── app/              # Expo Router tree, one file per route.
├── components/       # Feature folders (auth, cameras, product, profile, base).
├── features/         # Feature hooks/logic per domain.
├── navigation/       # Shared destination definitions.
├── services/         # Backend integration: api/, media/, storage, domain stores.
├── context/          # React context providers (auth session, theme, etc.).
├── theme/            # Theme provider, tokens, generated palette.
├── types/            # Hand-written types + api.generated.ts (do not edit).
├── config.ts         # App configuration.
├── constants.ts      # Static values (routes, colors, env-derived constants).
├── utils/            # Framework-agnostic helpers, incl. router/ (Expo Router glue).
├── test-utils/       # Shared test fixtures, MSW handlers, render helpers.
├── hooks/            # Cross-feature custom hooks.
└── assets/           # Fonts, images, icons.
```

`base/` components are generic primitives (incl. vendored react-native-reusables
under `base/ui/`); other component folders are domain-scoped. Feature logic
lives in `src/features/`. Keep imports flowing inward (features may use `base`,
not the reverse).

Where two features share cache state, the contract gets its own neutral module
rather than a mutual import: `features/product-entity/` holds the single-product
query options and invalidation that `features/cameras` writes and
`features/products` reads, so the products→cameras dependency stays one-way.

`base/` holds two kinds of component. Most are generic primitives. A few are app
chrome — `TopNav`, `HeaderRightPill`, `StaticBackground` — which read app
context (auth session, theme mode) and are not reusable outside this app. They
live in `base/` because `_layout.tsx` composes them into the shell; the rule
they still keep is the import direction: chrome renders what it's given (e.g.
`useVisibleDestinations()` from `src/navigation/`) rather than importing from
`src/features/`.

`src/components/base/ui/` is vendored react-native-reusables output — regenerate via the RNR CLI
rather than hand-refactoring.

## Routing

`src/app/` is the Expo Router tree. Groups in parens (`(auth)`) don't affect
the URL. Layouts (`_layout.tsx`) wrap their siblings. Typed routes are on, so
links are type-checked against the file tree. Routes for auth, cameras,
products, profile, users live directly under `src/app/`.

Detail screens are anchored-scroll documents: sections self-register with
SectionNavContext; chips (phone) / outline (lg web) navigate via
useSectionNav.

The account screen uses the same anchored-scroll document pattern. On web at
lg and above, TopNav (src/components/base/TopNav.tsx) renders the persistent
app bar from src/navigation/destinations.ts and the stack header is hidden for
the screens it covers; phones keep the stack headers.

Creation is capture-first: /products/new and components/new render
CaptureScreen (photos/name/type), POST immediately, then land on the detail
screen in edit mode.

## Data flow

1. Runtime API helpers call the backend at `$EXPO_PUBLIC_API_URL`, appending `/v1` for application
   routes.
1. `just backend/openapi` exports the canonical schema to
   [src/types/openapi.json](src/types/openapi.json); `just codegen` regenerates
   [src/types/api.generated.ts](src/types/api.generated.ts) from it and runs
   `scripts/redact_api.mjs` to strip JWT examples before commit.
1. Request helpers live in [src/services/api](src/services/api); feature hooks
   wrap them with TanStack Query, returning typed data.
1. MSW handlers in `src/test-utils/` mock the same surface in unit/integration
   tests so component code is identical in prod and test.

Client-only state (wizard progress, transient UI) lives in feature-local
hooks/reducers or React context. Server state stays in TanStack Query; don't
mirror it into client state stores.

## Testing layers

| Layer       | Tool             | Location                          | What it covers                                                    |
| ----------- | ---------------- | --------------------------------- | ----------------------------------------------------------------- |
| Unit        | Jest + jest-expo | `src/**/*.test.ts(x)`             | Pure logic, single component, MSW-mocked.                         |
| Integration | Jest + jest-expo | `src/**/*.integration.test.ts(x)` | Multiple components wired together, realistic nav.                |
| E2E         | Playwright       | `e2e/`                            | Full-stack against the built web export + docker-compose backend. |

**Location rule:** co-locate every Jest test in a `__tests__/` folder beside the
code it covers; the Jest lane is chosen by the filename **suffix**, not the
folder (`.integration.test.*` → integration lane, everything else → unit). The
unit lane auto-mocks `expo-router` (see `config/setup.unit.ts`); the integration
lane doesn't, so integration tests mock it locally. Root-level/cross-cutting
tests with no single home (config, security policy, theme regressions) live in
`src/__tests__/`.

Run via `just test-unit`, `just test-integration`, `just test-e2e`. See
[README.md](README.md) for profiling tips.

**E2E environmental failures (not code bugs):** `just test-e2e` needs the
`compose.e2e.yaml` stack running against a clean database. A few known-failing
specs are environmental, not regressions — do **not** edit specs to accommodate
them:

- **"Mine" empty-state / seeded-product-not-on-page-1** — the e2e Postgres has
  accumulated test data. Fix by resetting/reseeding the e2e DB, not the spec.
- **OAuth sign-in specs** — `compose.e2e.yaml` doesn't inject Google/GitHub OAuth
  credentials, so those flows can't complete in CI-local runs.

If a spec fails, first confirm the stack is up and the DB is freshly seeded
before treating it as a code regression.

## Build & deploy

- **Dev (web):** `just dev`: Expo Metro on :8081.
- **Dev (native):** `pnpm android` / `pnpm ios`.
- **Web build:** `just build-web` runs `expo export -p web -c` → `dist/`.
- **Runtime:** Caddy serves `dist/` with CSP templated from
  `CADDY_API_ORIGIN`. The enforced policy keeps temporary Expo web allowances for
  inline/eval script execution, permits product embeds only from
  `https://www.youtube-nocookie.com`, and sends a stricter report-only policy as
  the hardening target. See [Dockerfile](Dockerfile) and
  [Caddyfile](Caddyfile).
- **Native releases:** not containerised; use Expo's native build flow from a
  developer machine.

## Linting ownership

Biome is primary (formatting + most correctness). ESLint runs a narrow config
for rules Biome doesn't yet expose (`react-hooks/*`, `react-refresh`,
`react-native-a11y`). This is intentional overlap; see the "Lint Ownership"
section of [README.md](README.md). When Biome ships equivalents for these,
remove ESLint and its plugins.
