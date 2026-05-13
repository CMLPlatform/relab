# Backend Performance Baseline

This directory contains a small `k6` baseline suite for the RELab backend.

## Goals

- catch obvious latency regressions in common backend paths
- keep a repeatable baseline script in the repo
- avoid a heavy load-testing stack for routine checks

## Covered Scenarios

- `live_probe`
  - always enabled
  - exercises the liveness path via `/live`
- `product_list_read`
  - always enabled
  - exercises the public product list path via `/v1/products`
- `bearer_login`
  - enabled only when `PERF_USER_EMAIL` and `PERF_USER_PASSWORD` are set
  - exercises the auth login path
- `media_url_read`
  - enabled only when `PERF_MEDIA_URL` is explicitly set
  - exercises the media URL hot path

## Thresholds

These thresholds are intentionally conservative and serve as a regression tripwire, not a capacity target.

- `live_probe`: `p(95) < 1200ms`
- `product_list_read`: `p(95) < 1800ms`
- `bearer_login`: `p(95) < 1600ms`
- `media_url_read`: `p(95) < 1400ms`
- all enabled scenarios: failed request rate `< 1%`

## Recommended Target

Use the Docker CI stack as the canonical baseline environment.

- it runs the backend in `testing`
- it uses committed test credentials from `backend/.env.test`
- it is more repeatable than the dev stack for regression checks

Use the root perf entrypoint to manage that stack:

```bash
just docker-ci-perf-baseline
```

Treat local Docker CI runs as smoke validation, not as the source of truth for threshold calibration.

- local runs are useful for proving the workflow works end to end
- local runs are often distorted by laptop CPU contention, Docker overhead, and disk pressure
- threshold calibration should come from the GitHub Actions perf workflow, because that is the environment that will run the recurring baseline checks

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

Run all scenarios together:

```bash
PERF_USER_EMAIL=user@example.com \
PERF_USER_PASSWORD=secret \
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
- `PERF_PRODUCT_LIST_VUS`
- `PERF_PRODUCT_LIST_DURATION`
- `PERF_LIVE_VUS`
- `PERF_LIVE_DURATION`
- `PERF_LOGIN_VUS`
- `PERF_LOGIN_DURATION`
- `PERF_MEDIA_VUS`
- `PERF_MEDIA_DURATION`

## Recommended Baseline Inputs

- Use `just docker-ci-perf-baseline` so the database is seeded with stable sample products before the k6 run starts.
- `live_probe` and `product_list_read` are the baseline scenarios and must stay runnable.
- `media_url_read` is opportunistic rather than required. The baseline must still run cleanly if no media URL is provided.
- Use `/v1/products?size=20` as the default product-read baseline unless you intentionally want a different page size.
- Reuse the CI superuser from `backend/.env.test` for login measurements unless you explicitly need another account.

## Recording Results

`just perf-baseline` writes a raw `k6` summary export to `reports/performance/latest-k6-summary.json`.

After a meaningful run, save a short dated markdown summary in `reports/performance/` so the numbers are easy to review in PRs.

To recalibrate thresholds, run the `Performance Baseline` workflow with `workflow_dispatch`, download the `backend-perf-baseline-artifacts` artifact, replace `reports/performance/latest-k6-summary.json` with the artifact copy, then use the maintainer-only perf helpers in `backend/justfile` to write a dated report and refresh thresholds in `perf/k6-baseline.js`. Commit the dated report and updated thresholds together.

Report writing and threshold refresh are maintenance operations, not routine commands. They are available as hidden backend `just` recipes to keep the public task surface small.

## Measurement Scope

- `/v1/products` is part of the baseline because it is a supported public catalog read, not an internal implementation detail.
- The perf workflow must not depend on embedded image data in `/v1/products`; the baseline must run cleanly even when no seeded media URL is present.
