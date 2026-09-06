# Backend Performance Baseline

A small `k6` suite that catches latency regressions in common backend paths.

## Covered Scenarios

| Scenario            | Path           | Enabled when                                   |
| ------------------- | -------------- | ---------------------------------------------- |
| `live_probe`        | `/live`        | always                                         |
| `product_list_read` | `/v1/products` | always                                         |
| `bearer_login`      | auth login     | `PERF_USER_EMAIL` and `PERF_USER_PASSWORD` set |
| `media_url_read`    | media URL      | `PERF_MEDIA_URL` set                           |

## Thresholds

Regression tripwires, not capacity targets.

- `live_probe`: `p(95) < 1200ms`
- `product_list_read`: `p(95) < 1800ms`
- `bearer_login`: `p(95) < 1600ms`
- `media_url_read`: `p(95) < 1400ms`
- all enabled scenarios: failed request rate `< 1%`

## Recommended Target

Run the baseline against the Docker CI stack, which runs the backend in `testing` with the
committed credentials from `backend/.env.test`:

```bash
just docker-ci-perf-baseline
```

Local runs are distorted by laptop CPU contention and Docker overhead. Calibrate thresholds from the
GitHub Actions perf workflow, which runs the recurring checks.

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

- Use `just docker-ci-perf-baseline` so the database is seeded with stable sample products first.
- `live_probe` and `product_list_read` must stay runnable; the baseline must also pass with no media
  URL.
- Use `/v1/products?size=20` as the product-read baseline.
- Use the CI superuser from `backend/.env.test` for login measurements.

## Recording Results

`just perf-baseline` writes a raw `k6` summary to `reports/performance/latest-k6-summary.json`
(gitignored).

To recalibrate thresholds:

1. Run the `Performance Baseline` workflow with `workflow_dispatch`.
1. Download the `backend-perf-baseline-artifacts` artifact.
1. Refresh `perf/k6-baseline.js` with the hidden perf helper recipes in `backend/justfile`.
1. Commit the thresholds. Put key numbers in the PR description, not in dated report files.
