# Backend Performance Baseline

A small `k6` suite that catches latency regressions in common backend paths.

## Covered Scenarios

| Scenario            | Path           | Enabled when                                   |
| ------------------- | -------------- | ---------------------------------------------- |
| `live_probe`        | `/live`        | always                                         |
| `product_list_read` | `/v1/products` | always                                         |
| `bearer_login`      | auth login     | `PERF_USER_EMAIL` and `PERF_USER_PASSWORD` set |
| `media_url_read`    | media URL      | `PERF_MEDIA_URL` set                           |

`just docker-ci-perf-baseline` supplies all four: it reads the first seeded product's
`thumbnail_url` from the running stack to fill `PERF_MEDIA_URL`, and fails rather than silently
skipping media coverage when the database holds no seeded images.

## How the Suite Is Shaped

Three decisions matter more than the numbers, because each one changes what is being measured.

**Scenarios run one at a time, not together.** Each stage starts after the previous one finishes
(`PERF_STAGE_SECONDS`, then a `PERF_STAGE_GAP_SECONDS` gap). Overlapping them makes every result a
measure of contention rather than endpoint cost: `bearer_login` spends 50-100ms per request inside
Argon2, and CI runs a single API worker, so a concurrent login stage inflates the tail of whatever
else is in flight. Isolated stages also vary far less between runs, which is what lets the
thresholds below sit close to observed latency without flaking.

**Load is open-model.** Scenarios use `constant-arrival-rate`, so `k6` holds the request rate steady
whatever the server does. The closed-model alternative (`constant-vus` plus `sleep`) quietly sends
*less* load as latency grows, which masks the regressions this suite exists to catch.
`dropped_iterations` is thresholded because an open-model run that cannot start iterations on time
is a saturated server, not a fast one.

**The database is not empty.** `PERF_SEED_PRODUCTS` tops the product table up (5000 rows by default
in CI) via `scripts/seed/perf_seed.py`. Against the handful of rows the dummy seed creates, the
suite cannot detect the regressions that actually hurt: a missing index, a linear `COUNT(*)`, an
eager load that degrades with row count. The generator spreads `created_at` over two years and draws
high-cardinality names, brands and models, because those columns are trigram-indexed and feed
`search_vector` — a short word list would make those indexes far more selective than production.

## Thresholds

Regression tripwires, not capacity targets. Refresh them with `just _perf-thresholds-apply
<headroom>` from a summary export rather than editing by hand.

The committed values carry roughly 5x headroom over an isolated run on a quiet developer host. That
absorbs a slower shared CI runner while still catching a real regression; the previous values sat
5-8x above *contended* numbers and would only have tripped on a catastrophic one.

## Recommended Target

Run the baseline against the Docker CI stack, which runs the backend in `testing` with the committed
credentials from `backend/.env.test`:

```bash
just docker-ci-perf-baseline           # 5000 seeded products
just docker-ci-perf-baseline 20000     # or pick a row count
```

Local runs against a host-reachable backend are distorted by laptop CPU contention and Docker
overhead. Calibrate committed thresholds from the GitHub Actions perf workflow, not from a
developer host.

## Usage

Run against a host-reachable backend:

```bash
just perf-baseline
```

Enable login coverage:

```bash
PERF_USER_EMAIL=user@example.com \
PERF_USER_PASSWORD=secret \
just perf-baseline
```

Enable media URL coverage when you have a sample uploaded media URL:

```bash
PERF_MEDIA_URL=https://api-test.cml-relab.org/uploads/images/sample.webp \
just perf-baseline
```

Target a non-local backend:

```bash
BASE_URL=https://api-test.cml-relab.org \
just perf-baseline
```

## Useful Environment Variables

- `BASE_URL`
- `PERF_PRODUCT_LIST_PATH`
- `PERF_LIVE_PATH`
- `PERF_USER_EMAIL`
- `PERF_USER_PASSWORD`
- `PERF_MEDIA_URL`
- `PERF_STAGE_SECONDS` — duration of each scenario stage (default `20`)
- `PERF_STAGE_GAP_SECONDS` — idle gap between stages (default `5`)
- `PERF_PRODUCT_LIST_RATE`, `PERF_LIVE_RATE`, `PERF_LOGIN_RATE`, `PERF_MEDIA_RATE` — requests per
  second per scenario

## Recommended Baseline Inputs

- Use `just docker-ci-perf-baseline` so the database is migrated, dummy-seeded and topped up to a
  realistic row count first.
- `live_probe` and `product_list_read` must stay runnable; the script must also pass with no media
  URL, so `PERF_MEDIA_URL` stays optional even though the CI recipe always supplies one.
- Use `/v1/products?size=20` as the product-read baseline.
- Use the CI superuser from `backend/.env.test` for login measurements.
- The `k6` image is pinned by digest. A moving `:latest` changes the measurement tool between runs,
  which is the one variable a latency baseline must hold still.

## Recording Results

`just perf-baseline` writes a raw `k6` summary to `reports/performance/latest-k6-summary.json`
(gitignored).

To recalibrate thresholds:

1. Run the `Performance Baseline` workflow with `workflow_dispatch`.
1. Download the `ops-backend-perf-baseline` artifact.
1. Run `just _perf-thresholds-apply <headroom>` against that summary export.
1. Commit the thresholds. Put key numbers in the PR description, not in dated report files.
