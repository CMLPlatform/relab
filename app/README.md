# Relab App

The `app` subrepo contains the Expo / React Native app used for authenticated data collection.

## Quick Start

```bash
just install
just dev
```

The Expo dev server runs on <http://127.0.0.1:8011>.

You will usually want the backend running as well. If the API is not on localhost, set
`EXPO_PUBLIC_API_URL` in `.env.local`.

Docker development ports are localhost-only. If you want to open the Expo app from another phone,
tablet, or computer on your LAN, run the Expo server directly from this subrepo with `just dev`
instead of using the Docker app service.

## Stack

- **Runtime:** Expo SDK 57, React 19, React Native 0.86, React Native Web.
- **Routing:** [Expo Router](https://docs.expo.dev/router/introduction/) (file-based, typed routes).
- **Data fetching:** [TanStack Query](https://tanstack.com/query) against a
  FastAPI backend. Types are generated from the backend's OpenAPI schema.
- **Client state:** React context + feature-local hooks/reducers.
- **Forms:** React Hook Form + Zod resolvers.
- **UI kit:** Uniwind (Tailwind v4 for React Native) + vendored react-native-reusables
  primitives in src/components/base/.
  Theme (colors, type scale, semantic tokens) is delivered via `AppThemeProvider`/`useAppTheme()`
  (src/theme/); react-native-paper is not used — do not reintroduce it.
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

Adoption of that kit is deliberately partial. Call sites use a vendored primitive directly when its
look and behavior are what they want (`ui/input` in Searchbar and capture, `ui/badge` for read-only
tags, `ui/button`, `ui/text`). The hand-rolled `base/` components that look like counterparts —
`TextInput`, `InfoTooltip`, `Chip`, `AppDialog`, `Menu` — each carry behavior the primitive does
not (theme-driven error states, auto-dismiss and a mobile-web modal fallback, pressable two-segment
pills, RN-core Modal focus traps and anchor measuring). Each was assessed in August 2026 as a
net-addition if rewritten on the primitive. Each keeps a dated `NOTE:` at the top recording that;
re-open the question only when the primitive gains the missing behavior.

## Routing

`src/app/` is the Expo Router tree. Groups in parens (`(auth)`) don't affect
the URL. Layouts (`_layout.tsx`) wrap their siblings. Typed routes are on, so
links are type-checked against the file tree.

For the full screen inventory, the sign-in and capture flows as diagrams, and
the rules a routing change has to keep, see
[App navigation flow](https://docs.cml-relab.org/architecture/app-flow/) in the
docs site. This section stays as the in-tree summary.

The three primary destinations are tabs: `(tabs)/(products)`,
`(tabs)/(cameras)` and `(tabs)/(account)`, each a group holding its own Stack,
so every tab keeps its trail while you are on another one. BottomNav is that
navigator's `tabBar`. The products tab owns both the `/products` and
`/components` trees — a component is a product's child, and cards, breadcrumbs
and post-create redirects hop between them constantly; splitting them across
navigators would make every hop a cross-navigator `replace`, which React
Navigation resolves by swapping the whole tab navigator out and resetting every
tab. For the same reason, a link that leaves one tab for another must use
`navigate`, never `replace`. The root stack keeps only what sits outside the
tabs: the entry redirect, `(auth)`, `category-selection` and `users/[username]`.

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

Client-only state (wizard progress, transient UI) lives in feature-local
hooks/reducers or React context. Server state stays in TanStack Query; don't
mirror it into client state stores.

### Picking an image size

Read schemas carry `thumbnail_url` (the 200px list thumbnail) *and*
`thumbnail_urls`, the API's pre-computed derivatives keyed by width — 200/800/1600, generated at
upload, minus any width at or above the original, so the map is sparse. `resolveApiMediaUrlMap`
resolves it through the same safety checks as any other media URL.

Read schemas also carry `width_px`/`height_px` — the stored original's size after EXIF rotation,
recorded at upload from the header the processor already parses. Every derivative is a scaled copy,
so they all share that aspect ratio and each one's height follows from its width. Rows uploaded
before the columns existed are null until
`python -m scripts.maintenance.backfill_image_dimensions` measures them.

With dimensions, the gallery pager hands expo-image a `source` **array** and lets it match the
candidate to the container at the screen's scale — which becomes a real `srcset` on web. Without
them a width-only array would leave that selection guessing, so `sourceSet` is empty and the
explicit pick below takes over. The lightbox always picks explicitly: there, zoom decides the
source, not the container.

React Native has no `srcset`, so a view picks once from its own known layout:
`pickThumbnailUrl(sources, layoutPt * PixelRatio.get())` takes the narrowest derivative that
covers the need, or the widest there is. Where each surface lands today:

| Surface                                          | Layout      | Source                                                                 |
| ------------------------------------------------ | ----------- | ---------------------------------------------------------------------- |
| `ComponentRow`, gallery filmstrip, `ProductCard` | 44–80pt     | `thumbnail_url` (200px) — already right at 3x                          |
| Gallery pager                                    | full width  | picked in `useProductGalleryMedia`, ~1600px on a modern phone          |
| Lightbox                                         | full screen | picked the same way, swapping to the original past `ORIGINAL_AT_SCALE` |

`useProductGalleryMedia` is the single place the screen size is known, so it narrows `mediumUrl`
and `largeUrl` there and every consumer downstream — pager, lightbox, prefetch — keeps reading the
same two fields. Both tiers previously pointed at the raw upload, which is never downscaled on the
way in, so opening a gallery pulled several megabytes per image and prefetched that for every
image in the product.

## Regenerating API Types

The TypeScript API types are autogenerated from the backend OpenAPI schema and written to
`src/types/api.generated.ts`.

That generated OpenAPI output is the only supported frontend contract for the
RPi camera integration. The private backend\<->plugin seam lives in the
published `relab-rpi-cam-models` Python package and should not be imported or
re-declared directly in frontend code.

Codegen reads the committed `src/types/openapi.json` (exported by the backend
via `just backend/openapi`), so no running backend is required:

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

Jest integration tests run in-memory with `jest-expo` and React Native Testing Library. They are
broader than unit tests, but they are not a substitute for device-native end-to-end coverage.

**Location rule:** co-locate every Jest test in a `__tests__/` folder beside the
code it covers; the Jest lane is chosen by the filename **suffix**, not the
folder (`.integration.test.*` → integration lane, everything else → unit). The
unit lane auto-mocks `expo-router` (see `config/setup.unit.ts`); the integration
lane doesn't, so integration tests mock it locally. Root-level/cross-cutting
tests with no single home (config, security policy, theme regressions) live in
`src/__tests__/`.

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

## Timing Jest Suites

To profile slow test files, run Jest with JSON output and inspect the report:

```bash
pnpm test -- --runInBand --json --outputFile=.jest-timings.json
```

## Styling And Theming

Styling in `app` is built on Uniwind, with colors, type scale, and semantic tokens delivered
through `AppThemeProvider` (see [Stack](#stack)). Uniwind reads `global.css` through its Metro
plugin; theme variables live in `src/theme/brand.generated.css` as `@variant light`/`@variant dark`
blocks, and `Uniwind.setTheme()` in `src/app/_layout.tsx` is what switches between them.

- Import theme values from `@/theme`, not from `src/assets/themes/*`
- Use `useAppTheme()` as the default hook for theme access
- Prefer semantic tokens like `theme.tokens.status.live`, `theme.tokens.text.muted`, and
  `theme.tokens.surface.accent` over raw hex or `rgba(...)` literals
- Keep static layout in `StyleSheet.create()`
- For theme-dependent styles, use small colocated factories like `createStyles(theme)`
- Keep `src/app/` route-only; router helpers belong under `src/utils/router/`

In practice, that means:

- `src/theme/` is the only supported theme entrypoint
- shared visual primitives should live under `src/components/base/`
- new hard-coded color literals in app code should be treated as regressions unless they belong in
  the theme layer, generated assets, or tests

## React Performance Profiling

Memoization changes in this app should be validated in a release-like build, not only in Metro dev
mode.

1. Run `pnpm run profile:compiler:web` to start Expo web with `ENVIRONMENT=production`, which keeps
   the React Compiler enabled locally without changing the normal `dev` workflow.
1. Open the app in a browser with React DevTools installed and record the interaction in the
   Profiler tab.
1. Confirm the slow interaction in the profiler before changing memoization.
1. Re-profile after the change and keep manual `useMemo` / `useCallback` / `React.memo` only where
   the compiled build still benefits.

The default `pnpm run dev` flow keeps compiler transforms off for faster Metro feedback while you
iterate.

## Build And Deploy

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

## Lint Ownership

Biome is the primary formatter/linter for this app, including the React rules it supports:

- hook ordering and dependency linting
- React prop assignment safety
- general React module/export safety where configured

ESLint is intentionally narrow: it covers the React hooks and compiler checks that Biome does not
handle, Fast Refresh export-only structure via `eslint-plugin-react-refresh`, and a small set of
React Native accessibility rules via `eslint-plugin-react-native-a11y`. This overlap is deliberate;
when Biome ships equivalents for these rules, remove ESLint and its plugins.

The React ESLint pass is blocking, not advisory. `pnpm run lint:react` must pass with zero warnings.

Key ESLint coverage includes:

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

Beyond those accessibility rules, React Native-specific linting is intentionally minimal: Biome does
not expose an RN-specific rule surface.

## More

For emulator and device setup, testing patterns, and app-specific development notes, see
[CONTRIBUTING.md](../.github/CONTRIBUTING.md#frontend-development).
