> **How to read this.** An architecture review commissioned 2026-08-19, asked to design
> the observability setup a small research group should run today rather than to patch the
> existing one. Its verdict was that the shape was right and four specific signals were
> missing. The Relab half of its migration path is implemented; the central half is in
> [MONITORING-HANDOVER.md](MONITORING-HANDOVER.md).
>
> It is kept because the *reasoning* outlives the changes: why one wire protocol, why
> alerting lives in Grafana, why per-container attribution on consumer GPUs is a trap, and
> which of its claims it could not verify (§8). Treat the "delete list" and "migration
> path" sections as historical once done. Delete this file when it stops being read.

# Monitoring architecture for CML research software, designed from scratch (2026-08)

Scope: one part-time operator, multiple Docker Compose projects, zero budget, no Kubernetes.
Written without regard for what exists, then reconciled against the current Relab + CMLPlatform/monitoring state.

Verdict up front: **the shape of the current stack is right.** OTLP in, one central gateway,
Grafana + Loki + Prometheus, a Cloudflare tunnel with Access on the UI and a bearer token on
ingestion, and an external dead-man's switch. A team starting today with the same constraints
would build roughly this. The problems are not architectural, they are:

1. **Nothing alerts on absence.** Every sender is push-based, and no rule fires when a project
   stops sending. `up == 0` covers only the monitoring host's own scrape targets. The deployment
   docs already claim this alert exists; it does not.
1. **Nothing sees container lifecycle.** Logs and host metrics are shipped; container restart
   counts are not. This is the exact 668-restart blind spot, still open.
1. **Two things own several signals.** API logs travel twice. Alert routing lives in two places.
   RED metrics are derived from traces while the same metrics arrive natively.
1. **The per-host layer is bespoke.** `deploy_watchdog.sh` is ~250 lines of project-specific bash
   that re-derives, locally and worse, things the central stack or healthchecks.io already know.
   Copy that to project two and the design stops scaling.

Everything below follows from those four. Two additions from later in the brief — replacing
Beszel's per-container resource charts (§1.6) and onboarding GPU hosts for computer-vision work
(§1.7) — turn out to need no architectural change: one Alloy exporter each, two imported
dashboards, one opt-in Compose overlay. That they fit without a redesign is the main evidence the
shape is right.

______________________________________________________________________

## 1. Target architecture

### 1.1 The three tiers and what each owns

```
per-project host (Docker Compose)          central host (Docker Compose)        outside everything
--------------------------------           -----------------------------        -----------------
app containers                             otel-collector  (ingest gateway)      healthchecks.io
  └ OTel SDK ─ traces, app metrics ──┐     Loki            (logs)                  (dead-man's switch)
                                     ├──►  Prometheus      (metrics)             external HTTP prober
Alloy (one per host)                 │     Tempo           (traces)                (public reachability)
  ├ all container stdout ─ logs ─────┤     Grafana         (UI + alert rules)
  ├ host metrics (node exporter) ────┤     node-exporter   (this host only)
  └ container state (cadvisor) ──────┘     cloudflared     (edge)

systemd timers (backup / restore-check / drift) ──► healthchecks.io directly
```

Wire protocol everywhere: **OTLP over HTTP/protobuf**, `Authorization: Bearer <token>`, to the
single public hostname `otlp.<domain>`. No second endpoint, no second credential, no Loki push
hostname, ever. gRPC only on private paths (collector → Tempo).

### 1.2 Ownership boundaries (the rules that stop two things owning one signal)

These are the load-bearing part of the design. Each signal has exactly one producer and one
consumer path.

