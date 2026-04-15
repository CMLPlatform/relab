"""Refresh k6 p95 thresholds from the latest summary export."""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path


def main() -> None:
    headroom = float(sys.argv[1]) if len(sys.argv) > 1 else 1.15
    summary_path = Path("reports/performance/latest-k6-summary.json")
    target_path = Path("perf/k6-baseline.js")

    if not summary_path.exists():
        raise SystemExit(f"Missing summary export: {summary_path}")

    data = json.loads(summary_path.read_text())
    metrics = data["metrics"]
    target_text = target_path.read_text()

    scenario_limits = {
        "product_tree_read": math.ceil(float(metrics["http_req_duration{scenario:product_tree_read}"]["p(95)"]) * headroom / 100) * 100,
        "bearer_login": math.ceil(float(metrics["http_req_duration{scenario:bearer_login}"]["p(95)"]) * headroom / 100) * 100,
        "resized_image": math.ceil(float(metrics["http_req_duration{scenario:resized_image}"]["p(95)"]) * headroom / 100) * 100,
    }

    patterns = {
        "product_tree_read": r'(http_req_duration\{scenario:product_tree_read\}": \["p\(95\)<)(\d+)("\])',
        "bearer_login": r'(http_req_duration\{scenario:bearer_login\}"] = \["p\(95\)<)(\d+)("\])',
        "resized_image": r'(http_req_duration\{scenario:resized_image\}"] = \["p\(95\)<)(\d+)("\])',
    }

    updated = target_text
    updated = re.sub(patterns["product_tree_read"], rf"\g<1>{scenario_limits['product_tree_read']}\g<3>", updated)
    updated = re.sub(patterns["bearer_login"], rf"\g<1>{scenario_limits['bearer_login']}\g<3>", updated)
    updated = re.sub(patterns["resized_image"], rf"\g<1>{scenario_limits['resized_image']}\g<3>", updated)
    target_path.write_text(updated)

    for scenario, limit in scenario_limits.items():
        print(f"{scenario}: p95<{limit}")


if __name__ == "__main__":
    main()
