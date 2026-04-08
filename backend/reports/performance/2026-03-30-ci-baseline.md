# 2026-03-30 CI Baseline

- environment: Docker CI backend at `http://backend:8000`
- source summary: `reports/performance/latest-k6-summary.json`
- enabled scenarios: `product_tree_read`, `bearer_login`, `resized_image`

## Results

- `product_tree_read`: avg `1.28s`, p95 `4.33s`, failed requests `100.00%`
- `bearer_login`: avg `1.25s`, p95 `3.54s`, failed requests `100.00%`
- `resized_image`: avg `1.08s`, p95 `3.10s`, failed requests `100.00%`
- overall HTTP: avg `1.23s`, p95 `4.02s`

## Notes

- This file was generated from the latest CI-stack `k6` summary export.
- If these numbers replace the prior baseline, keep older docker-dev reports as historical context only.
- Re-run `just perf-thresholds-apply` if you intentionally want the thresholds to track this new baseline.
