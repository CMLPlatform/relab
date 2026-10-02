"""Unit tests for the perf CI threshold refresh."""

import json
from typing import TYPE_CHECKING

from scripts.perf import perf_ci

if TYPE_CHECKING:
    from pathlib import Path

    import pytest


def test_apply_thresholds_rewrites_both_threshold_styles(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Gated and directly assigned thresholds are refreshed, including the WebSocket connect metric."""
    summary = tmp_path / "summary.json"
    summary.write_text(
        json.dumps(
            {
                "metrics": {
                    "http_req_duration{scenario:live_probe}": {"p(95)": 12.0},
                    "http_req_duration{scenario:rpi_cam_telemetry_relay}": {"p(95)": 30.0},
                    "ws_connecting{scenario:rpi_cam_ws_connect}": {"p(95)": 150.0},
                }
            }
        )
    )
    target = tmp_path / "k6-baseline.js"
    target.write_text(
        'gate("live_probe", 100);\n'
        '  gate("rpi_cam_telemetry_relay", 100);\n'
        'thresholds["ws_connecting{scenario:rpi_cam_ws_connect}"] = ["p(95)<100"];\n'
    )
    monkeypatch.setattr(perf_ci, "SUMMARY_PATH", summary)
    monkeypatch.setattr(perf_ci, "TARGET_JS", target)

    perf_ci.apply_thresholds(5.0)

    assert target.read_text() == (
        'gate("live_probe", 100);\n'
        '  gate("rpi_cam_telemetry_relay", 200);\n'
        'thresholds["ws_connecting{scenario:rpi_cam_ws_connect}"] = ["p(95)<800"];\n'
    )