| Signal                                                                                        | Sole owner                                                | Explicitly NOT owned by                                             |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Traces + app-level metrics                                                                    | the app's OTel SDK                                        | Alloy, Tempo-derived metrics                                        |
| RED metrics (rate/errors/duration)                                                            | the app's native OTel HTTP server metrics                 | Tempo span-metrics                                                  |
| All container logs (including the instrumented app's)                                         | Alloy, from Docker stdout                                 | the OTel SDK log exporter                                           |
| Host metrics (cpu/mem/disk/net/thermal)                                                       | Alloy's node exporter                                     | the app, Beszel, anything else                                      |
| GPU metrics                                                                                   | a `nvidia_gpu_exporter` sidecar, scraped by Alloy         | Beszel, dcgm-exporter (on consumer cards), the training job         |
| Batch-job outcome and duration                                                                | node_exporter's textfile collector + a healthchecks check | a Pushgateway                                                       |
| Batch-job output correctness                                                                  | the job script's own assertions                           | the monitoring stack, at all                                        |
| Container lifecycle + per-container resources (CPU, memory, network, disk I/O, restarts, OOM) | Alloy's cAdvisor exporter                                 | shell scripts on the host, Beszel, the OTel `docker_stats` receiver |
| "Did the scheduled job run and succeed?"                                                      | healthchecks.io, pinged by the job wrapper                | any query over metrics or snapshot age                              |
| "Is the deployed code the code we think?"                                                     | one small host script (git drift)                         | the central stack (it cannot see this)                              |
| "Is the site reachable from the internet?"                                                    | an external prober                                        | anything running on the app host                                    |
| Alert rules and routing                                                                       | Grafana-managed alerting                                  | Prometheus rule files, Alertmanager                                 |

Two corollaries worth stating because they are the ones currently violated:

- **The instrumented app must not export logs over OTLP.** Turn off the SDK log exporter and let
  Alloy carry stdout for *every* container uniformly. Trace correlation survives because the app
  prints `trace_id` in its JSON log line and the Loki datasource already has a derived field for
  it. Uniformity is the point: an uninstrumented project gets identical log coverage on day one.
  *Opposite choice is right if* you need exemplar-grade log↔trace linking you cannot get from a
  printed field — then keep SDK logs and exclude the app container from Alloy discovery instead.
  Either way, pick one.
- **RED comes from the app, not from Tempo.** `http.server.request.duration` histograms already
  arrive over OTLP. Deriving the same numbers from span-metrics means dashboards and error
  alerting go dark whenever Tempo does — which the monitoring repo's own runbook screenshot shows
  has already happened once, on a major-version bump. Move the dashboards and the `HighErrorRate`
  rule onto native metrics; Tempo then owns exactly one thing, per-request drill-down, and can be
  deleted without collateral damage.

### 1.3 Component-by-component, and why each earns its cost

**Central host**

- **OpenTelemetry Collector (contrib)** — one ingestion gateway, one credential, storage backends
  swappable behind it. `bearertokenauth` extension enforces the static token on both receivers.
  Keep. The alternative (each project writing to Loki/Prometheus directly) needs a public hostname
  and a credential per backend; that is strictly worse.
- **Loki 3.x** (v3.7.6, 2026-08-06) — logs, OTLP-native ingestion at `/otlp/v1/logs`, structured metadata carries
  `trace_id`. Keep. Single-binary, filesystem storage, `auth_enabled: false` and therefore never
  exposed at the edge.
- **Prometheus 3.x** (v3.14.0, 2026-08-18) — metrics, native OTLP receiver (`--web.enable-otlp-receiver`). Keep. Also
  scrapes the three things that live on this host: itself, the collector, node-exporter.
- **Grafana** (v13.2.0, 2026-08-18) — UI *and* the single home for alert rules. Keep, with expanded
  responsibility (see 1.4).
- **node-exporter** — the monitoring host's own disk/CPU. Keep; it is one container and it is the
  backstop for the one failure that silently destroys all history (disk full).
- **cloudflared** — edge. Keep. Two hostnames, no more: `grafana.` behind Access, `otlp.` behind
  the bearer token. Tunnel and Zero Trust Access both work on the free plan today — note that
  neither "Tunnel is free" nor the widely-repeated "50 free Zero Trust seats" figure could be
  found stated anywhere on developers.cloudflare.com, so treat both as observed behaviour rather
  than a documented guarantee, and check the dashboard before onboarding a second operator. What
  the free plan does *not* give you is edge protection worth relying
  on: 5 WAF custom rules, **1 rate-limiting rule** locked to IP counting with a fixed 10s window,
  and **no regex operators** below Business. That is why ingestion auth lives in the collector's
  `bearertokenauth` extension and not at the edge — the edge cannot express it. Do not plan any
  control that needs a regex match or a second rate-limit rule.
- **Tempo** (v3.0.3, 2026-08-13) — keep, demoted. Traces are the only signal that answers "why was this one request
  slow", and that is worth one container. But nothing else may depend on it.
- **Alertmanager** — **delete.** See 1.4.

**Per-project host**

- **Grafana Alloy** (v1.18.1, 2026-08-06) **— one container, one shared config file** — owns logs, host metrics, and
  container state. It is the only per-project moving part, and its config is not per-project: it
  is a vendored copy of a file the monitoring repo publishes, parameterised entirely by
  environment variables (`PROJECT`, `ENVIRONMENT`, `COMPOSE_PROJECT_NAME`, `HOSTNAME`, endpoint,
  token).
  *Opposite choice is right if* a project has no Docker socket to give away — then a plain OTel
  Collector with the `filelog` receiver reading `/var/lib/docker/containers/*/*.log` works, at the
  cost of container ids instead of names.
- **systemd timers + a ~15-line ping wrapper** — backup, restore-check, drift. These stay on the
  host because a backup needs the host's own volumes. Their *detection* does not stay on the host:
  each pings its own healthchecks.io check.

**Outside**

- **healthchecks.io** — per-job dead-man's switch. Free tier is ample at this scale.
- **an external HTTP prober** — the only thing that knows whether the public site answers.

### 1.4 Alerting: one home, and it is Grafana

Delete Alertmanager and the Prometheus `rule_files`. Move every rule to **Grafana-managed alert
rules, provisioned from YAML** under `config/grafana/provisioning/alerting/`. Three reasons, in
order of weight:

1. **Grafana rules can query Loki. Prometheus rules cannot.** The alerts that would have caught
   the formative incident are log-shaped and metric-shaped at once. Splitting the rule engine
   means the most valuable alerts cannot be written at all.
1. **One place owns notification.** Today `alertmanager.yaml` routes, and Grafana also has contact
   points; that is two answers to "who gets told".
1. **It deletes a container, a volume, a tmpfs/`url_file` entrypoint hack, an `amtool` step in
   `just check`, and a mount from the backup job.**

Verified: Grafana OSS provisions alert rules, contact points, notification policies, templates and
mute timings from YAML under `/etc/grafana/provisioning/alerting/` (the only stated exclusion is
Grafana Cloud). Grafana ships a built-in Alertmanager that "extends the Prometheus Alertmanager".
Notification-policy repeat interval defaults to 4h with no documented minimum, so the always-firing
`Watchdog` → short-repeat → webhook pattern reproduces today's heartbeat.

One caveat that shapes the migration: Grafana's built-in Alertmanager "can only handle
Grafana-managed alerts", and there is **no documented endpoint for an external Prometheus to POST
alerts into it**. So this is not a "keep the rules where they are and just re-point delivery" move
— the Prometheus rule files must actually become Grafana rules. That is the four rules in
`config/alerts/stack.yaml`, which is an afternoon, not a project.

*Opposite choice is right if* you ever want alerting to survive Grafana being down. It does not
buy that today — Alertmanager sits on the same host and dies with it — so the redundancy is
imaginary. The real answer to "alerting is down" is the heartbeat, below.

Not an option in 2026: **Grafana OnCall OSS is dead** — maintenance mode announced 2025-03-11,
archived read-only 2026-03-24, with Grafana Cloud IRM (paid) as the only successor. If anyone
suggests it, that is the answer.

The rule set, deliberately small. Alert count should stay under about ten; past that the operator
stops reading them.

| Rule                     | Expression shape                                     | For | Why                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectTelemetrySilent` | no logs or metrics with `project=X, env=prod` in 15m | 15m | **The missing keystone.** Catches host down, Docker down, Alloy down, tunnel down, token rotated wrong, collector rejecting. One rule per project/env, generated from a template. |
| `ContainerRestarting`    | `changes(container_start_time_seconds[1h]) > 3`      | 10m | **The 668-restart rule.** A crash loop is now louder than health, not quieter.                                                                                                    |
| `ContainerOOMKilled`     | cadvisor OOM counter increase                        | 0m  | Distinct cause, distinct fix.                                                                                                                                                     |
| `HostDiskSpaceLow`       | `< 20%` free, any host                               | 15m | Applies to app hosts and the monitoring host with the same rule, once host labels are correct.                                                                                    |
| `HighErrorRate`          | native HTTP 5xx ratio > 5%                           | 5m  | Off span-metrics.                                                                                                                                                                 |
| `TargetDown`             | `up == 0`                                            | 2m  | Monitoring host's own three targets.                                                                                                                                              |
| `OtelExportFailures`     | collector send-failed rates > 0                      | 5m  | Backend rejecting data.                                                                                                                                                           |
| `Watchdog`               | `vector(1)`                                          | 0m  | Always firing; routed to a heartbeat contact point on a short repeat interval. Its silence is the alarm.                                                                          |

Delivery: one contact point plus the heartbeat contact point. Grafana's core contact points
include Email, Webhook, Telegram, Discord, Slack, Pushover and PagerDuty; **ntfy is not native**,
so if you want ntfy use the generic webhook contact point. No paging rotation, no escalation
policy, no on-call schedule — there is one person, and there is no self-hostable on-call product
to reach for even if there were more.

**One Prometheus caveat that constrains this whole design**, worth stating where it will be read:
Prometheus's own OTLP guide says the OTLP receiver is "not considered an efficient way of
ingesting samples" and to "use with caution for specific low-volume use cases". CML *is* the
low-volume case that sentence carves out — a few hundred series per host at 30s — so pushing
metrics over OTLP is fine here and keeps the one-endpoint-one-credential rule intact. The
deciding factor for revisiting is volume: if a host ever exceeds a few thousand active series,
move infrastructure metrics to `prometheus.remote_write` behind an authenticating proxy and leave
only app metrics on OTLP. Also set `out_of_order_time_window: 30m` on Prometheus — the official
OTel guide requires it for OTLP ingestion, and without it late batches are silently dropped.

### 1.5 Labels: the boring thing that decides whether this scales

Every signal, from every source, carries exactly four identity labels:

- `project` — `relab`, and one per future project.
- `env` — `prod` | `staging` | `dev`.
- `service.name` — one stable name per deployable (`relab-api`, never `relab-api-prod-2`).
- `host.name` — the physical/VM host.

`host.name` is currently missing and its absence is a live bug, not a nicety: Alloy scrapes its
in-container node exporter, so Prometheus derives `instance` from an address that is identical on
every host. The moment a second host ships metrics, the series interleave and every host-level
alert becomes meaningless. Fix before anything else.

Cardinality rule, unchanged from the current onboarding doc and correct: user ids, request ids and
timestamps go in the log body or span attributes, never in labels.

### 1.6 Per-container resource metrics, and the Beszel question

This is the one place where "the operator will actually open it" is a design input rather than a
nicety, so it gets its own treatment. All of the below was verified against current docs
(August 2026).

**What produces the data: `prometheus.exporter.cadvisor` in Alloy.** It is a GA component
(Alloy v1.18.1, 2026-08-06), Linux-only, embedding cAdvisor — which is itself alive and shipping,
v0.60.5 on 2026-07-11. It emits exactly the series the stacked view needs, per container:
`container_cpu_usage_seconds_total`, `container_memory_working_set_bytes`,
`container_network_{receive,transmit}_bytes_total`, `container_fs_{reads,writes}_bytes_total`,
`container_fs_usage_bytes`, plus `container_start_time_seconds`, `container_oom_events_total` and
`container_health_state`.

**Operational cost, honestly stated:**

- *Privilege.* The Alloy docs' own Compose example runs the agent `privileged: true` with mounts
  `/var/run/docker.sock`, `/:/rootfs:ro`, `/var/run:rw`, `/sys:ro`, `/var/lib/docker:ro`,
  `/dev/disk:ro`. Relab's Alloy today is `user: root` with a read-only socket and read-only
  `/proc`, `/sys`, `/`. The honest reading: the container **already** holds the Docker socket,
  which is already root-equivalent on the host — adding `privileged` and two more mounts widens
  the mount surface but does not change the blast radius, which was total either way. The
  config's existing NOTE about the socket already says this. *Opposite choice is right if* you
  ever put a docker-socket-proxy in front of Alloy — at that point `privileged` genuinely is an
  escalation and cAdvisor should move to its own container. (Whether cAdvisor works without
  `privileged` given those mounts is commonly claimed and was not verifiable from the docs;
  try un-privileged first, it costs one restart to find out.)
- *Cardinality.* Set **`store_container_labels = false`** and **`docker_only = true`**. The
  default `store_container_labels = true` turns every container label and environment variable
  into a Prometheus label — on Compose that means `container_label_com_docker_compose_*` smeared
  across every series — and `docker_only = false` additionally emits raw systemd-slice cgroups
  that nobody will ever look at. Use `allowlisted_container_labels` for the two Compose labels
  actually wanted (it only takes effect when `store_container_labels = false`). With those two
  settings, a ~10-container host is a few hundred series, which is nothing.
- Leave cAdvisor's `process` metric kind disabled — it is off by default, correctly.

**Crash-loop detection.** cAdvisor has **no restart-count metric**; that was checked against the
full metric table. The signal is `container_start_time_seconds` moving:

```promql
changes(container_start_time_seconds{name!=""}[15m]) > 2
```

with `container_oom_events_total` and `container_health_state` alongside it for cause. A typed
`container.restarts` counter does exist — in the OTel Collector's `docker_stats` receiver, which
reads Docker's `State.RestartCount` — but it is alpha, disabled by default, **Alloy has no
`otelcol.receiver.docker_stats`**, and getting it means running a second agent (a full
otelcol-contrib) on every project host. That is a whole extra moving part to replace one
`changes()` expression. Not worth it. *Opposite choice is right if* the `changes()` rule proves
flaky in practice — re-evaluate then, on evidence.

**Is the stacked view an import or an authoring job? An import, with one caveat.**
[Dashboard 15798, "Docker monitoring"](https://grafana.com/grafana/dashboards/15798-docker-monitoring/)
is the pick: last revised 2025-07-12, 1.7M downloads, cAdvisor-based, stacked CPU / memory /
network / disk I/O per container with job and node filters.
[19792, "cadvisor dashboard"](https://grafana.com/grafana/dashboards/19792-cadvisor-dashboard/)
(2024-11-24) is the Compose-aware second choice — it has an explicit `compose_project` variable,
which matters once a second project onboards. Avoid the two that search results push hardest:
**10619** (6.2M downloads, untouched since 2019) and **893** (page still advertises Grafana 4
compatibility). Download counts on grafana.com measure inertia, not maintenance.

**The caveat, and it is the deciding factor.** Stock cAdvisor dashboards assume Prometheus
*scraped* cAdvisor: they key on `job`, `instance` and `name` as a scrape produces them. On the
OTLP path, Prometheus 3.x (current v3.14.0, 2026-08-18) reconstructs `job` from `service.name`
and `instance` from `service.instance.id`, and applies `otlp.translation_strategy`
(default `UnderscoreEscapingWithSuffixes`). Metric *names* here should survive untouched — they
are already underscore-only and already `_total`-suffixed, and the exporter sets no OTLP unit —
but that could not be confirmed from documentation, only from translator source behaviour.
The label *values* definitely change.

So: **run a 15-minute experiment before committing.** Point the cAdvisor exporter through the
existing OTLP path, wait for data, and check whether `container_cpu_usage_seconds_total` exists
in Prometheus with a `name` label.

- **If names survive** (expected): keep the single OTLP path, import 15798, and repoint its two
  template variables at `host.name`/`project` instead of `job`/`instance`. One-time, ~20 minutes.
  This preserves the "one endpoint, one credential" rule, which is worth more than a dashboard's
  pristine defaults.
- **If names are mangled**: do *not* reach for `otlp.translation_strategy: NoTranslation` — it is
  experimental and the docs warn about it. Instead route only the cAdvisor series natively
  (`prometheus.exporter.cadvisor` → `prometheus.scrape` → `prometheus.remote_write`), which costs
  a second public hostname and a second credential. That is a real architectural concession and
  should be made only against evidence, never pre-emptively.

**Per-process metrics: a trap at this scale.** On a Compose host, one container is one process
tree, one unit of blame and one unit of remediation — you restart, limit or roll back a
*container*, never a PID. Per-container is therefore exactly the right granularity, and the one
case where it is not (which Postgres backend is eating the box?) is answered by
`pg_stat_activity`, not by a metrics agent. Alloy does ship `prometheus.exporter.process`
(GA, embedding ncabatoff's process_exporter), and its own docs warn that matcher names using PID
or StartTime risk high-cardinality metrics — which is precisely the shape a curious operator
would reach for first. Skip it. The one free thing worth taking: node_exporter's `processes`
collector (`--collector.processes`, off by default in v1.12.1) emits about six aggregate series
per host — total processes, threads, state counts — which is genuinely free and occasionally
tells you a fork bomb from a memory leak. Add that, nothing more.

**Recommendation: retire Beszel, fold everything into Grafana.** Beszel (v0.18.8, 2026-08-17,
hub + agent on PocketBase) collects per-container CPU, memory and network history, plus host
CPU/memory/disk/network/temperature/fan, GPU, battery and S.M.A.R.T., and it has its own
threshold alerting over 20+ notification channels. Against the target design:

- Per-container charts: cAdvisor covers everything Beszel does **and adds per-container disk
  I/O**, which Beszel does not have.
- Alerting: keeping Beszel means a second alerting system with its own thresholds and its own
  notification channels — a direct violation of the "one home for alert rules" boundary, and a
  second place to look when something did *not* fire.
- Correlation: Beszel cannot put a CPU spike next to the log line and the trace that caused it.
  That is the whole reason the Grafana stack exists.
- Cost of keeping: a second web app, a second auth surface, a second thing to patch, and an
  agent on every host, all to display a subset of data already being collected.

The genuine loss is **S.M.A.R.T. disk health**, which nothing in the target design covers — put
`smartd` on the hosts with mail-to-operator, or accept the gap knowingly (it is listed in the
coverage table). GPU and battery are irrelevant here. The five-minute setup was worth a lot on
day one and is worth nothing on day 400.

*Opposite choice is right if*, three months after the cAdvisor dashboard lands, the operator finds
he still opens Beszel and not Grafana. That is a real signal, not a failure of discipline: a
monitoring system nobody opens only works when it alerts, and alerts are exactly what this setup
has historically got wrong. In that case the correct response is not "run both" but "make Grafana
the thing he opens" — set the Docker dashboard as Grafana's home dashboard, the way the monitoring
repo already does with Stack Health — and if *that* fails, keep Beszel and delete Grafana's
host-metrics ambitions instead. What must not happen is two systems each holding half the answer.

### 1.7 GPU hosts and batch CV workloads

CML expects to host computer-vision workflows for Relab on separate CML-controlled servers, Linux +
Docker Compose like everything else, on **consumer NVIDIA cards** (the reference machine is a
GeForce RTX 4090, 24564 MiB, driver 580.178.04, `nvidia` runtime installed in Docker with `runc`
still the default). Consumer, not datacentre, is the fact that decides almost everything below.

#### What collects GPU metrics

**Alloy has no native GPU component.** The full `prometheus.exporter.*` list was checked: apache,
azure, blackbox, cadvisor, catchpoint, cloudwatch, consul, databricks, dnsmasq, elasticsearch, gcp,
github, kafka, memcached, mongodb, mssql, mysql, oracledb, postgres, process, redis, self, snmp,
snowflake, squid, static, statsd, unix, windows. No nvidia, no gpu, no dcgm. `prometheus.exporter.unix`
(node_exporter) has no GPU collector either, and OTel Collector contrib has no NVIDIA receiver — all
114 receiver directories were enumerated. So the pattern is unavoidable: **an exporter container,
scraped by Alloy with `prometheus.scrape`.** No new agent, no new endpoint, no new credential.

**Use `utkuozdemir/nvidia_gpu_exporter` (v1.14.0, 2026-08-12) with its NVML backend, not
dcgm-exporter.** This is the opposite of the reflex answer, and the reason is the consumer card.
NVIDIA's own position, from a maintainer on dcgm-exporter issue #506, asked about exactly the
RTX 4090: *"DCGM_FI_PROF\_* metrics are only supported on datacenter grade GPUs. This is a hardware
limitation."\* That single sentence removes the entire reason to prefer DCGM — `GR_ENGINE_ACTIVE`,
`PIPE_TENSOR_ACTIVE`, `DRAM_ACTIVE`, `SM_ACTIVE`, PCIe and NVLink throughput all go away. DCGM's
feature matrix additionally gives GeForce only Level-1 diagnostics and no policy notification, and
consumer cards have no framebuffer ECC, so `DCGM_FI_DEV_ECC_*` is empty too. What is left is the
NVML field set — which is precisely what the nvidia-smi-based exporter already gives, without
`--cap-add SYS_ADMIN` (DCGM needs it *for the profiling counters GeForce cannot produce*).

The dashboard situation settles it. The canonical DCGM dashboard, ID 12239, has 39M downloads and
was last revised **2021-09-23**, and its panels lean on the DCP fields that will be blank on a
4090 — a half-empty dashboard is worse than none. Dashboard
[**14574, "Nvidia GPU Metrics"**](https://grafana.com/grafana/dashboards/14574), which matches
nvidia_gpu_exporter, was last revised **2026-08-04** (revision 15); its companion
[25547, "Nvidia GPU Overview"](https://grafana.com/grafana/dashboards/25547), for multi-GPU
comparison, was revised the same day. Import, don't author — same standard applied in §1.6.

*Opposite choice is right if* CML buys datacentre silicon (A100/H100/L40S). At that point DCP
profiling, ECC, NVLink and MIG all light up, dcgm-exporter becomes strictly better, and the switch
is one container swap plus one dashboard. Write that down; do not pre-build for it.

Deployment on a GPU host is one small container:

```yaml
nvidia-gpu-exporter:
  image: utkuozdemir/nvidia_gpu_exporter:latest-nvml   # pin the digest in practice
  restart: unless-stopped
  gpus: all                       # or device UUIDs — see attribution below
  environment:
    NVIDIA_DRIVER_CAPABILITIES: utility
  # no published ports: Alloy scrapes it over the compose network
```

#### Which metrics matter, and which are noise

Verified against the exporter's own RTX 4080 Super (same Ada generation) integration fixture:

| Want                    | Metric                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Utilisation             | `nvidia_smi_utilization_gpu_ratio`, `nvidia_smi_utilization_memory_ratio`                                                                       |
| VRAM used vs total      | `nvidia_smi_memory_used_bytes`, `nvidia_smi_memory_total_bytes`                                                                                 |
| Temperature             | `nvidia_smi_temperature_gpu`                                                                                                                    |
| Power                   | `nvidia_smi_power_draw_watts`, `nvidia_smi_enforced_power_limit_watts`                                                                          |
| **Throttling**          | `nvidia_smi_clocks_event_reasons_hw_thermal_slowdown`, `..._hw_power_brake_slowdown`, `..._sw_power_cap`, `..._sw_thermal_slowdown` (1/0 flags) |
| **GPU unhealthy**       | `nvidia_smi_gpu_recovery_action` (> 0 means the driver wants a reset — the best single health alert)                                            |
| **Driver-level faults** | `nvidia_smi_xid_errors_total{uuid,xid}` and `nvidia_smi_xid_last_timestamp_seconds{uuid,xid}` (NVML backend only)                               |
| Scrape self-health      | `nvidia_smi_last_collect_success`                                                                                                               |
| Identity join           | `nvidia_smi_gpu_info{uuid,name,driver_version,index}`                                                                                           |

**XID errors are the find here**, and they are the GPU analogue of the crash-loop blind spot: a
stuck kernel, an uncorrectable memory fault, or a card that has fallen off the bus are invisible to
`nvidia-smi` query fields and to utilisation graphs, and they are exactly what silently kills a
12-hour training run. Alert on the timestamp with an explicit code allowlist rather than on every
XID — most codes are application faults or informational:

```promql
time() - nvidia_smi_xid_last_timestamp_seconds{xid=~"48|62|64|74|79|95|119|120"} < 300
```

A rate-based expression misses a series' *first* event, because Prometheus never saw the zero
before it — which is the one event that matters most.

**Noise, on this hardware:** `nvidia_smi_pstate` (a performance state, not a load gauge — lower
means busier, and it will be misread), ECC counters (no framebuffer ECC on GeForce), everything
`DCGM_FI_PROF_*` (hardware-unsupported), MIG (Ada consumer silicon has none), PCIe throughput
(opt-in and it costs collection time), and the fixture's several dozen static identity and limit
gauges. The exporter emits **104 series per GPU** at defaults; a `metric_relabel_config` keep-list
of about fifteen names cuts that by ~85% and loses nothing anyone will look at.

#### Per-job attribution: partial, and mostly the wrong question

Honest answer, in three parts:

- **Per-process VRAM: yes**, via `--collect.compute-apps` →
  `nvidia_smi_compute_app_used_memory_bytes{pid,process_name,uuid}`. Confirmed working on the
  reference 4090 (`nvidia-smi --query-compute-apps` returns the expected shape). Inside a container
  it needs generous privileges — host PID namespace, likely privileged — or the PIDs cannot be
  mapped back to anything.
- **Per-process GPU *utilisation*: no.** The driver reports per-process memory only, never
  per-process SM time. The datacentre answers (DCGM per-process accounting, MIG partitioning) do
  not exist on Ada consumer silicon. This is a hardware fact, not a tooling gap.
- **Whole-GPU-to-container mapping: yes, but only with the tool we are not using.** dcgm-exporter
  has an opt-in "runtime container labels" feature that adds a `container` label from the host
  container runtime outside Kubernetes — and its own docs warn that *"mounting the runtime socket
  can expose privileged host control"*, and that it labels explicit GPU assignments only, so
  `--gpus 1`-style count assignments stay unlabeled.

**So: per-container GPU attribution is a trap at this scale, and the practical substitute is
scheduling, not metrics.** On a single-GPU box the question "which job is eating the GPU" has the
same answer as "which job is running", and that is already in the container logs Alloy ships and in
the per-container CPU/RAM charts from §1.6. Pin one training container per GPU by device UUID, and
treat whole-GPU utilisation as that container's utilisation. If two jobs genuinely need to share
one card, the fix is a queue — run them in sequence — not a better gauge; a metric that tells you
your job was starved after the fact has not helped you. And enabling per-process metrics has a real
cost: one series per PID, churning on every job restart, with `process_name` as a high-cardinality
label. If you turn it on, relabel `process_name` away.

*Opposite choice is right if* the GPU hosts become genuinely multi-tenant across research groups
and "did my job get starved" becomes a recurring dispute. Then dcgm-exporter with `--container-labels`
and pinned device UUIDs is the answer, and the privileged socket mount is the price.

#### Batch workloads are a different shape — and half of it is not a monitoring problem

Training and inference runs are long-lived batch, not request/response. RED metrics and traces are
close to useless for them: there are no requests, the "error rate" is zero until the single failure
that ends everything, and a trace of a twelve-hour job is one very long span. What matters maps
cleanly onto machinery this design already has, plus exactly one new collector.

| Question                               | Answer in the target design                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Did the job start, and did it finish?  | **healthchecks.io check per job**, pinged by `run_scheduled.sh`. A training run is a scheduled job; this is the existing pattern with a new name. Zero new infrastructure.                                                                                                                                                                                                                     |
| Did it fail, and why?                  | The `/fail` ping carries the job's own output (up to 100 kB) — the traceback lands in the alert email.                                                                                                                                                                                                                                                                                         |
| Is it progressing?                     | The job's own log lines (`epoch=`, `step=`, `loss=`) go to Loki via Alloy like every other container. A Grafana log panel filtered to the job is the progress view.                                                                                                                                                                                                                            |
| How long did it take versus last time? | **node_exporter's textfile collector.** The job writes `train_job_last_success_timestamp_seconds`, `train_job_duration_seconds`, `train_job_exit_code` to a `.prom` file; Alloy's `prometheus.exporter.unix` already exposes it. This is Prometheus's own recommendation for machine-level batch jobs.                                                                                         |
| Did it OOM on host RAM?                | `container_oom_events_total` from §1.6 — already covered.                                                                                                                                                                                                                                                                                                                                      |
| Did it OOM on VRAM?                    | Not an OOM-killer event; it is a CUDA exception in the job's log. A Loki-based Grafana alert on `CUDA out of memory` within the project's log stream, plus `nvidia_smi_memory_used_bytes / nvidia_smi_memory_total_bytes > 0.95`. This is the concrete alert that justifies §1.4's insistence on Grafana-managed rules — Prometheus rule files cannot express it.                              |
| Was it killed?                         | Container exit + the `/fail` ping.                                                                                                                                                                                                                                                                                                                                                             |
| **Did it produce correct output?**     | **Not a monitoring problem.** This belongs in the job script: assert the output exists, assert the row/file count is plausible, assert the checkpoint loads, and `exit 1` if not. The dead-man's switch then carries the assertion message into the alert. Any attempt to answer this from metrics is a data-validation system wearing an observability costume, and it will be worse at both. |

**Do not run a Pushgateway.** Its own docs say *"we only recommend using the Pushgateway in certain
limited cases"*, that the sole valid case is a *service-level* batch job, that it *"becomes both a
single point of failure and a potential bottleneck"*, that you *"lose Prometheus's automatic
instance health monitoring via the `up` metric"*, and that it *"never forgets series pushed to it
and will expose them to Prometheus forever unless those series are manually deleted"*. For
machine-level batch jobs the docs point at the textfile collector instead. Take that.

So: **same Grafana stack, same agent, same endpoint** — one new collector (textfile), one new
convention (jobs write a `.prom` file and ping a check), and one honest exclusion (output
correctness is the job's own assertion).

#### A GPU host is not a new host type

It is an app host with one opt-in module, and the onboarding story in §5 absorbs it unchanged:

- `templates/compose.telemetry.gpu.yml` — the exporter container, included alongside the standard
  telemetry overlay when `GPU=nvidia` is set in the host's `.env`.
- the shared `config.alloy` gains one conditional block scraping
  `nvidia-gpu-exporter:9835` at 30s with the keep-list, emitting nothing when the variable is unset.
- `templates/alerts/gpu.yaml.tmpl` — three rules: `GpuXidError`, `GpuRecoveryActionRequired`,
  `GpuThermalThrottling` (sustained `hw_thermal_slowdown` for 10m; a workstation card under a
  desk will hit this before anything else does).
- dashboards 14574 and 25547 imported once, centrally, keyed on the same `host.name` / `project`
  variables as everything else.

Per-project extra work for a GPU host: **one line in `.env`**. That is the test the design had to
pass, and it passes. GPU hosts genuinely do not need their own treatment — the only thing special
about them is one exporter and one hardware-specific alert family.

#### Interval, cardinality, retention

**Scrape GPU metrics at 30s**, the same as host metrics. Faster is tempting and pointless:
dcgm-exporter's own default collection interval is 30000 ms, so a faster scrape re-reads a cached
value, and nvidia-smi polling has a real cost on the host you are trying to keep free for training.
Go to 15s only if you specifically want to catch short thermal-throttle events, and only on the GPU
host. Retention stays the global 30 days — a training run you care about is analysed within days,
and if you need month-old GPU curves for a paper, that belongs in the experiment's own artefacts,
not in the ops TSDB.

**What would make Prometheus storage grow badly, in order of danger:** per-process series (one per
PID, unbounded churn, plus a high-cardinality `process_name`); the exporter's full 104-series
default set across several GPU hosts; and, if anyone later switches to dcgm-exporter,
`--kubernetes-enable-pod-labels`. The keep-list is the single control that prevents all three from
mattering — apply it from day one, because retro-fitting a keep-list does not shrink the series
already on disk.

#### Does GPU hosting change the Beszel recommendation?

**No — it strengthens the case for folding into Grafana, and the reasoning is worth stating rather
than leaving §1.6 to stand unqualified.** Beszel 0.18.8 does collect NVIDIA GPU metrics, so a fair
reading is "it now covers the GPU hosts too, keep it". That reading fails on what GPU failures
actually look like: the things that kill a CV run are XID errors, a driver recovery action, thermal
throttling that silently triples wall-clock time, and VRAM exhaustion — and diagnosing any of them
means putting the GPU curve next to *that job's log lines* on the same time axis. Beszel has
utilisation and temperature; it has no XID errors, no throttle-reason flags, no recovery-action
signal, and no way to line any of it up against a log stream it does not hold. Two systems each
holding half of a GPU incident is worse than one holding all of it.

The condition for the opposite answer is unchanged and still behavioural, not technical: if three
months after the Grafana dashboards land the operator still reaches for Beszel, the response is to
make Grafana the thing he opens — not to run both.

______________________________________________________________________

## 2. The delete list

Ordered by how much they cost to keep.

### 2.1 `scripts/deploy_watchdog.sh` — delete ~85% of it

250 lines running hourly on every deploy host. Check by check:

- **Check 1, API container health.** Delete. `ProjectTelemetrySilent` detects the same outage
  from outside the host, in 15 minutes rather than up to 60, and keeps working when the host
  itself is the thing that died. A local check of a local container is the weakest possible
  vantage point.
- **Check 2, newest restic snapshot age.** Delete, and delete `SNAPSHOT_AGE_PY` with it. This is
  the check that read GREEN through the incident — snapshot age is an artifact-shaped signal, and
  the lesson of a crash loop making it look *better* than healthy is that artifact-shaped signals
  are structurally wrong. It is also the most expensive check in the file: a `compose run` of the
  restic image, a 600-second timeout, a process-group dance, an `ExecStopPost` reaper. Everything
  it truly proves ("last night's backup succeeded") is already proven, better and sooner, by the
  `RELAB_PING_BACKUP` dead-man's switch, which knows the *job's exit status* rather than guessing
  from its output.
- **Check 3, backup timer enabled/active/last-run-failed.** Delete. A disabled timer produces no
  pings; healthchecks.io alarms one grace period later. A failed run pings `/fail` with the job's
  own output attached — strictly more information than `systemctl show -p Result`. The only loss
  is latency: up to ~26h instead of ~1h to learn the timer was disabled. For a daily job that is
  the correct trade.
- **Check 4, deployment drift (dirty checkout, ahead/behind upstream).** **Keep.** This is the one
  fact no central stack can see and no dead-man's switch encodes, and "prod carrying commits that
  exist nowhere else" is a genuine incident class. Extract it into a ~40-line
  `scripts/deploy_drift.sh` with its own hourly timer and its own healthchecks check.

Also delete the corresponding halves of `scripts/test_ops.sh` (the `SNAPSHOT_AGE_PY` and
`backup_timer_alerts` harnesses) and the `just watchdog` recipe, or repoint the recipe at the
drift script.

**Effect:** ~250 lines → ~40, one `compose run` per hour removed, one 600s timeout path removed,
`ExecStopPost` reaper for the watchdog path removed.

### 2.2 Alertmanager (monitoring repo)

The container, `config/alertmanager.yaml`, the `alertmanager_data` volume, the `tmpfs: /run/am` +
`printf ... > url_file` entrypoint workaround, the `amtool` validator in `just check`, and the
volume's mount in `just backup`. Replaced by provisioned Grafana alert rules and contact points.

### 2.3 The duplicate API log path

Relab's API exports logs over OTLP *and* Alloy ships the same container's stdout, because
`discovery.relabel` keeps every container in the Compose project. Every API log line is stored
twice, at double the Loki cost, with two slightly different shapes in the same stream view. Delete
one — recommended: the SDK log exporter (`OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED` and
the logs pipeline), leaving Alloy as the single log path for everything.

### 2.4 Beszel

Delete the instance and the agent. Full reasoning in §1.6: cAdvisor via Alloy reproduces its
per-container charts and adds per-container disk I/O, and dashboard 15798 is an import rather than
an authoring job. Keeping it means a second alerting system, a second auth surface, and a second
place the operator has to remember to look. The one thing genuinely lost is S.M.A.R.T. disk
health; cover it with `smartd` or accept it explicitly.

**Do not delete it until the cAdvisor dashboard is up and has been used for a couple of weeks.**
This is the one deletion on the list with a "prove the replacement first" precondition, because
the thing being replaced is not a control, it is a habit.

### 2.5 ONBOARDING templates 3 and 4

Template 3 (Loki Docker driver) and Template 4 (`loki.write` to a push hostname) both document a
path this stack deliberately refuses to expose, each with a paragraph explaining why you should
not use it. Template 3's stated reference implementation, Relab's `compose.logging.loki.yml`, no
longer exists. Delete both and replace with a single Template 3: "container logs and host metrics,
via the shared Alloy config" — the thing every project will actually do.

### 2.6 `compose.storage-s3.yml`

54 lines of speculative configuration for a disk-pressure problem that has not happened, on a
stack with a 30-day retention and a 15GB TSDB cap. Delete; the runbook paragraph pointing at
object storage is the part worth keeping. Re-add it the day `HostDiskSpaceLow` fires twice.

### 2.7 Tempo span-metrics as a dependency

Not Tempo itself — the `metrics_generator` remote-write and the dashboards/alerts built on
`traces_spanmetrics_calls_total`. Once RED comes from native OTLP metrics, delete the generator
config, its WAL volume path and the `service-graphs`/`span-metrics` processors. Tempo drops to
trace storage only. *Then* Tempo becomes a genuinely optional component you can delete on its next
breaking upgrade instead of debugging under pressure.

### 2.8 The false sentence in the docs

`docs/src/content/docs/operations/deployment.mdx` states that "the central Grafana stack alerts on
absence of telemetry". No such rule exists in `config/alerts/stack.yaml`. Either build the rule
(recommended, it is item 2 of the migration) or delete the sentence. A documented control that
does not exist is worse than a documented gap.

### 2.9 `hwmon` — keep the collector, delete the story around it

Keep the one line; thermal data on a physical box under a desk is cheap and occasionally telling.
But it is not the fix for the incident that motivated it, and the config comment currently implies
it is. Fan RPM is a symptom of load, and legitimate load spins fans too, so it will never carry a
usable alert threshold. The honest detector for that incident is `ContainerRestarting`. Fix the
comment so the next reader does not mistake a dashboard panel for a control.

### 2.10 Things NOT on the delete list, though you might expect them

- The monthly **restore-check** — this is the single most valuable job in the whole setup. It does
  a real `pg_restore` into a real Postgres and queries it. Almost nobody has this. Keep, and run
  it **weekly** rather than monthly (see the coverage table).
- `run_scheduled.sh` — 60 lines, one job, correct: per-job URLs so a frequent job cannot mask a
  rare one's silence, failure output posted as the body, missing URL degrades to "runs but does
  not report". Keep as-is; it becomes the shared wrapper other projects copy.
- The `demo/` service in the monitoring repo — it is the best onboarding asset there and doubles
  as the CI smoke test. Keep.
- Cloudflare Access on Grafana with email OTP — free, correct, and the reason Grafana's own login
  page is never internet-facing. Keep.
- The decision to expose no Loki hostname. Keep. It is the single best call in the current design.

______________________________________________________________________

## 3. Signal coverage

"Today" = current state. "Target" = after the migration in §7. Times are detection latency, not
time-to-fix.

| Failure mode                                                                              | Today: detector / latency                                                                                      | Target: detector / latency                                                                               |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| App host down (power, kernel, network)                                                    | watchdog ping stops → healthchecks / ~1h + grace                                                               | drift-job ping stops → healthchecks / ~1h + grace, **and** `ProjectTelemetrySilent` / 15m                |
| Docker daemon down on app host                                                            | watchdog check 1 / ~1h                                                                                         | `ProjectTelemetrySilent` / 15m                                                                           |
| Single container crash-looping                                                            | **NOBODY** (this is the formative incident, still open)                                                        | `ContainerRestarting`, `changes(container_start_time_seconds[15m]) > 2` / ~15m                           |
| Container OOM-killed repeatedly                                                           | **NOBODY**                                                                                                     | `ContainerOOMKilled` (`container_oom_events_total`) / immediate                                          |
| Backup silently not running (timer disabled, unit masked)                                 | watchdog check 3 / ~1h                                                                                         | healthchecks silence / ~26h                                                                              |
| Backup running but failing                                                                | `/fail` ping with output / minutes                                                                             | unchanged                                                                                                |
| Backup running, succeeding, producing nothing restorable                                  | monthly restore-check / **up to 31 days**                                                                      | weekly restore-check / up to 7 days                                                                      |
| Restic repo corruption                                                                    | `restic check` each run (metadata only, no `--read-data`) / 1 day                                              | unchanged + occasional `--read-data-subset` (see note)                                                   |
| Offsite copy silently failing while local succeeds                                        | backup job exit status → `/fail` ping / 1 day                                                                  | unchanged                                                                                                |
| Schema/code drift (prod ahead/behind/dirty)                                               | watchdog check 4 / ~1h                                                                                         | `deploy_drift.sh` / ~1h                                                                                  |
| Disk filling on the **monitoring** host                                                   | `HostDiskSpaceLow` / 15m                                                                                       | unchanged                                                                                                |
| Disk filling on an **app** host                                                           | **effectively NOBODY** — metrics ship, but `instance` collides across hosts and no app-host disk alert exists  | `HostDiskSpaceLow` / 15m, once `host.name` is correct                                                    |
| Collector down (central)                                                                  | `TargetDown` / 2m                                                                                              | unchanged                                                                                                |
| Loki / Prometheus / Tempo down                                                            | `TargetDown` or `OtelExportFailures` / 2–5m                                                                    | unchanged                                                                                                |
| Cloudflare tunnel down (central)                                                          | Grafana unreachable; heartbeat still delivered if egress works → noticed by the operator when they try to look | `ProjectTelemetrySilent` fires for every project at once = the signature of a central-side failure / 15m |
| Cloudflare tunnel down (**app** host) — site publicly unreachable, host otherwise healthy | **NOBODY.** Backups run, watchdog pings, Alloy ships. Every monitor reads green while the site is down.        | external HTTP prober / 5–10m                                                                             |
| OTLP token rotated on one side only                                                       | export errors in Alloy's own stdout, which nobody reads                                                        | `ProjectTelemetrySilent` / 15m                                                                           |
| Cert expiry                                                                               | N/A — Cloudflare-managed edge certs auto-renew, origin is cloudflared with no cert                             | unchanged (genuinely nobody needs to watch this)                                                         |
| Alerting pipeline itself broken                                                           | `Watchdog` → `HEARTBEAT_URL` → healthchecks / 5m + grace                                                       | unchanged, moved to a Grafana contact point                                                              |
| Monitoring host down entirely                                                             | heartbeat silence / minutes                                                                                    | unchanged                                                                                                |
| healthchecks.io itself down                                                               | nobody, but fails *loud* (false alarms), not silent                                                            | unchanged, accepted                                                                                      |
| Grafana Access misconfigured, locking the operator out                                    | nobody; discovered on next login attempt                                                                       | unchanged, accepted (the tofu config validates ≥1 email)                                                 |
| GPU driver fault mid-run (XID: stuck kernel, memory fault, card off the bus)              | **NOBODY** (no GPU host exists yet, and nothing would see it)                                                  | `GpuXidError` on the code allowlist / ~5m                                                                |
| GPU thermally throttling, silently tripling a run's wall-clock                            | **NOBODY**                                                                                                     | `GpuThermalThrottling` / 10m                                                                             |
| Training job OOMs on VRAM                                                                 | **NOBODY**                                                                                                     | Loki-based rule on `CUDA out of memory` + VRAM > 95% / 15m                                               |
| Training job dies, hangs, or never started                                                | **NOBODY**                                                                                                     | healthchecks check per job / one period + grace                                                          |
| Training job succeeds but writes garbage                                                  | **NOBODY**                                                                                                     | **still nobody, by design** — the job script asserts and exits non-zero; not an observability problem    |
| Impending disk hardware failure (S.M.A.R.T.)                                              | Beszel, on the one host that runs it                                                                           | **nobody**, unless `smartd` is installed — a deliberate, named gap opened by retiring Beszel             |
| Silent data loss inside the app (bad migration, orphaned rows)                            | **NOBODY**                                                                                                     | **still nobody** — out of scope for observability; belongs in backend tests and a data-integrity job     |

### Rows where the answer is "nobody", ranked

1. **Container crash-loop / OOM.** The known incident, still uncovered nineteen months of
   uptime later. Fix first.
1. **Public unreachability of an app host while the host is healthy.** Nothing in the design looks
   at the service from outside. The tunnel is a single point of failure with zero coverage.
1. **App-host disk filling.** The data is being shipped; the label bug and the missing rule mean
   nobody reads it.
1. **Silent application-level data corruption.** Correctly out of scope — name it so it is a
   decision, not an oversight.
1. **Every GPU failure mode.** Not a gap in the current design so much as a gap ahead of it — no
   GPU host exists yet, and nothing in today's setup would see one. §1.7 closes the whole family
   for the cost of one exporter container and three alert rules; the point is to onboard the first
   CV host *with* them rather than discover them the way the backup crash loop was discovered.
1. **Disk hardware failure.** Only covered today by Beszel's S.M.A.R.T. reporting, on one host,
   with nothing depending on it. Retiring Beszel makes this a real gap; close it with `smartd`
   mailing the operator (five minutes, one package) rather than by keeping a whole second
   monitoring system alive for one metric.

Note on restic verification (restic 0.19.1, 2026-07-05): `restic check` without `--read-data`
verifies structure and metadata only; it will not detect bit rot in pack files. The weekly
restore-check *does* read the data it restores, which covers the database path. `--read-data-subset`
accepts `n/t` (`1/12`), a percentage (`10%`) or a size (`50M`), so a monthly
`restic check --read-data-subset=1/12` covers the uploads path over a year at a twelfth of the I/O
per run. Be aware there is **no official cadence recommendation** — the docs say only that it is
"a good idea to regularly use the `check` command", and the widely-repeated "1/12 monthly" figure
is forum folklore. Pick a cadence, write down why, and treat the number as arbitrary-but-declared.

______________________________________________________________________

## 4. The fate-sharing question

**Keep the out-of-band signal. It is not optional, and the current per-job design is already the
right one.**

The argument against — "healthchecks.io is an external dependency too, so you have not removed the
single point of failure, you have moved it" — is true and does not matter, because the two failure
modes are asymmetric:

- If the **observability pipeline** fails (host dead, Docker dead, Alloy dead, tunnel dead, token
  wrong, collector dead, monitoring host dead), the result is **silence**, and silence is
  indistinguishable from health. Nobody is told. This is exactly how nineteen hours passed.
- If **healthchecks.io** fails, the result is a **false alarm**: pings do not arrive, you get an
  email, you investigate, you find the service is down. Wrong, annoying, immediately visible.

A monitoring system may fail loud. It may not fail silent. That asymmetry alone justifies the
external dependency, independent of any uptime numbers.

The second argument for it is structural: the dead-man's switch is the only detector in the whole
design whose *default state is alarm*. Everything else must successfully do work in order to
complain. Under a total failure, all of those go quiet together; a switch that alarms on absence
does not.

**Minimum viable form** — deliberately small, because each check is a thing to maintain:

Per project host, two checks:

1. **Liveness**, hourly. Pinged by the drift job. Answers "the host is up, Docker works, the
   checkout is sane". Period 1h, grace 30m.
1. **Backup**, daily. Pinged by the backup job with its exit status. Period 1 day, grace 6h.

Per project, one more if it has a restore-check: **restorability**, weekly, period 8 days.
Centrally, one: **heartbeat**, from the Grafana `Watchdog` rule, period 5m, grace 15m.

That is 3 checks per project + 1 central — 4 today, ~10 at three projects. The healthchecks.io
free "Hobbyist" tier is **20 checks**, so three or four CML projects fit with room to spare; the
ceiling is real but distant, and Business is free for open-source and non-profit use if it is ever
reached. Failure pings can carry the job's output as a request body up to **100 kB**, which is
what makes the current `run_scheduled.sh` design work. Delivery goes to email that reaches a
phone, not to a chat channel the operator may not be reading.

**What not to do about fate-sharing:**

- Do **not** self-host healthchecks. Self-hosted on the monitoring host it shares fate with
  everything; self-hosted anywhere else it is a fourth host to operate. The whole value is that
  someone else runs it.
- Do **not** add a second dead-man's-switch provider "for redundancy". Two providers double the
  false-alarm rate and halve the attention each alarm gets, which is how alerts stop being read.
- Do **not** route the heartbeat through the same webhook as normal alerts. Separate contact
  point, separate check — already correct today.

**The gap the dead-man's switch does not close**, and why the external prober is a separate item:
a switch proves the host can reach the internet. It says nothing about whether the internet can
reach the *service*. The tunnel can be down while every ping still arrives. That needs a probe
from outside, in a different failure domain from both the app tunnel and the monitoring tunnel.
Cheapest forms, in order of preference:

1. A **free external uptime monitor**. UptimeRobot's free tier is 50 monitors at a 5-minute
   interval with email alerts included — an order of magnitude more than CML will ever need, and
   zero infrastructure. (Better Stack's free tier is 10 monitors with email and Slack, also
   sufficient.) Take this.
1. A **scheduled GitHub Actions workflow** in the monitoring repo that curls each project's health
   URL and fails the job. Free and already-owned, but GitHub's own docs say scheduled runs "can be
   delayed during periods of high loads" and that "some queued jobs may be dropped", and that in a
   public repository scheduled workflows are **automatically disabled after 60 days with no
   repository activity**. Both caveats turn this into a monitor that can silently stop — the exact
   failure class this whole design exists to eliminate.

Take option 1. Option 2 is only right if the endpoints are not reachable from the public internet,
in which case neither works and the probe has to come from another CML host.

______________________________________________________________________

## 5. Onboarding a second project

Target: under an hour, and near-zero per-project bespoke work. The test of the design is that the
second project's telemetry setup is a *copy*, not a *port*.

### 5.1 What the central repo must publish

1. **`templates/alloy/config.alloy`** — one shared file, parameterised only by environment
   variables: `PROJECT`, `ENVIRONMENT`, `COMPOSE_PROJECT_NAME`, `HOSTNAME`,
   `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTLP_AUTH_TOKEN`. Logs + host metrics + container state.
   Relab's current `deploy/alloy/config.alloy` becomes this file, minus the two hardcoded
   `"relab"` strings and plus the `host.name` label and the cadvisor exporter. No project ever
   edits it.
1. **`templates/compose.telemetry.yml`** — the Alloy service definition, likewise parameterised.
   Relab's `compose.logging.alloy.yaml` is 90% of this already.
1. **`templates/run_scheduled.sh`** — the dead-man's-switch wrapper. Relab's is already generic
   apart from its job names.
1. **`templates/alerts/project.yaml.tmpl`** — the per-project Grafana alert rules
   (`ProjectTelemetrySilent`, `ContainerRestarting`, `ContainerOOMKilled`, `HostDiskSpaceLow`,
   `HighErrorRate`), with `{{project}}` and `{{env}}` substituted.
1. **`bootstrap.sh <project> <env>`** — the whole onboarding, one command. It:
   - renders `templates/alerts/project.yaml.tmpl` into
     `config/grafana/provisioning/alerting/<project>-<env>.yaml` and reloads Grafana;
   - creates the project's healthchecks.io checks via the API and prints their ping URLs;
   - prints the exact block of environment variables to paste into the project host's `.env`;
   - prints the `curl` line that vendors the two template files into the project repo at a
     pinned tag.
1. **`templates/compose.telemetry.gpu.yml`** — the opt-in GPU module (§1.7): the exporter
   container, one conditional scrape block in the shared Alloy config, and
   `templates/alerts/gpu.yaml.tmpl`. Activated by a single `GPU=nvidia` line in the host's `.env`.
1. **Generic dashboards.** This is the real scalability lever and the thing currently missing:
   `relab-api.json` is a per-project dashboard, and N projects means N hand-maintained
   dashboards. Replace with three dashboards carrying a `project` template variable — *Service
   Health*, *Logs*, *Host & Containers* — so a new project gets full dashboards the moment its
   first telemetry lands, with nobody editing JSON.

### 5.2 What the project has to do (the whole checklist)

1. Vendor two files at a pinned tag into `deploy/telemetry/` (one `curl`, checked in).
1. Add six variables to the host's root `.env`: endpoint, token, `PROJECT`, `ENVIRONMENT`, and the
   two ping URLs.
1. Include the telemetry overlay from the deploy recipe when the endpoint variable is set — the
   conditional-include pattern Relab already uses.
1. If the app is Python/FastAPI: set the five `OTEL_*` variables and run under
   `opentelemetry-instrument`. Zero code changes. If not: skip, and still get logs, host metrics
   and container state from Alloy.
1. If it has scheduled jobs: copy `run_scheduled.sh`, wrap the jobs, wire the ping URLs.
1. If it is a GPU host: add `GPU=nvidia` to `.env`. That is the entire GPU onboarding.
1. Run `bootstrap.sh <project> prod` on the monitoring host.

Steps 1–3 are ~10 minutes, step 4 is ~15, steps 6–7 are ~3. Step 5 is the only variable one.

### 5.3 Conventions that must be enforced, not merely documented

The onboarding doc already states the `service.name` / `env` / cardinality rules and they are
correct. Add `project` and `host.name` as required, and make the shared Alloy config set all four
so a project cannot get them wrong by omission. The rules only scale if the template applies them.

### 5.4 What deliberately does not scale, and is fine

One tenant, one token, one Grafana org, one retention policy for everyone. Loki multi-tenancy,
per-project tokens and per-project Grafana folders with permissions are all available and all
wrong here: they exist to stop teams seeing each other's data, and there is one operator.
*Opposite choice is right if* a project ever ingests data that other CML projects must not see —
then Loki `auth_enabled: true` with `X-Scope-OrgID` per project, and a token per project, and that
is a day of work, not a redesign.

______________________________________________________________________

## 6. What not to build

Ranked by how appealing the trap is.

1. **A second alerting engine "for redundancy".** Alertmanager beside Grafana alerting, or a
   backup notifier. Both live on the same host and die together; the redundancy is theatre. The
   heartbeat is the real answer.
1. **Per-project Grafana dashboards.** Feels like care, becomes N files to update whenever a panel
   convention changes. One dashboard with a `project` variable, always.
1. **Loki multi-tenancy, per-project OTLP tokens, Grafana teams/folders/permissions.** Solves an
   organisational problem that does not exist at one operator. Revisit only on a data-sensitivity
   requirement.
1. **SLOs and error budgets.** They exist to arbitrate between teams shipping features and teams
   holding a pager. With one person who is both, they generate paperwork and no decisions.
1. **Grafana OnCall / paging schedules / escalation policies.** One person, one phone, one email.
1. **Continuous profiling (Pyroscope), eBPF auto-instrumentation (Beyla), synthetic browser
   monitoring, RUM.** Each is a whole subsystem answering a question a research platform with a
   handful of users has not yet asked. Add profiling the first time you have a performance
   problem you cannot solve with traces.
1. **A public status page.** The users are a research group; an email is faster to write and
   faster to read than a page nobody has bookmarked.
1. **Alerting on more things.** Every alert added without a decision attached ("when this fires I
   will do X") converts into background noise and taxes every other alert. If a rule fires and the
   response is "huh, interesting", delete the rule. Ten total is a ceiling, not a target.
1. **Long retention.** 30 days of logs and metrics, 7 of traces, is right for debugging. Anything
   longer is capacity planning for a system that does not need capacity planning, paid for in
   disk pressure — the one failure that destroys all history at once.
1. **Terraforming healthchecks.io, or a custom exporter for anything.** The whole external-signal
   layer is four URLs in a host file. Writing 200 lines of Python to expose them as Prometheus
   metrics puts them back inside the fate-sharing boundary they exist to escape.
1. **A Pushgateway for batch/ML jobs.** The most appealing trap in the GPU section: it looks
   like the obvious way to get "job finished" into Prometheus, and Prometheus's own docs say it
   becomes a single point of failure, kills `up`-based health monitoring, and never forgets a
   series. Textfile collector plus a dead-man's-switch check, as in §1.7.
1. **Per-process or per-container GPU attribution**, before two jobs actually contend for one
   card. Unbounded PID-keyed series, a privileged exporter, and a host PID namespace, to answer a
   question that scheduling answers for free. See §1.7.
1. **dcgm-exporter on consumer cards.** The reflex choice, and on a GeForce it costs
   `--cap-add SYS_ADMIN` and a five-year-old dashboard to deliver a subset of what a much smaller
   exporter already gives.
1. **A metrics pipeline that derives metrics from logs.** Tempting for the crash-loop alert.
   cadvisor already emits the number; derive nothing.
1. **Kubernetes, or a Compose-to-Nomad migration "for the ops story".** Out of scope by
   instruction and correct — the runtime is not the problem, the missing alerts were.

______________________________________________________________________

## 7. Migration path

Ordered so that the highest-value gap closes first and each step is independently shippable.
Effort estimates assume familiarity with the code and no surprises.

| #   | Step                                                                                                                                                                                                                                                                                                  | Effort                 | Why here                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Add `host.name` (and a real `instance`) to Alloy's metric and log labels.** Two relabel rules in the shared config.                                                                                                                                                                                 | 30 min                 | Blocks every multi-host alert. Nothing downstream is correct until this is done.                                                                                                   |
| 2   | **Add `prometheus.exporter.cadvisor` to Alloy** with `store_container_labels = false`, `docker_only = true`; then the `ContainerRestarting` and `ContainerOOMKilled` rules. Verify by deliberately crash-looping a throwaway container. Includes the 15-minute OTLP metric-name experiment from §1.6. | 1–2 h                  | Closes the formative incident's blind spot **and** delivers the per-container resource charts. Highest value in the list.                                                          |
| 3   | **Add `ProjectTelemetrySilent`** for `relab/prod` and `relab/staging`. Verify by stopping Alloy.                                                                                                                                                                                                      | 1 h                    | Closes the second-largest gap and retires watchdog check 1. Also makes the deployment docs true.                                                                                   |
| 4   | **Add the external HTTP prober** for the public site.                                                                                                                                                                                                                                                 | 30 min                 | Closes the only failure mode where literally every monitor reads green while the service is down.                                                                                  |
| 5   | **Kill the duplicate log path** — drop the SDK log exporter, leave Alloy as sole log owner.                                                                                                                                                                                                           | 30 min                 | Halves log storage, removes a confusing double-shaped stream.                                                                                                                      |
| 6   | **Shrink `deploy_watchdog.sh` to `deploy_drift.sh`.** Delete checks 1–3, `SNAPSHOT_AGE_PY`, `backup_timer_alerts`, their test harnesses, and the associated timeout/reaper machinery. Repoint the timer.                                                                                              | 1–2 h                  | Only safe *after* 2–4 land, since those are what replace the deleted checks.                                                                                                       |
| 7   | **Move alert rules into Grafana provisioning; delete Alertmanager** and its volume, config, entrypoint hack, `amtool` check and backup mount. Re-point the heartbeat at a Grafana contact point.                                                                                                      | 2–3 h                  | Largest single deletion; also unlocks Loki-querying rules for the future.                                                                                                          |
| 8   | **Generalise dashboards to a `project` variable** (Service Health, Logs, Host & Containers); move RED off span-metrics onto native OTLP HTTP metrics; delete Tempo's `metrics_generator`.                                                                                                             | 2–3 h                  | Turns per-project dashboard work into zero and de-risks Tempo.                                                                                                                     |
| 9   | **Extract the templates + `bootstrap.sh`** into the monitoring repo; re-vendor Relab from the templates so Relab is proof the path works.                                                                                                                                                             | 2–3 h                  | The scalability payoff. Do it while Relab is still the only consumer and drift is free to fix.                                                                                     |
| 10  | **Import dashboard 15798**, set it (or Stack Health) as Grafana's home dashboard, add `smartd`, enable node_exporter's `processes` collector. Then, after a couple of weeks of actually using it, **delete Beszel**.                                                                                  | 1 h + a waiting period | Replaces a habit, not just a control — so the replacement must be in use before the original goes.                                                                                 |
| 11  | **Housekeeping deletions**: ONBOARDING templates 3–4, `compose.storage-s3.yml`, the false telemetry sentence in `deployment.mdx`, the misleading `hwmon` comment.                                                                                                                                     | 30 min                 | Cheap, and each one removes a wrong signal from a future reader.                                                                                                                   |
| 12  | **Build the GPU module before the first CV host exists**, not after: the exporter overlay, the scrape block with its keep-list, the three alert rules, dashboards 14574/25547, and the textfile-collector convention for batch jobs.                                                                  | 2–3 h                  | The whole point of §1.7 is that the first GPU host is onboarded *with* observability. Every hour of this spent after the first long training run is an hour spent debugging blind. |
| 13  | **Move restore-check to weekly**; add `restic check --read-data-subset=1/12` to the monthly slot.                                                                                                                                                                                                     | 30 min                 | Cuts worst-case "backups are not restorable" latency from 31 days to 7, and starts covering bit rot on the uploads path.                                                           |

Total: roughly **16–21 hours**, of which the first four steps (~4 hours) close every "nobody"
row that is in scope.

Sequencing constraint worth respecting: **do not do step 6 before steps 2–4.** Deleting the local
watchdog checks before their central replacements are verified trades a weak signal for none.

______________________________________________________________________

## 8. Verification status

Everything in this document was checked against current primary documentation in August 2026, not
recalled. Versions used: Grafana 13.2.0 (2026-08-18), Prometheus 3.14.0 (2026-08-18), Loki 3.7.6
(2026-08-06), Tempo 3.0.3 (2026-08-13), Alloy 1.18.1 (2026-08-06), cAdvisor 0.60.5 (2026-07-11),
node_exporter 1.12.1 (2026-07-14), restic 0.19.1 (2026-07-05), Beszel 0.18.8 (2026-08-17).

**Verified and load-bearing:** Grafana OSS file-provisions alert rules, contact points and
notification policies; Grafana's built-in Alertmanager handles only Grafana-managed alerts and has
no documented external-ingestion endpoint; Grafana OnCall OSS is archived (2026-03-24); Loki still
ships with no authentication; `prometheus.exporter.cadvisor` is GA in Alloy and cAdvisor has no
restart-count metric; the OTel `docker_stats` receiver is alpha and has no Alloy equivalent;
Cloudflare Free gives 5 WAF custom rules, 1 IP-only rate-limit rule and no regex operators;
healthchecks.io free is 20 checks with a 100 kB ping body; UptimeRobot free is 50 monitors at 5
minutes; GitHub Actions schedules skew, drop, and are disabled after 60 days of public-repo
inactivity; `restic check --read-data-subset` accepts `n/t`, `%` and size forms.

GPU-specific, verified 2026-08-19: Alloy has no NVIDIA component (full exporter list checked);
OTel Collector contrib has no NVIDIA receiver (all 114 receiver directories enumerated);
`DCGM_FI_PROF_*` is datacentre-only per an NVIDIA maintainer answering about the RTX 4090
specifically (dcgm-exporter issue #506); DCGM's feature matrix gives GeForce Level-1 diagnostics
only and no policy notification; dcgm-exporter is 4.6.0-4.8.3 (2026-07-15) and needs
`--gpus all --cap-add SYS_ADMIN`; nvidia_gpu_exporter is v1.14.0 (2026-08-12) and emits 104 series
per GPU at defaults; dashboard 12239 was last revised 2021-09-23 while 14574 and 25547 were both
revised 2026-08-04; Prometheus's Pushgateway guidance and its textfile-collector recommendation are
quoted verbatim in §1.7. Locally confirmed on the reference machine: RTX 4090 / 24564 MiB /
driver 580.178.04, `nvidia` runtime present with `runc` as default, and
`nvidia-smi --query-compute-apps` returns the expected per-process shape.

**Still unverified — confirm before relying on:**

- **Whether cAdvisor metric names survive the OTLP round trip intact.** The suffix rules live in
  translator code, not in a doc page. This is the single experiment that decides between "import a
  dashboard" and "add a second ingestion path" (§1.6). Fifteen minutes to settle empirically.
- **Whether Alloy's cAdvisor exporter genuinely needs `privileged: true`** given the documented
  mount set, or whether the mounts alone suffice. The Alloy docs' Compose example uses
  `privileged`; whether it is required was not stated. One restart to find out.
- **Whether a Grafana-managed rule can query Loki.** Grafana-managed rules can query any backend
  datasource declaring `alerting: true`, and Loki is a core backend datasource, but no doc page
  names Loki explicitly. Low risk; confirm in the rule editor before writing log-based alerts.
- **Grafana notification-policy repeat interval rounding** to a multiple of the group interval
  (Alertmanager semantics). Affects only how tight the heartbeat can be; set group interval low.
- **`systemctl show -p NRestarts`** is a real D-Bus property but is not documented in
  systemd.service(5). Irrelevant if the design keeps restart detection in cAdvisor, which it does.
- **healthchecks.io free-tier team-member count and per-tier integration limits** — the pricing
  page states checks and log retention only.
- **Cloudflare's free-plan Zero Trust seat count and whether Tunnel is contractually free.**
  Neither the widely-repeated "50 seats" figure nor a statement that Tunnel is free appears
  anywhere on developers.cloudflare.com. Both work today; neither is documented. Check the
  dashboard before adding a second operator.
- **Absence of framebuffer ECC fields on GeForce** was confirmed only from observed exporter
  output, not from an explicit NVIDIA statement. Immaterial — the design does not alert on ECC.
- **restic `--read-data-subset` cadence.** There is no official recommendation; the "1/12 monthly"
  convention is folklore. The number in §7 is declared, not derived.
