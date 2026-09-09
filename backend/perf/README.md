# Backend Performance Baseline

A small `k6` suite that catches latency regressions in common backend paths.

## Covered Scenarios

| Scenario            | Path           | Enabled when                                   |
| ------------------- | -------------- | ---------------------------------------------- |
| `live_probe`        | `/live`        | always                                         |
| `product_list_read` | `/v1/products` | always                                         |
| `product_search_read` | `/v1/products?search=` | always                                     |
| `product_detail_read` | `/v1/products/{id}` | always                                        |
| `product_components_read` | `/v1/products/{id}/components` | always                            |
| `reference_data_read` | `/v1/materials` | always                                            |
| `bearer_login`      | auth login     | `PERF_USER_EMAIL` and `PERF_USER_PASSWORD` set |
| `media_url_read`    | media URL      | `PERF_MEDIA_URL` set                           |
| `product_create_write` | `POST /v1/products` | `PERF_USER_EMAIL` and `PERF_USER_PASSWORD` set |
| `image_upload_write` | `POST /v1/products/{id}/images` | `PERF_USER_EMAIL` and `PERF_USER_PASSWORD` set |

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

**The write stages run last, uploads last of all.** `image_upload_write` posts through the real
multipart path, so it decodes an image and writes derivatives — the slowest endpoint in the API by
a wide margin. Malware scanning is not exercised, since ClamAV is not in use.

Iterations rotate through three photo sizes, each tagged `upload_size` and thresholded separately,
because a percentile mixed across all three hides which one moved:

| `upload_size` | dimensions  | source                                                |
| ------------- | ----------- | ----------------------------------------------------- |
| `small`       | 1200x900    | `perf/fixtures/upload-sample.jpg`, committed          |
| `medium`      | 2400x1800   | tiled from the sample by `just perf-fixtures`         |
| `large`       | 4800x3600   | tiled from the sample by `just perf-fixtures`         |

One size is not enough: at 1200x900 the 1600px derivative is skipped entirely and only ~21ms of
thumbnail work is in play, so a regression in the expensive part of the pipeline would not move the
number. From `medium` up, every standard width applies, and the derivative work the upload defers
is ~110-130ms rather than ~20ms.

The larger two are tiled from the committed sample rather than upscaled or generated: tiling repeats
the source's own frequency content, so decode, resize and encode cost per pixel stay in the range a
real photograph produces. They are gitignored and rebuilt by `just perf-fixtures`, which both perf
recipes run first — reproducible from one 87 KB source, with no multi-megabyte binaries in the repo.

The per-size thresholds are a coarse guard. Two runs of the same commit on GitHub runners put
`small` at 69 ms and 31 ms, so run-to-run variance is over 2x, and a ceiling tight enough to catch
the ~40-50 ms that re-blocking the deferred derivatives would add would flap on that variance. They
catch a gross regression; the resize path's own cost is better measured directly, without a network
and a shared runner in the number.

**The write stage runs last.** `product_create_write` inserts rows, so every read stage is measured
against a table that is not growing underneath it. `product_search_read` rotates its query terms so
the run does not measure one repeatedly cached query; it is the slowest read path, which is why it
was worth covering.

**The database is not empty, and neither is any other table.** `BULK_SEED_PRODUCTS` scales the
fixtures (5000 products by default in CI) via `scripts/seed/bulk_seed.py`, which also scales users,
product types, materials and categories with it, gives a fifth of products an image and a tenth a
component subtree. Rows come from `scripts/seed/factories` — the same polyfactory/faker factories
the test suite uses, so a row a baseline measures and a fixture a test asserts against cannot drift
apart. Generating the full set costs about 12 seconds and the seeder is idempotent, which is why
there is no pre-built fixture dump to keep in sync with the schema. Against the handful of rows the dummy seed creates, the
suite cannot detect the regressions that actually hurt: a missing index, a linear `COUNT(*)`, an
eager load that degrades with row count. The generator spreads `created_at` over two years and draws
high-cardinality names, brands and models, because those columns are trigram-indexed and feed
`search_vector` — a short word list would make those indexes far more selective than production.

It also runs `VACUUM ANALYZE` afterwards. Skipping it measures the database recovering from the
fixture load rather than steady state: planner statistics still describe an almost empty table, and
the four GIN indexes on `product` carry a full pending list. That cleanup showed up as a 6.5s p95 in
the write scenario, against a 55ms median.

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
- `PERF_SEARCH_TERMS` — comma-separated query terms the search scenario rotates through
- `PERF_DETAIL_RATE`, `PERF_COMPONENTS_RATE`, `PERF_REFERENCE_RATE`, `PERF_UPLOAD_RATE`
- `PERF_PRODUCT_LIST_RATE`, `PERF_LIVE_RATE`, `PERF_LOGIN_RATE`, `PERF_MEDIA_RATE`,
  `PERF_SEARCH_RATE`, `PERF_CREATE_RATE` — requests per second per scenario

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
