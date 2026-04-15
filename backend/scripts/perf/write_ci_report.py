"""Write a dated markdown report from the latest k6 CI summary export."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def scenario_metrics(metrics: dict[str, object], name: str) -> tuple[float, float, float]:
    duration = metrics[f"http_req_duration{{scenario:{name}}}"]
    failed = metrics[f"http_req_failed{{scenario:{name}}}"]
    total = float(max(failed["passes"] + failed["fails"], 1))
    return float(duration["avg"]), float(duration["p(95)"]), float(failed["fails"]) / total


def fmt_ms(value: float) -> str:
    return f"{value / 1000:.2f}s" if value >= 1000 else f"{value:.2f}ms"


def fmt_rate(value: float) -> str:
    return f"{value * 100:.2f}%"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True)
    parser.add_argument("--base-url", default="http://api:8000")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary_path = Path("reports/performance/latest-k6-summary.json")
    if not summary_path.exists():
        raise SystemExit(f"Missing summary export: {summary_path}")

    report_path = Path(f"reports/performance/{args.date}-ci-baseline.md")
    data = json.loads(summary_path.read_text())
    metrics = data["metrics"]

    product_avg, product_p95, product_fail = scenario_metrics(metrics, "product_tree_read")
    login_avg, login_p95, login_fail = scenario_metrics(metrics, "bearer_login")
    image_avg, image_p95, image_fail = scenario_metrics(metrics, "resized_image")
    overall = metrics["http_req_duration"]

    report_path.write_text(
        "\n".join(
            [
                f"# {args.date} CI Baseline",
                "",
                f"- environment: Docker CI backend at `{args.base_url}`",
                "- source summary: `reports/performance/latest-k6-summary.json`",
                "- enabled scenarios: `product_tree_read`, `bearer_login`, `resized_image`",
                "",
                "## Results",
                "",
                f"- `product_tree_read`: avg `{fmt_ms(product_avg)}`, p95 `{fmt_ms(product_p95)}`, failed requests `{fmt_rate(product_fail)}`",
                f"- `bearer_login`: avg `{fmt_ms(login_avg)}`, p95 `{fmt_ms(login_p95)}`, failed requests `{fmt_rate(login_fail)}`",
                f"- `resized_image`: avg `{fmt_ms(image_avg)}`, p95 `{fmt_ms(image_p95)}`, failed requests `{fmt_rate(image_fail)}`",
                f"- overall HTTP: avg `{fmt_ms(float(overall['avg']))}`, p95 `{fmt_ms(float(overall['p(95)']))}`",
                "",
                "## Notes",
                "",
                "- This file was generated from the latest CI-stack `k6` summary export.",
                "- If these numbers replace the prior baseline, keep older reports as historical context only.",
                "- Threshold refresh remains a maintainer-only follow-up step.",
                "",
            ]
        )
        + "\n"
    )
    print(report_path)


if __name__ == "__main__":
    main()
