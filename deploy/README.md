# Deploy documentation

Four runbooks on two axes: which host, and whether it is a routine release or the
one-time migration off `main`.

|                        | **Production**                     | **Staging**                              |
| ---------------------- | ---------------------------------- | ---------------------------------------- |
| **Routine release**    | [DEPLOY-PROD.md](DEPLOY-PROD.md)   | [DEPLOY-STAGING.md](DEPLOY-STAGING.md)   |
| **One-time migration** | [CUTOVER-PROD.md](CUTOVER-PROD.md) | [CUTOVER-STAGING.md](CUTOVER-STAGING.md) |

`DEPLOY-*` is permanent and self-contained: first-time host setup, the routine release
loop, and recovery. Start there for anything you do more than once.

`CUTOVER-*` covers only the one-time move off `main` — the drift analysis, the secret
and role migration, the data checks, the encryption pass. **Delete both once the MVP
migration is done on both hosts.** They reference `DEPLOY-*` rather than duplicating it,
so nothing durable is lost when they go. At deletion time, also drop their row from the
table above and grep for `CUTOVER-` — a couple of code comments name the migration
steps they describe (`backend/justfile`'s `backfill-upload-sizes` goes with them).

Rehearse on staging before prod. The two hosts share `compose.deploy.yaml`, so a
step that has only ever run on prod has never actually been tested.

## Also here

- `systemd/` — the three scheduled-job units (backup, watchdog, monthly restore
  check). Render with `just timers-render`, install with `just timers-install <env>`;
  the committed files carry placeholders, not any real host's paths.
- `alloy/` — the Grafana Alloy agent config that ships container logs and host metrics
  to the central collector. Loaded by `compose.logging.alloy.yaml`, which the deploy
  recipes include automatically when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- `env/` — committed, non-secret, per-environment Compose variables. Host-local
  operator inputs live in the gitignored root `.env`; runtime secrets live in
  `secrets/<env>/`.

Public self-hosting documentation is a different audience and lives in the docs
subrepo (`docs/src/content/docs/operations/`). These four are for operating *this*
deployment.
