# Deploy documentation

Runbooks for operating *this* deployment, one per host. Each covers first-time host setup, the
routine release loop, and recovery:

- [DEPLOY-PROD.md](DEPLOY-PROD.md): production
- [DEPLOY-STAGING.md](DEPLOY-STAGING.md): staging

Public self-hosting documentation is the install guide in the docs subrepo
(`docs/src/content/docs/operations/install.md`); the runbooks link to it rather than repeat it.

Rehearse on staging before prod. The two hosts share `compose.deploy.yaml`, so a step that has only
ever run on prod has never been tested.

[CMLPlatform/monitoring](https://github.com/CMLPlatform/monitoring) owns the monitoring
architecture: its ADR 0002 records the hub-and-spoke design, and its `templates/README.md` describes
how a project onboards. R9lab is one spoke; the R9lab-specific parts live in the runbooks.

The one-time cutover runbooks were removed after staging moved on 2026-09-06 and prod on 2026-09-08.
`git log -- deploy/CUTOVER-PROD.md` finds them.

## Also here

- `systemd/`: the four scheduled-job units (hourly backup, daily backup maintenance, watchdog,
  monthly restore check). Render with `just timers-render`, install with
  `just timers-install <env>`; the committed files carry placeholders, not any real host's paths.
- `alloy/`: the Grafana Alloy agent config that ships container logs and host metrics to the
  central collector. Loaded by `compose.telemetry.yml`, which the deploy recipes include when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- `env/variables.toml`: the committed runtime secret inventory, names only (`just env-inventory`
  prints it). Host-local operator inputs live in the gitignored root `.env`; the secret values live
  in the gitignored `secrets/<env>/`.
- `postgres/initdb/provision.sh`: creates the database roles, sets table ownership, and installs
  the superuser-only extensions. It runs on an empty volume and again on every
  `just stack <env> up`.

Four files are **vendored** from [CMLPlatform/monitoring](https://github.com/CMLPlatform/monitoring)
and must stay byte-identical to it. Everything project-specific arrives as an environment variable;
if onboarding needs one of these edited, report that upstream as a bug.

| Vendored file               | Upstream path                         |
| --------------------------- | ------------------------------------- |
| `compose.telemetry.yml`     | `templates/compose.telemetry.yml`     |
| `compose.telemetry.gpu.yml` | `templates/compose.telemetry.gpu.yml` |
| `deploy/alloy/config.alloy` | `templates/alloy/config.alloy`        |
| `scripts/run_scheduled.sh`  | `templates/run_scheduled.sh`          |

Vendored at **`v0.4.0`**, except that `compose.telemetry.gpu.yml` carries a newer
`nvidia_gpu_exporter` pin than that tag. Update the tag in the same commit that re-vendors:

```sh
git -C ../monitoring checkout v0.4.0    # or the newer tag being adopted
diff -u ../monitoring/templates/compose.telemetry.yml compose.telemetry.yml
```
