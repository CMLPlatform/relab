"""Guards the workflow jobs that hold deploy or publish credentials.

A job bound to a GitHub Environment receives that Environment's secrets. Restoring a
shared Actions cache there would run files another workflow run wrote next to those
secrets, so every such job must set ``restore-cache: "false"`` on setup-runtime.
"""

from __future__ import annotations

from pathlib import Path

import yaml

WORKFLOWS = Path(__file__).resolve().parents[1] / ".github" / "workflows"
SETUP_RUNTIME = "./.github/actions/setup-runtime"


def environment_jobs_restoring_cache() -> list[str]:
    offenders = []
    for path in sorted(WORKFLOWS.glob("*.yml")):
        for job_id, job in (yaml.safe_load(path.read_text())["jobs"] or {}).items():
            if "environment" not in job:
                continue
            offenders.extend(
                f"{path.name}:{job_id}"
                for step in job.get("steps", [])
                if step.get("uses") == SETUP_RUNTIME and (step.get("with") or {}).get("restore-cache") != "false"
            )
    return offenders


def test_environment_jobs_do_not_restore_caches() -> None:
    assert environment_jobs_restoring_cache() == []
