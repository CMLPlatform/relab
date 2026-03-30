# Backend Performance Baseline

This directory contains a small `k6` baseline suite for the RELab backend.

## Goals

- catch obvious latency regressions in common backend paths
- keep a repeatable baseline script in the repo
- avoid a heavy load-testing stack for routine checks

## Covered Scenarios

- `product_tree_read`
  - always enabled
  - exercises the public recursive product read path via `/products/tree`
- `bearer_login`
  - enabled only when `PERF_USER_EMAIL` and `PERF_USER_PASSWORD` are set
  - exercises the auth login path
- `resized_image`
  - enabled only when `PERF_IMAGE_ID` is set
  - exercises the image resize hot path

## Thresholds

These thresholds are intentionally conservative and serve as a regression tripwire, not a capacity target.

- `product_tree_read`: `p(95) < 3800ms`
- `bearer_login`: `p(95) < 3400ms`
- `resized_image`: `p(95) < 3400ms`
- all enabled scenarios: failed request rate `< 1%`

## Recommended Target

Use the Docker CI stack as the canonical baseline environment.

- it runs the backend in `testing`
- it uses committed test credentials from `backend/.env.test`
- it is more repeatable than the dev stack for regression checks

Use the root recipes to manage that stack:

```bash
just docker-ci-build
just docker-ci-backend-up
just docker-ci-migrate-dummy
just docker-ci-perf-baseline
```

Treat local Docker CI runs as smoke validation, not as the source of truth for threshold calibration.

- local runs are useful for proving the workflow works end to end
- local runs are often distorted by laptop CPU contention, Docker overhead, and disk pressure
- threshold calibration should come from the GitHub Actions perf workflow, because that is the environment that will run the recurring baseline checks

The backend-local recipe also works once the CI stack is already up:

```bash
just perf-ci
```

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

Enable image resize coverage:

```bash
PERF_IMAGE_ID=123 \
just perf-baseline
```

Run all scenarios together:

```bash
PERF_USER_EMAIL=user@example.com \
PERF_USER_PASSWORD=secret \
PERF_IMAGE_ID=123 \
just perf-baseline
```

Target a non-local backend:

```bash
BASE_URL=https://api-test.cml-relab.org \
just perf-baseline
```

## Useful Environment Variables

- `BASE_URL`
- `PERF_PRODUCT_TREE_PATH`
- `PERF_USER_EMAIL`
- `PERF_USER_PASSWORD`
- `PERF_IMAGE_ID`
- `PERF_IMAGE_WIDTH`
- `PERF_PRODUCT_TREE_VUS`
- `PERF_PRODUCT_TREE_DURATION`
- `PERF_LOGIN_VUS`
- `PERF_LOGIN_DURATION`
- `PERF_IMAGE_VUS`
- `PERF_IMAGE_DURATION`

## Recommended Baseline Inputs

- Use the Docker CI stack plus `just docker-ci-migrate-dummy` so the database contains stable sample products and images.
- Use `/products/tree?recursion_depth=2` as the default product-read baseline unless you intentionally want a deeper tree.
- Reuse the CI superuser from `backend/.env.test` for login measurements unless you explicitly need another account.

## Recording Results

`just perf-baseline` writes a raw `k6` summary export to `reports/performance/latest-k6-summary.json`.

After a meaningful run, save a short dated markdown summary in `reports/performance/` so the numbers are easy to review in PRs.

The current thresholds are provisional and were first calibrated from a dockerized baseline captured on `2026-03-30`. Recalibrate them after the first canonical CI-stack baseline capture.

## Make CI The Baseline

Use this flow to replace the historical docker-dev baseline with a canonical CI-stack baseline.

For local work, use the Docker CI stack only to validate the mechanics:

1. Build and start the CI stack:
   `just docker-ci-build`
   `just docker-ci-backend-up`
1. Seed stable sample data:
   `just docker-ci-migrate-dummy`
1. Run the baseline:
   `just docker-ci-perf-baseline`

Then use GitHub Actions as the calibration source of truth:

1. Run the `Performance Baseline` workflow with `workflow_dispatch`.
1. Download the `backend-perf-baseline-artifacts` artifact from that run.
1. Replace `reports/performance/latest-k6-summary.json` locally with the artifact copy from GitHub.
1. Write the dated CI report:
   `just docker-ci-perf-report`
1. If those GitHub CI numbers should become the new regression baseline, apply a modest headroom factor:
   `just docker-ci-perf-thresholds`
1. Rerun the workflow or a local Docker CI smoke run to confirm the refreshed thresholds behave as expected.
1. Commit the new dated CI report and the updated thresholds in `perf/k6-baseline.js`.

Treat that new CI report as the canonical baseline and keep older docker-dev reports only as historical context.
