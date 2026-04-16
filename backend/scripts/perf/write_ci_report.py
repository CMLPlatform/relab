"""Write a dated markdown report from the latest k6 CI summary export."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, cast


def scenario_metrics(metrics: dict[str, Any], name: str) -> tuple[float, float, float]:
    """Return average, p95, and failed-request rate for one scenario."""
    duration = cast("dict[str, Any]", metrics[f"http_req_duration{{scenario:{name}}}"])
    failed = cast("dict[str, Any]", metrics[f"http_req_failed{{scenario:{name}}}"])
    return float(duration["avg"]), float(duration["p(95)"]), float(failed["value"])


def has_scenario(metrics: dict[str, Any], name: str) -> bool:
    """Return whether a scenario is present in the summary export."""
    return f"http_req_duration{{scenario:{name}}}" in metrics and f"http_req_failed{{scenario:{name}}}" in metrics


def fmt_ms(value: float) -> str:
    """Format a duration in milliseconds or seconds."""
    return f"{value / 1000:.2f}s" if value >= 1000 else f"{value:.2f}ms"


def fmt_rate(value: float) -> str:
    """Format a ratio as a percentage string."""
    return f"{value * 100:.2f}%"


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for report generation."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True)
    parser.add_argument("--base-url", default="http://api:8000")
    return parser.parse_args()


def main() -> None:
    """Write a markdown CI baseline report from the latest k6 summary."""
    args = parse_args()
    summary_path = Path("reports/performance/latest-k6-summary.json")
    if not summary_path.exists():
        msg = f"Missing summary export: {summary_path}"
        raise SystemExit(msg)

    report_path = Path(f"reports/performance/{args.date}-ci-baseline.md")
    data = json.loads(summary_path.read_text())
    metrics = cast("dict[str, Any]", data["metrics"])
    overall = cast("dict[str, Any]", metrics["http_req_duration"])
    scenario_names = ("live_probe", "product_tree_read", "bearer_login", "resized_image")
    enabled_scenarios = [name for name in scenario_names if has_scenario(metrics, name)]
    scenario_lines = []
    for scenario in enabled_scenarios:
        avg, p95, fail_rate = scenario_metrics(metrics, scenario)
        scenario_lines.append(
            f"- `{scenario}`: avg `{fmt_ms(avg)}`, "
            f"p95 `{fmt_ms(p95)}`, failed requests `{fmt_rate(fail_rate)}`"
        )
    overall_line = (
        f"- overall HTTP: avg `{fmt_ms(float(overall['avg']))}`, "
        f"p95 `{fmt_ms(float(overall['p(95)']))}`"
    )

    report_path.write_text(
        "\n".join(
            [
                f"# {args.date} CI Baseline",
                "",
                f"- environment: Docker CI backend at `{args.base_url}`",
                "- source summary: `reports/performance/latest-k6-summary.json`",
                "- enabled scenarios: " + ", ".join(f"`{name}`" for name in enabled_scenarios),
                "",
                "## Results",
                "",
                *scenario_lines,
                overall_line,
                "",
                "## Notes",
                "",
                "- This file was generated from the latest CI-stack `k6` summary export.",
                "- `resized_image` is optional and only runs when a sample image is available.",
                "- If these numbers replace the prior baseline, keep older reports as historical context only.",
                "- Threshold refresh remains a maintainer-only follow-up step.",
                "",
            ]
        )
        + "\n"
    )
    sys.stdout.write(f"{report_path}\n")


if __name__ == "__main__":
    main()
