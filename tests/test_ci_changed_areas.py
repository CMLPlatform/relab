"""Checks scripts/ci_changed_areas.py: which CI jobs a pull request's paths reach."""

from __future__ import annotations

import json

import pytest
from ci_changed_areas import changed_areas, outputs

EVERYTHING = {"all", "backend", "app", "www", "docs"}


@pytest.mark.parametrize(
    ("paths", "expected"),
    [
        (["backend/app/main.py"], {"backend"}),
        (["www/src/a.ts", "app/src/b.ts"], {"www", "app"}),
        (["docs/src/content/guide.mdx"], {"docs"}),
        (["pnpm-lock.yaml"], {"app", "www", "docs"}),
        # Backend-generated files also need `just backend/check`.
        (["app/src/types/openapi.json"], {"app", "backend"}),
        (["docs/public/api/schemas/openapi.public.json"], {"docs", "backend"}),
        (["docs/src/components/datamodel/erd.mdx"], {"docs", "backend"}),
        # Anything outside the subrepos reaches all of them.
        ([".github/workflows/ci.yml"], EVERYTHING),
        (["justfile", "backend/app/main.py"], EVERYTHING),
        (["backend"], EVERYTHING),
        ([], EVERYTHING),
    ],
)
def test_pull_request_areas(paths: list[str], expected: set[str]) -> None:
    assert changed_areas("pull_request", paths) == expected


@pytest.mark.parametrize("event", ["push", "schedule", "workflow_dispatch"])
def test_other_events_run_everything(event: str) -> None:
    assert changed_areas(event, ["backend/app/main.py"]) == EVERYTHING


def test_backend_only_outputs() -> None:
    out = outputs({"backend"})
    assert out["backend"] == "true"
    assert json.loads(out["web"]) == []
    assert json.loads(out["smoke"]) == ["docker-orchestration-smoke", "docker-smoke-backups"]
    assert json.loads(out["codeql"]) == ["python"]


def test_everything_outputs_every_job() -> None:
    out = outputs(EVERYTHING)
    assert json.loads(out["web"]) == ["www", "app"]
    assert json.loads(out["smoke"]) == [
        "docker-smoke-static www",
        "docker-smoke-static app",
        "docker-smoke-static docs",
        "docker-orchestration-smoke",
        "docker-smoke-backups",
    ]
    assert json.loads(out["codeql"]) == ["python", "javascript-typescript", "actions"]
