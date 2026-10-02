# Contributing to Relab

Relab is a research platform developed at CML, Leiden University. This page covers code and
documentation changes. To run or deploy the stack, see
[Install and self-host](https://docs.cml-relab.org/operations/install/).

## Start Here

| I want to...                            | Start here                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------- |
| get the recommended working environment | [Devcontainer Setup](#devcontainer-setup)                                   |
| run the full stack locally in Docker    | [Docker Development](#docker-development)                                   |
| work on one subrepo directly            | [Local Development](#local-development)                                     |
| understand the system first             | [docs.cml-relab.org/architecture](https://docs.cml-relab.org/architecture/) |
| understand config ownership             | [Tooling and configuration](#tooling-and-configuration)                     |

## Code of Conduct

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Devcontainer Setup

The recommended path if you use VS Code. You need
[VS Code](https://code.visualstudio.com/), [Docker Desktop](https://docs.docker.com/get-docker/),
and the
[Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).

1. Clone the repository.
1. Reopen it in the `relab-fullstack` devcontainer.
1. Follow [Docker Development](#docker-development) from inside the container.

| Configuration     | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `relab-fullstack` | primary onboarding path for full stack development |
| `relab-backend`   | focused backend work                               |
| `relab-app`       | focused Expo app work                              |
| `relab-www`       | focused public site work                           |
| `relab-docs`      | focused docs work                                  |

The dev stack publishes the API on <http://127.0.0.1:8010>, the app on 8011, the docs on 8012, and
the landing site on 8013, plus PostgreSQL on `5432` and Redis on `6379`, all on localhost.

## Docker Development

Runs the full stack without configuring each subrepo. Follow
[Local Docker setup](https://docs.cml-relab.org/operations/install/#local-docker-setup) in the
install guide: it covers the secret files, the optional `backend/.env.dev`, migrations, and the
service URLs. Then:

```bash
just dev-up       # start without file watching
just dev-logs     # tail logs
just dev-down     # stop containers
```

## Local Development

Work on one subrepo without Docker. Install [Git](https://git-scm.com/),
[uv](https://docs.astral.sh/uv/getting-started/installation), [just](https://just.systems/man/en/),
and, for the frontend subrepos, Node.js at the version in `.node-version`. Then:

```bash
git clone https://github.com/CMLPlatform/relab
cd relab
just setup
```

Each subrepo README has its own quick start: [backend](../backend/README.md), [app](../app/README.md),
[www](../www/README.md), and [docs](../docs/README.md). Run `just --list` in any directory to see its
recipes.

## Tooling and Configuration

Every tool version is pinned exactly once, in the file the tool itself reads. CI installs what these
files say, so a bad upstream release is a one-line rollback rather than a mystery. Renovate keeps
them current through the `repo-tooling` group.

| Tool             | Pinned in                    | Read by                            |
| ---------------- | ---------------------------- | ---------------------------------- |
| Node.js          | `.node-version`              | `fnm` locally, CI setup            |
| pnpm             | `package.json` packageManager | standalone pnpm locally, CI setup |
| Python, uv, just | `.tool-versions`             | CI setup (uv manages Python)       |

Node 25 dropped the bundled Corepack, and `.node-version` pins a newer Node, so a fresh install has
no `pnpm` on PATH and `corepack enable` fails. Install pnpm standalone
(`curl -fsSL https://get.pnpm.io/install.sh | sh -`); it reads the pinned `packageManager` version
from `package.json`.

Do not duplicate exact versions in docs unless a manifest or generated file requires it.

Each configuration surface has one job:

- root `justfile`: repo-wide orchestration and cross-project workflows
- subrepo `justfile`: local commands for one project
- `pyproject.toml`: Python dependencies and Python tool configuration
- `pnpm-workspace.yaml`: JavaScript workspace membership, package-manager policy, and shared tooling
  catalogs
- `package.json`: JavaScript package dependencies and script wrappers
- env files: runtime and build-time configuration only
- GitHub workflow YAML: CI/CD wiring; move complex logic to versioned scripts
- `.pre-commit-config.yaml`: git hooks, run by [`prek`](https://github.com/j178/prek) (a drop-in
  replacement for `pre-commit`): secret guard, staged-file fixers (Ruff, rumdl, shfmt), file hygiene,
  lockfile sync, commit message. `just setup` installs them; `just pre-commit` runs them over every
  file
- `scripts/browser_js_policy.py`: the browser JavaScript policy (no raw HTML sinks, no third-party
  runtime scripts) for `app/`, `www/`, and `docs/`; runs in `just check-root`

Three layers, each check in one of them: hooks fix and guard staged files, `just check*` and
`just test*` verify, and CI calls those same recipes plus the GitHub-only scanners (CodeQL, Trivy,
Scorecard, dependency review). Do not add a verification to the hooks; add it to the recipe CI
already runs.

Keep new settings in the smallest surface that needs them. If a change adds or renames env vars,
update the examples, validation rules, and affected docs in the same PR.

## Quality Controls

Run the relevant subrepo checks before opening a pull request:

- backend: unit or integration tests, Ruff, and `ty`
- app: Jest, TypeScript, and lint checks
- www: Vitest, Astro checks, and Playwright where browser behavior changes
- docs: Biome, Astro checks, and `just test-ci` (build + browser + link checks) when content changes

To run one test file or pattern, pass it through: `just backend/test tests/unit/core -k cache`,
`just app/test src/hooks`, or `just www/test src/lib`.

For cross-repo or policy changes, also run `just ci` from the root. The root recipes form one
ladder, cheapest first:

| Recipe         | What it runs                                                                |
| -------------- | --------------------------------------------------------------------------- |
| `just fix`     | auto-fix lint, formatting, and markdown across root and subrepos            |
| `just check`   | static analysis only: lint, types, format verification                      |
| `just test`    | every test suite except the browser and Docker ones                         |
| `just ci`      | the everyday local gate: `pre-commit` hooks, `check`, `test-ci`, `policy-check` |
| `just ci-full` | everything GitHub Actions runs: `ci` plus `audit`, `cloudflare-check`, `docker-smoke`, `test-e2e` |

Pull requests also run `cloudflare-check`, the www E2E suite, and `docker-smoke`, so a green
`just ci` can still leave a red PR check. `just ci-full` covers them; it takes tens of minutes and
needs Docker. Only CodeQL, Trivy, Scorecard, and dependency review stay GitHub-only: they scan built
images or the repository itself.

On a pull request, the subrepo jobs, their Docker smoke legs, and the CodeQL languages run only for
the subrepos the diff touches (`scripts/ci_changed_areas.py`). A change outside the four subrepos
runs everything, as does a push to `main`.

### Accessibility

Every axe scan uses the same WCAG 2.0-2.2 A/AA rule tags and strips animations for deterministic
runs. `target-size` (2.5.8) is the only 2.2-only rule axe-core ships and it is enforced; 2.4.11 Focus
Not Obscured and 2.4.13 Focus Appearance have no axe rule and are checked by hand.

| Surface | Runtime axe scan                                                                                    | Static lint (every PR)                           |
| ------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `www/`  | landing + privacy, contrast checked; ARIA landmark snapshots: `just www/test-e2e`                   | Biome `a11y`                                     |
| `docs/` | homepage + getting-started `<main>`, contrast checked; snapshots: `just docs/test-e2e`              | Biome `a11y`                                     |
| `app/`  | products list + detail on the Expo web build (`color-contrast` off): `just test-e2e-full-stack` | Biome `a11y` + `eslint-plugin-react-native-a11y` |

The `www/` and `docs/` axe scans gate every PR that touches `www/`, `docs/`, or shared files. The
`app/` scan needs the full Docker backend, so it runs post-merge or on demand; per PR, the app relies
on `eslint-plugin-react-native-a11y`, which validates RN accessibility props on each lint run. See
[ci.yml](workflows/ci.yml).

A passing run is a floor, not proof of WCAG conformance. The `app/` scan runs against the
react-native-web build, so it does not exercise native VoiceOver/TalkBack. Two `app/` lint rules are
deferred pending a labelling pass (`has-valid-accessibility-descriptors`,
`has-valid-accessibility-ignores-invert-colors`, see `../app/eslint.config.mjs`).

## Security

For changes that touch authentication, authorization, uploads, device flows, admin APIs, secrets, or
personal data, include security context in the pull request and update the relevant docs if behavior
changes. See [SECURITY.md](SECURITY.md) for the reviewer checklist.

Use `just security` for local diagnosis.

CI runs CodeQL once a pull request leaves draft and dependency review on every pull request. The
container image scans (Trivy) run after merge and on the weekly schedule, not per pull request:
Docker smoke already proves the images build, and base-image advisories move faster than images
rebuild. After a merge a finding is reported without failing the run; the weekly and manual runs
fail on it. Run `just security` before marking a pull request ready to get that signal early.

## Backend Development

[backend/README.md](../backend/README.md) has the backend quick start, the migration commands, and
the email templates. [backend/tests/README.md](../backend/tests/README.md) describes the test tiers
and their fixtures:

```bash
cd backend
just test-unit
just test-integration-db
just test-api
just test-flows
just test-ci
```

### OpenAPI Examples

- Domain-specific examples go in `examples.py` (e.g., `backend/app/api/data_collection/examples.py`)
- Cross-domain examples go in `backend/app/api/common/openapi_examples.py`
- Use `*_EXAMPLE` for single payloads, `*_EXAMPLES` for schema lists, `*_OPENAPI_EXAMPLES` for
  FastAPI named maps
- In routers, pass examples via `openapi_examples=...` parameter
- Update `backend/tests/integration/api/test_openapi_endpoints.py` when changing examples

After backend API changes, run `just app/codegen` to regenerate the app's TypeScript types.

### Schema Changes

Drop or rename a column one release after the code stops reading it, never in the same release.
A code-only rollback runs the previous release's images against the current schema, so that schema
must still hold everything the previous release reads. When a release does drop something the
previous one reads, its upgrade notes and the rollback section of
[deploy/DEPLOY-PROD.md](../deploy/DEPLOY-PROD.md) must name the revision a rollback has to
downgrade to.

The chain was flattened once, on 2026-09-08, into the single revision `a9c2e4f60b18`. Write new
revisions on top of it as usual. A future flatten repeats the same recipe:

1. Keep the current head's revision id, so deployed databases stay at a revision that still
   resolves.
1. Replace the chain below it with one revision that builds the schema from scratch.
1. Prove the result with a `pg_dump --schema-only` diff between a database built from the old chain
   and one built from the new revision.
1. Drop the data migrations rather than folding them in: a fresh build has no rows for them to
   touch.

## Frontend Development

- `app` uses Biome, ESLint for the React and accessibility rules, and TypeScript
- `www` uses Biome and Astro validation
- follow the existing folder structure and naming patterns
- prefer consistency with the current UI and component patterns over novelty

When adding a new public-facing page to `www`, add at least one browser test. When adding app
behavior in `app`, add Jest coverage for the new logic or screen behavior. The
[app](../app/README.md) and [www](../www/README.md) READMEs list their test commands.

## Docs Development

- write plainly
- avoid hype, filler, and brittle implementation detail
- prefer Markdown and Mermaid over custom HTML

Before opening a docs pull request, run `just fix` and `just check` in `docs/`.

## Development Workflow

If you are new to the repo, start with the architecture docs before making structural changes.

### Pull Requests

1. Create a branch.

   ```bash
   git checkout -b feature/your-change
   ```

1. Make the change.

1. Run the relevant checks.

   ```bash
   just ci
   ```

1. Push your branch.

1. Open a pull request.

1. Address review feedback.

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<scope>): <short summary>
```

### Releases

1. `just release-prep 0.4.0` branches `release/v0.4.0` from `origin/main`, bumps every version
   file, and drafts the version's CHANGELOG section from the commits since the last tag.
1. Rewrite that section for readers, commit, and open a PR. Its description is yours: put
   one-time upgrade steps there and in the release notes.
1. After the merge, `just release-publish 0.4.0` drafts the GitHub release from the section.
1. Publish the draft. That creates the `v0.4.0` tag and starts `release.yml`, which publishes the
   images to GHCR and deploys the sites. Every job in the `staging` and `prod` GitHub Environments
   waits for a required reviewer: approve staging, check it, then approve prod.

## License

By contributing, you agree that your contributions are licensed under the project
[LICENSE](../LICENSE).
