# 2026-03-30 Initial Docker Baseline

- environment: dockerized backend at `http://127.0.0.1:8011`
- command:
  `BASE_URL=http://127.0.0.1:8011 PERF_USER_EMAIL=test@example.com PERF_USER_PASSWORD=password PERF_IMAGE_ID=5e5d6f72-7706-43d6-b97f-28855efd4fcf just perf-baseline`
- enabled scenarios: `product_tree_read`, `bearer_login`, `resized_image`
- raw summary export: `reports/performance/latest-k6-summary.json`

## Results

- `product_tree_read`: avg `878.59ms`, p95 `3.28s`, failed requests `0.00%`
- `bearer_login`: avg `730.67ms`, p95 `2.92s`, failed requests `0.00%`
- `resized_image`: avg `582.87ms`, p95 `2.90s`, failed requests `0.00%`
- overall HTTP: avg `771.05ms`, p95 `3.34s`

## Notes

- This capture predates the switch to using the Docker CI stack as the canonical perf target.
- The initial placeholder thresholds were too aggressive for this environment and failed on the first capture.
- Thresholds were recalibrated to modest headroom above this baseline so the suite catches obvious regressions without failing by default on a known-good Docker environment.
- Product tree and image IDs came from existing seeded/sample dockerized data.
- Future dated reports should use `just docker-ci-perf-baseline` from the repo root or `just perf-ci` from `backend/`.
