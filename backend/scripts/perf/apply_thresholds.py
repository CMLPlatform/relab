"""Refresh k6 p95 thresholds from the latest summary export."""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path
from typing import Any, cast

SCENARIOS = ("live_probe", "product_tree_read", "bearer_login", "resized_image")


def _scenario_limit(metrics: dict[str, Any], scenario: str, headroom: float) -> int:
    """Return the rounded p95 threshold for a scenario."""
    duration = cast("dict[str, Any]", metrics[f"http_req_duration{{scenario:{scenario}}}"])
    return math.ceil(float(duration["p(95)"]) * headroom / 100) * 100


def _has_scenario(metrics: dict[str, Any], scenario: str) -> bool:
    """Return whether the scenario exists in the latest summary export."""
    return f"http_req_duration{{scenario:{scenario}}}" in metrics


def main() -> None:
    """Refresh k6 thresholds from the latest summary export."""
    headroom = float(sys.argv[1]) if len(sys.argv) > 1 else 1.15
    summary_path = Path("reports/performance/latest-k6-summary.json")
    target_path = Path("perf/k6-baseline.js")

    if not summary_path.exists():
        msg = f"Missing summary export: {summary_path}"
        raise SystemExit(msg)

    data = json.loads(summary_path.read_text())
    metrics = cast("dict[str, Any]", data["metrics"])
    target_text = target_path.read_text()

    scenario_limits = {
        scenario: _scenario_limit(metrics, scenario, headroom)
        for scenario in SCENARIOS
        if _has_scenario(metrics, scenario)
    }

    patterns = {
        "live_probe": r'(http_req_duration\{scenario:live_probe\}": \["p\(95\)<)(\d+)("\])',
        "product_tree_read": r'(http_req_duration\{scenario:product_tree_read\}": \["p\(95\)<)(\d+)("\])',
        "bearer_login": r'(http_req_duration\{scenario:bearer_login\}"] = \["p\(95\)<)(\d+)("\])',
        "resized_image": r'(http_req_duration\{scenario:resized_image\}"] = \["p\(95\)<)(\d+)("\])',
    }

    updated = target_text
    for scenario, limit in scenario_limits.items():
        updated = re.sub(patterns[scenario], rf"\g<1>{limit}\g<3>", updated)
    target_path.write_text(updated)

    for scenario, limit in scenario_limits.items():
        sys.stdout.write(f"{scenario}: p95<{limit}\n")


if __name__ == "__main__":
    main()
