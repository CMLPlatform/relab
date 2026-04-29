# Architecture

High-level map of `frontend-app`.

## Stack

- **Runtime:** Expo SDK 55, React 19, React Native 0.83, React Native Web.
- **Routing:** [Expo Router](https://docs.expo.dev/router/introduction/) (file-based, typed routes).
- **Data fetching:** [TanStack Query](https://tanstack.com/query) against a
  FastAPI backend. Types are generated from the backend's OpenAPI schema.
- **Client state:** [Zustand](https://zustand-demo.pmnd.rs/) stores, scoped per
  feature.
- **Forms:** React Hook Form + Zod resolvers.
- **UI kit:** React Native Paper (Material 3 theming).
- **Compiler:** React Compiler enabled via `babel-plugin-react-compiler`.

## Source layout

```
src/
├── app/              # Expo Router tree — one file per route.
├── components/       # Feature folders (auth, cameras, product, profile, common, base).
├── hooks/            # Cross-feature custom hooks.
├── services/         # Backend integration: api/, media/, storage, domain stores.
├── context/          # React context providers (auth session, theme, etc.).
├── types/            # Hand-written types + api.generated.ts (do not edit).
├── constants/        # Static values (routes, colors, env-derived constants).
├── utils/            # Pure helpers, no React.
├── test-utils/       # Shared test fixtures, MSW handlers, render helpers.
├── assets/           # Fonts, images, icons.
└── public/           # Files copied verbatim into the web export.
```

`base/` components are generic primitives; `common/` are app-wide composites;
the rest are domain-scoped. Keep imports flowing inward (features may use
`base`/`common`, not the reverse).

## Routing

`src/app/` is the Expo Router tree. Groups in parens (`(auth)`) don't affect
the URL. Layouts (`_layout.tsx`) wrap their siblings. Typed routes are on, so
links are type-checked against the file tree. Routes for auth, cameras,
products, profile, users live directly under `src/app/`.

## Data flow

1. Backend exposes OpenAPI at `$EXPO_PUBLIC_API_URL/openapi.json`; runtime API helpers append `/v1` for application routes.
1. `just codegen` regenerates [src/types/api.generated.ts](src/types/api.generated.ts)
   and runs `scripts/redact_api.js` to strip JWT examples before commit.
1. Request helpers live in [src/services/api](src/services/api); feature hooks
   wrap them with TanStack Query, returning typed data.
1. MSW handlers in `src/test-utils/` mock the same surface in unit/integration
   tests so component code is identical in prod and test.

Client-only state (wizard progress, transient UI) lives in Zustand stores
co-located with the feature when needed. Server state stays in TanStack Query —
don't mirror it into Zustand.

## Testing layers

| Layer       | Tool             | Location                          | What it covers                                                    |
| ----------- | ---------------- | --------------------------------- | ----------------------------------------------------------------- |
| Unit        | Jest + jest-expo | `src/**/*.test.ts(x)`             | Pure logic, single component, MSW-mocked.                         |
| Integration | Jest + jest-expo | `src/**/*.integration.test.ts(x)` | Multiple components wired together, realistic nav.                |
| E2E         | Playwright       | `e2e/`                            | Full-stack against the built web export + docker-compose backend. |

Run via `just test-unit`, `just test-integration`, `just test-e2e`. See
[README.md](README.md) for profiling tips.

## Build & deploy

- **Dev (web):** `just dev` — Expo Metro on :8081.
- **Dev (native):** `pnpm android` / `pnpm ios`.
- **Web build:** `just build-web` runs `expo export -p web -c` → `dist/`.
- **Runtime:** Caddy serves `dist/` with CSP templated from
  `CSP_API_ORIGIN`. See [Dockerfile](Dockerfile) and [Caddyfile](Caddyfile).
- **Native releases:** not containerised; use Expo's native build flow from a
  developer machine.

## Linting ownership

Biome is primary (formatting + most correctness). ESLint runs a narrow config
for rules Biome doesn't yet expose (`react-hooks/*`, `react-refresh`). This is
intentional overlap — see the "Lint Ownership" section of
[README.md](README.md). When Biome ships the hooks/refresh rules, remove
ESLint and its plugins.
