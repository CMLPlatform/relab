# Relab App

Expo / React Native app for authenticated data collection.

## Quick Start

```bash
just install
just dev
```

The Expo dev server runs on <http://127.0.0.1:8011>.

Run the backend too. If the API is not on localhost, set `EXPO_PUBLIC_API_URL` in `.env.local`.

Docker development ports are localhost-only. To open the app from another device on your LAN, run
`just dev` from this subrepo instead of the Docker app service.

## Stack

- **Runtime:** Expo SDK 57, React 19, React Native 0.86, React Native Web.
- **Routing:** [Expo Router](https://docs.expo.dev/router/introduction/) (file-based, typed routes).
- **Data fetching:** [TanStack Query](https://tanstack.com/query) against a
  FastAPI backend. Types are generated from the backend's OpenAPI schema.
- **Client state:** React context + feature-local hooks/reducers.
- **Forms:** React Hook Form + Zod resolvers.
- **UI kit:** Uniwind (Tailwind v4 for React Native) + vendored react-native-reusables
  primitives in src/components/base/.
  Theme (colors, type scale, semantic tokens) comes from `AppThemeProvider`/`useAppTheme()`
  (src/theme/). Do not reintroduce react-native-paper.
- **Compiler:** React Compiler enabled via `babel-plugin-react-compiler`.

## Source Layout

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

`base/` holds generic primitives (including vendored react-native-reusables under `base/ui/`);
other component folders are domain-scoped. Feature logic lives in `src/features/`. Imports flow
inward: features may use `base`, not the reverse.

Two features that share cache state get a neutral module instead of a mutual import.
`features/product-entity/` holds the single-product query options and invalidation that
`features/cameras` writes and `features/products` reads.

A few `base/` components are app chrome (`TopNav`, `HeaderRightPill`, `StaticBackground`). They
read app context and are not reusable outside this app. They keep the import direction: chrome
renders what it is given (for example `useVisibleDestinations()` from `src/navigation/`) and does
not import from `src/features/`.

`src/components/base/ui/` is vendored react-native-reusables output. Regenerate it with the RNR
CLI; do not hand-refactor it.

Call sites use a vendored primitive directly when it fits (`ui/input`, `ui/badge`, `ui/button`,
`ui/text`). The hand-rolled `TextInput`, `InfoTooltip`, `Chip`, `AppDialog`, and `Menu` each carry
behavior the primitive lacks; each has a dated `NOTE:` at the top saying which. Re-open the
question only when the primitive gains that behavior.

## Routing

`src/app/` is the Expo Router tree. Groups in parens (`(auth)`) do not affect the URL. Layouts
(`_layout.tsx`) wrap their siblings. Typed routes are on, so links are type-checked against the
file tree.

The full screen inventory, flow diagrams, and routing rules live in
[App navigation flow](https://docs.cml-relab.org/architecture/app-flow/).

The three primary destinations are tabs: `(tabs)/(products)`, `(tabs)/(cameras)` and
`(tabs)/(account)`. Each group holds its own Stack, so every tab keeps its trail. BottomNav is that
navigator's `tabBar`. The products tab owns both the `/products` and `/components` trees; a
cross-navigator `replace` resets every tab, so a link that leaves one tab for another must use
`navigate`, never `replace`. The root stack keeps only what sits outside the tabs: the entry
redirect, `(auth)`, `category-selection` and `users/[username]`.

Detail screens and the account screen are anchored-scroll documents: sections self-register with
SectionNavContext; chips (phone) / outline (lg web) navigate via useSectionNav.

On web at lg and above, TopNav (src/components/base/TopNav.tsx) renders the persistent app bar from
src/navigation/destinations.ts and the stack header is hidden for the screens it covers; phones
keep the stack headers.

Creation is capture-first: /products/new and components/new render CaptureScreen
(photos/name/type), POST immediately, then land on the detail screen in edit mode.

## Data Flow

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

Client-only state (wizard progress, transient UI) lives in feature-local hooks/reducers or React
context. Server state stays in TanStack Query; do not mirror it into client state stores.

### Picking an image size

Read schemas carry `thumbnail_url` (the 200px list thumbnail) and `thumbnail_urls`, derivatives
keyed by width (200/800/1600, minus any width at or above the original, so the map is sparse).
`resolveApiMediaUrlMap` applies the same safety checks as for any other media URL.

Read schemas also carry `width_px`/`height_px`, the original's size after EXIF rotation. All
derivatives share that aspect ratio. Rows uploaded before the columns existed are null until
`python -m scripts.maintenance.backfill_image_dimensions` measures them.

With dimensions, the gallery pager hands expo-image a `source` array and lets it match the
candidate to the container (a real `srcset` on web). Without them, `sourceSet` is empty and the
explicit pick takes over. The lightbox always picks explicitly, because zoom decides the source.

React Native has no `srcset`, so a view picks once from its own layout:
`pickThumbnailUrl(sources, layoutPt * PixelRatio.get())` takes the narrowest derivative that
covers the need, or the widest there is.

| Surface                                          | Layout      | Source                                                                 |
| ------------------------------------------------ | ----------- | ---------------------------------------------------------------------- |
| `ComponentRow`, gallery filmstrip, `ProductCard` | 44–80pt     | `thumbnail_url` (200px) — already right at 3x                          |
| Gallery pager                                    | full width  | picked in `useProductGalleryMedia`, ~1600px on a modern phone          |
| Lightbox                                         | full screen | picked the same way, swapping to the original past `ORIGINAL_AT_SCALE` |

`useProductGalleryMedia` is the single place the screen size is known. It narrows `mediumUrl`
and `largeUrl`; pager, lightbox, and prefetch read those two fields.

## Regenerating API Types

`src/types/api.generated.ts` is generated from the backend OpenAPI schema. It is the only
supported frontend contract for the RPi camera integration; do not import or re-declare the
`relab-rpi-cam-models` Python package in frontend code.

Codegen reads the committed `src/types/openapi.json` (exported via `just backend/openapi`), so no
running backend is required:

```bash
# regenerate types from the committed schema, redact JWT examples, and format
just codegen
```

## Common Commands

```bash
just check       # lint
just test        # full Jest suite (unit + integration)
just test-unit   # fast Jest unit tests
just test-integration  # slower Jest integration tests
just test-e2e    # Playwright browser E2E
just test-ci     # CI-style Jest run with coverage
just format      # format code
just build-web   # export web build for E2E
pnpm run lint:react            # strict React hooks/compiler + Fast Refresh ESLint pass
pnpm run profile:compiler:web  # local web profiling with production/staging compiler transforms enabled
```

## Test Layers

| Layer       | Tool             | Location                          | What it covers                                                    |
| ----------- | ---------------- | --------------------------------- | ----------------------------------------------------------------- |
| Unit        | Jest + jest-expo | `src/**/*.test.ts(x)`             | Pure logic, single component, MSW-mocked.                         |
| Integration | Jest + jest-expo | `src/**/*.integration.test.ts(x)` | Multiple components wired together, realistic nav.                |
| E2E         | Playwright       | `e2e/`                            | Full-stack against the built web export + docker-compose backend. |

`just test` runs both Jest lanes. E2E requires `just build-web` and the `compose.e2e.yaml` stack.

Jest integration tests run in-memory with `jest-expo` and React Native Testing Library. They do
not replace device-native end-to-end coverage.

**Location rule:** co-locate every Jest test in a `__tests__/` folder beside the code it covers.
The filename suffix picks the lane: `.integration.test.*` runs in the integration lane, everything
else in unit. The unit lane auto-mocks `expo-router` (see `config/setup.unit.ts`); integration
tests mock it locally. Cross-cutting tests with no single home (config, security policy, theme
regressions) live in `src/__tests__/`.

**E2E environmental failures:** `just test-e2e` needs the `compose.e2e.yaml` stack running against
a clean database. Before treating a failing spec as a regression, confirm the stack is up and the
DB is freshly seeded. Do not edit specs to accommodate these:

- **"Mine" empty-state / seeded-product-not-on-page-1:** the e2e Postgres has accumulated test
  data. Reset/reseed the e2e DB.
- **OAuth sign-in specs:** `compose.e2e.yaml` does not inject Google/GitHub OAuth credentials, so
  those flows cannot complete in CI-local runs.

## Timing Jest Suites

To profile slow test files, run Jest with JSON output and inspect the report:

```bash
pnpm test -- --runInBand --json --outputFile=.jest-timings.json
```

## Styling And Theming

Styling uses Uniwind; colors, type scale, and semantic tokens come from `AppThemeProvider` (see
[Stack](#stack)). Uniwind reads `global.css` through its Metro plugin. Theme variables live in
`src/theme/brand.generated.css` as `@variant light`/`@variant dark` blocks; `Uniwind.setTheme()` in
`src/app/_layout.tsx` switches between them.

- Import theme values from `@/theme`, not from `src/assets/themes/*`

- Use `useAppTheme()` as the default hook for theme access

- Prefer semantic tokens like `theme.tokens.status.live`, `theme.tokens.text.muted`, and
  `theme.tokens.surface.accent` over raw hex or `rgba(...)` literals

- Keep static layout in `StyleSheet.create()`

- For theme-dependent styles, use small colocated factories like `createStyles(theme)`

- Keep `src/app/` route-only; router helpers belong under `src/utils/router/`

- `src/theme/` is the only supported theme entrypoint

- Shared visual primitives live under `src/components/base/`

- New hard-coded color literals in app code are regressions unless they belong in the theme layer,
  generated assets, or tests

## React Performance Profiling

Validate memoization changes in a release-like build, not only in Metro dev mode.

1. Run `pnpm run profile:compiler:web`. It starts Expo web with `ENVIRONMENT=production`, which
   enables the React Compiler locally.
1. Open the app in a browser with React DevTools and record the interaction in the Profiler tab.
1. Confirm the slow interaction in the profiler before changing memoization.
1. Re-profile after the change. Keep manual `useMemo` / `useCallback` / `React.memo` only where
   the compiled build still benefits.

`pnpm run dev` keeps compiler transforms off for faster Metro feedback.

## Build And Deploy

- **Dev (web):** `just dev`: Expo Metro on :8081.
- **Dev (native):** `pnpm android` / `pnpm ios`.
- **Web build:** `just build-web` runs `expo export -p web -c` → `dist/`.
- **Runtime:** Caddy serves `dist/` with CSP templated from `CADDY_API_ORIGIN`. The enforced
  policy keeps temporary Expo web allowances for inline/eval script execution, permits product
  embeds only from `https://www.youtube-nocookie.com`, and sends a stricter report-only policy as
  the hardening target. See [Dockerfile](Dockerfile) and [Caddyfile](Caddyfile).
- **Native releases:** not containerised; use Expo's native build flow from a developer machine.

## Lint Ownership

Biome is the primary formatter/linter, including hook ordering/dependency rules, React prop
assignment safety, and React module/export safety.

ESLint covers only what Biome does not: React hooks and compiler checks, Fast Refresh export-only
structure via `eslint-plugin-react-refresh`, and React Native accessibility rules via
`eslint-plugin-react-native-a11y`. When Biome ships equivalents, remove ESLint and its plugins.

`pnpm run lint:react` is blocking and must pass with zero warnings. It enables:

- `react-hooks/preserve-manual-memoization`
- `react-hooks/static-components`
- `react-hooks/config`
- `react-hooks/gating`
- `react-hooks/unsupported-syntax`
- `react-hooks/globals`
- `react-hooks/error-boundaries`
- `react-hooks/set-state-in-render`
- `react-refresh/only-export-components`
- `react-native-a11y/*` accessibility prop checks (see `eslint.config.mjs` for the enabled rules)

Biome does not expose an RN-specific rule surface, so RN-specific linting stops at those
accessibility rules.

## More

For emulator and device setup, testing patterns, and app-specific development notes, see
[CONTRIBUTING.md](../.github/CONTRIBUTING.md#frontend-development).
