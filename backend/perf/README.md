# Backend Performance Baseline

This directory contains a small `k6` baseline suite for the RELab backend.

## Goals

- catch obvious latency regressions in common backend paths
- keep a repeatable baseline script in the repo
- avoid a heavy load-testing stack for routine checks

## Covered Scenarios

- `materials_list`
  - always enabled
  - exercises the public background-data read path
- `bearer_login`
  - enabled only when `PERF_USER_EMAIL` and `PERF_USER_PASSWORD` are set
  - exercises the auth login path
- `resized_image`
  - enabled only when `PERF_IMAGE_ID` is set
  - exercises the image resize hot path

## Thresholds

These thresholds are intentionally conservative and serve as a regression tripwire, not a capacity target.

- `materials_list`: `p(95) < 500ms`
- `bearer_login`: `p(95) < 750ms`
- `resized_image`: `p(95) < 1200ms`
- all enabled scenarios: failed request rate `< 1%`

## Usage

Run against a local backend:

```bash
k6 run perf/k6-baseline.js
```

Enable login coverage:

```bash
PERF_USER_EMAIL=user@example.com \
PERF_USER_PASSWORD=secret \
k6 run perf/k6-baseline.js
```

Enable image resize coverage:

```bash
PERF_IMAGE_ID=123 \
k6 run perf/k6-baseline.js
```

Run all scenarios together:

```bash
PERF_USER_EMAIL=user@example.com \
PERF_USER_PASSWORD=secret \
PERF_IMAGE_ID=123 \
k6 run perf/k6-baseline.js
```

Target a non-local backend:

```bash
BASE_URL=https://api-test.cml-relab.org \
k6 run perf/k6-baseline.js
```

## Useful Environment Variables

- `BASE_URL`
- `PERF_MATERIALS_PATH`
- `PERF_USER_EMAIL`
- `PERF_USER_PASSWORD`
- `PERF_IMAGE_ID`
- `PERF_IMAGE_WIDTH`
- `PERF_MATERIALS_VUS`
- `PERF_MATERIALS_DURATION`
- `PERF_LOGIN_VUS`
- `PERF_LOGIN_DURATION`
- `PERF_IMAGE_VUS`
- `PERF_IMAGE_DURATION`

## Recording Results

Save a short summary in `reports/performance/` whenever you establish or intentionally change a baseline.
