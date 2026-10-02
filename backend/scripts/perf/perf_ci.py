"""Perf CI helpers: write baseline reports and refresh k6 p95 thresholds."""

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any, cast

SUMMARY_PATH = Path("reports/performance/latest-k6-summary.json")
TARGET_JS = Path("perf/k6-baseline.js")
SCENARIOS = (
    "live_probe",
    "product_list_read",
    "product_search_read",
    "product_detail_read",
    "product_components_read",
    "reference_data_read",
    "bearer_login",
    "media_url_read",
    "product_create_write",
    "image_upload_write",
    "rpi_cam_ws_connect",
    "rpi_cam_telemetry_relay",
    "rpi_cam_hls_relay",
    "rpi_cam_capture",
    "rpi_cam_preview_upload",
)
# The latency metric each scenario is thresholded on, when it is not http_req_duration.
SCENARIO_METRICS = {"rpi_cam_ws_connect": "ws_connecting"}


def _load_metrics() -> dict[str, Any]:
    if not SUMMARY_PATH.exists():
        msg = f"Missing summary export: {SUMMARY_PATH}"
        raise SystemExit(msg)
    data = json.loads(SUMMARY_PATH.read_text())
    return cast("dict[str, Any]", data["metrics"])


def _latency_metric(scenario: str) -> str:
    return SCENARIO_METRICS.get(scenario, "http_req_duration")


def _has_scenario(metrics: dict[str, Any], scenario: str) -> bool:
    return f"{_latency_metric(scenario)}{{scenario:{scenario}}}" in metrics


def _threshold_pattern(scenario: str) -> str:
    # HTTP scenarios set their ceiling through `gate("scenario", N)`; the others assign
    # `thresholds["metric{scenario:...}"] = ["p(95)<N"]` directly.
    if scenario in SCENARIO_METRICS:
        return rf'({SCENARIO_METRICS[scenario]}\{{scenario:{scenario}\}}"\] = \["p\(95\)<)(\d+)("\])'
    return rf'(gate\("{scenario}", )(\d+)(\))'


# --- threshold refresh ------------------------------------------------------


def _scenario_limit(metrics: dict[str, Any], scenario: str, headroom: float) -> int:
    duration = cast("dict[str, Any]", metrics[f"{_latency_metric(scenario)}{{scenario:{scenario}}}"])
    return math.ceil(float(duration["p(95)"]) * headroom / 100) * 100


def apply_thresholds(headroom: float) -> None:
    """Refresh k6 p95 thresholds from the latest summary export."""
    metrics = _load_metrics()
    target_text = TARGET_JS.read_text()

    scenario_limits = {
        scenario: _scenario_limit(metrics, scenario, headroom)
        for scenario in SCENARIOS
        if _has_scenario(metrics, scenario)
    }

    updated = target_text
    for scenario, limit in scenario_limits.items():
        updated = re.sub(_threshold_pattern(scenario), rf"\g<1>{limit}\g<3>", updated)
    TARGET_JS.write_text(updated)

    for scenario, limit in scenario_limits.items():
        sys.stdout.write(f"{scenario}: p95<{limit}\n")


# --- dated CI report --------------------------------------------------------


def _scenario_metrics(metrics: dict[str, Any], name: str) -> tuple[float, float, float]:
    duration = cast("dict[str, Any]", metrics[f"http_req_duration{{scenario:{name}}}"])
    failed = cast("dict[str, Any]", metrics[f"http_req_failed{{scenario:{name}}}"])
    return float(duration["avg"]), float(duration["p(95)"]), float(failed["value"])


def _has_scenario_report(metrics: dict[str, Any], name: str) -> bool:
    return f"http_req_duration{{scenario:{name}}}" in metrics and f"http_req_failed{{scenario:{name}}}" in metrics


def _fmt_ms(value: float) -> str:
    return f"{value / 1000:.2f}s" if value >= 1000 else f"{value:.2f}ms"


def _fmt_rate(value: float) -> str:
    return f"{value * 100:.2f}%"


def write_report(date: str, base_url: str) -> None:
    """Write a dated markdown CI baseline report from the latest k6 summary."""
    metrics = _load_metrics()
    overall = cast("dict[str, Any]", metrics["http_req_duration"])
    enabled_scenarios = [name for name in SCENARIOS if _has_scenario_report(metrics, name)]
    scenario_lines = []
    for scenario in enabled_scenarios:
        avg, p95, fail_rate = _scenario_metrics(metrics, scenario)
        scenario_lines.append(
            f"- `{scenario}`: avg `{_fmt_ms(avg)}`, p95 `{_fmt_ms(p95)}`, failed requests `{_fmt_rate(fail_rate)}`"
        )
    overall_line = f"- overall HTTP: avg `{_fmt_ms(float(overall['avg']))}`, p95 `{_fmt_ms(float(overall['p(95)']))}`"

    report_path = Path(f"reports/performance/{date}-ci-baseline.md")
    report_path.write_text(
        "\n".join(
            [
                f"# {date} CI Baseline",
                "",
                f"- environment: Docker CI backend at `{base_url}`",
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
                "- `media_url_read` is optional and only runs when a sample media URL is provided.",
                "- If these numbers replace the prior baseline, keep older reports as historical context only.",
                "- Threshold refresh remains a maintainer-only follow-up step.",
                "",
            ]
        )
        + "\n"
    )
    sys.stdout.write(f"{report_path}\n")


# --- CLI --------------------------------------------------------------------


def main() -> None:
    """Dispatch to the requested perf CI subcommand."""
    parser = argparse.ArgumentParser(prog="perf_ci")
    sub = parser.add_subparsers(dest="command", required=True)

    cmd_apply = "apply-thresholds"
    cmd_report = "write-report"

    thresholds = sub.add_parser(cmd_apply, help="Refresh k6 p95 thresholds from the latest summary")
    thresholds.add_argument("headroom", nargs="?", type=float, default=1.15)

    report = sub.add_parser(cmd_report, help="Write a dated CI baseline report from the latest summary")
    report.add_argument("--date", required=True)
    report.add_argument("--base-url", default="http://api:8000")

    args = parser.parse_args()
    if args.command == cmd_apply:
        apply_thresholds(args.headroom)
    elif args.command == cmd_report:
        write_report(args.date, args.base_url)


if __name__ == "__main__":
    main()
