# Deploy documentation

Two runbooks, one per host, both covering the routine release loop.

|                        | **Production**                     | **Staging**                            |
| ---------------------- | ---------------------------------- | -------------------------------------- |
| **Routine release**    | [DEPLOY-PROD.md](DEPLOY-PROD.md)   | [DEPLOY-STAGING.md](DEPLOY-STAGING.md) |

[CMLPlatform/monitoring](https://github.com/CMLPlatform/monitoring) owns the monitoring
architecture: its ADR 0002 records the hub-and-spoke design and `templates/README.md` how a project
onboards. Relab is one spoke; the Relab-specific parts live in the `DEPLOY-*` runbooks.

`DEPLOY-*` is permanent: first-time host setup, the routine release loop, and recovery. Start there
for anything you do more than once.

The one-time cutover runbooks are gone: staging moved on 2026-09-06 and prod on 2026-09-08. The
history is in git (`git log -- deploy/CUTOVER-PROD.md`) if a step ever needs re-reading.

Rehearse on staging before prod. The two hosts share `compose.deploy.yaml`, so a step that has only
ever run on prod has never been tested.

## Also here

- `systemd/`: the four scheduled-job units (hourly backup, daily backup maintenance, watchdog,
  monthly restore check). Render with `just timers-render`, install with
  `just timers-install <env>`; the committed files carry placeholders, not any real host's paths.
- `alloy/`: the Grafana Alloy agent config that ships container logs and host metrics to the
  central collector. Loaded by `compose.telemetry.yml`, which the deploy recipes include when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- `env/`: committed, non-secret, per-environment Compose variables. Host-local operator inputs live
  in the gitignored root `.env`; runtime secrets live in `secrets/<env>/`.

Four files are **vendored** from [CMLPlatform/monitoring](https://github.com/CMLPlatform/monitoring)
and must stay byte-identical to it. Everything project-specific arrives as an environment variable;
if onboarding needs one of these edited, report that upstream as a bug.

| Vendored file               | Upstream path                         |
| --------------------------- | ------------------------------------- |
| `compose.telemetry.yml`     | `templates/compose.telemetry.yml`     |
| `compose.telemetry.gpu.yml` | `templates/compose.telemetry.gpu.yml` |
| `deploy/alloy/config.alloy` | `templates/alloy/config.alloy`        |
| `scripts/run_scheduled.sh`  | `templates/run_scheduled.sh`          |

Vendored at **`v0.3.0`**. Update that tag in the same commit that re-vendors:

```sh
git -C ../monitoring checkout v0.3.0    # or the newer tag being adopted
diff -u ../monitoring/templates/compose.telemetry.yml compose.telemetry.yml
```

Public self-hosting documentation lives in the docs subrepo (`docs/src/content/docs/operations/`).
The runbooks here are for operating *this* deployment.
