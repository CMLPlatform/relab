# 2026-04-16 CI Baseline

- environment: Docker CI backend at `http://api:8000`
- source summary: `reports/performance/latest-k6-summary.json`
- enabled scenarios: `live_probe`, `product_tree_read`, `bearer_login`, `resized_image`

## Results

- `live_probe`: avg `31.94ms`, p95 `124.63ms`, failed requests `0.00%`
- `product_tree_read`: avg `251.21ms`, p95 `750.81ms`, failed requests `0.00%`
- `bearer_login`: avg `243.10ms`, p95 `689.92ms`, failed requests `0.00%`
- `resized_image`: avg `102.23ms`, p95 `375.46ms`, failed requests `0.00%`
- overall HTTP: avg `175.64ms`, p95 `539.62ms`

## Notes

- This file was generated from the latest CI-stack `k6` summary export.
- `resized_image` is optional and only runs when a sample image is available.
- If these numbers replace the prior baseline, keep older reports as historical context only.
- Threshold refresh remains a maintainer-only follow-up step.

