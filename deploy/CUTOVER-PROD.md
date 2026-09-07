# Production cutover: `main` → the MVP release

One-time runbook for upgrading the production host from the `main` revision to the current release.
Written 2026-08-03. The role-hardening, encryption, and restic steps (5, 8a, and 10) never reached
prod before this runbook.

Prod's Alembic revision is `6f2b9e4a1c3d`.

> **Every revision literal and migration count below is a historical observation, not a current
> fact.** Written 2026-08-03 (head `f1a2b3c4d5e6`, 20 migrations); as of 2026-08-18 the head was
> `c4f7b1e93a20` and prod had 27 to apply. Re-derive before the window:
>
> ```bash
> cd backend
> uv run alembic heads                            # the revision step 9 must find
> uv run alembic history -r 6f2b9e4a1c3d:head     # prod's revision + each pending one
> ```
>
> That range includes prod's own revision, so one fewer migration runs than lines printed. Only the
> *count* moves: the path is still forward-only and still one transaction.

Prod's *code* is not literally at `main`: it sits on a pre-rewrite lineage of the working branch
from April (step 0). For deployment purposes the two are equivalent: prod's tip and `main` declare
the **same** Compose services (`api`, `app-site`, `docs-site`, `web-site`, `migrator`, `postgres`,
`redis`, `cloudflared`, `postgres-backup`, `uploads-backup`), the **same** volumes (`database_data`,
`user_uploads`, `cache_data`), the same `relab_prod` project name, the same `backend/.env.prod`
config mechanism, and the same migration lineage. Everything below phrased as "on `main`" applies to
the host as it is.

## What makes this cutover different

The deployment layout itself changed:

- Backend configuration moves out of a hand-maintained `backend/.env.prod` into 16 files under
  `secrets/prod/`. **`backend/.env.prod` is no longer read at all.** `main` had no secret-file
  mechanism, so these files must be created from the values in `backend/.env.prod`.
- Three least-privilege database roles and the `pg_stat_statements` extension are expected to
  exist. `provision.sh` creates them, and since 2026-09-06 `prod-up` runs it on every start; step 5
  runs it once by hand so the result can be checked before the window.
- OAuth tokens and YouTube broadcast keys are stored **in plaintext** on `main` (it has no
  `data_encryption_key`). They need a one-time encryption pass.
- Five services were renamed, so the old stack must be stopped from the *old* checkout or it leaves
  orphaned containers running.
- Backups become an encrypted restic repository. `main` has no restic tooling, so this is
  first-time setup.
- ClamAV is new and needs 3–4 GiB; `up` starts it unless `MALWARE_SCAN_ENABLED=false`.

Staging finished its own cutover on 2026-09-06 and is operated from
[DEPLOY-STAGING.md](DEPLOY-STAGING.md). Staging shares `compose.deploy.yaml` with prod, so anything
unfinished there is also unrehearsed here.

Read sections 0 and 1 fully before touching anything. Steps 2–6 are preparation and can be done
ahead of the window; the outage starts at step 7.

______________________________________________________________________

## 0. Establish what prod actually is — do this first

This section was run on 2026-08-03 and its findings are recorded below. Re-run it on the day of the
cutover; the host can move.

On the deploy host:

```bash
cd /path/to/relab
git status                        # dirty tree? uncommitted hotfixes?
git log --oneline -5              # what revision is actually deployed
git fetch origin
git log --oneline origin/main..HEAD   # see the caveat below before reading this

# Actual Alembic revision (the real input to the migration plan)
docker compose -p relab_prod exec -T postgres \
  psql -U "$PGSUPERUSER" -d relab_db -c 'SELECT version_num FROM alembic_version;'

# Which config mechanism is live
ls -la backend/.env.prod 2>/dev/null   && echo 'env-file config (main-era)'
ls -la secrets/prod/ 2>/dev/null        && echo 'secret files already present'

# Cluster superuser and whether the least-privilege roles exist
docker compose -p relab_prod exec -T postgres psql -U "$PGSUPERUSER" -d relab_db -c '\du'
```

### What this found (checked 2026-08-03)

Prod is **not** at `main`. It sits on a pre-rewrite lineage of the working branch, tip `2abd707e`
dated **2026-04-24**, older than the `frontend-app/` → `app/` rename.

The working branch history was rewritten, so prod's commits never appear in `origin`: the same
release commit exists twice under different hashes (`5e13df20` on prod vs `39c58600` on `main`).
`origin/main..HEAD` therefore lists ~70 commits that are mostly a rewrite artifact. Comparing by
content:

- The six commits after prod last merged `main` are all 2026-04-24, and their content is already in
  the release. The one functional change among them, the `numColumns` paging fix (`83b2dda0`),
  survives verbatim in `app/src/features/products/screenData.ts`. The rest (CI workflow
  consolidation, biome schema paths, an Expo Dockerfile env fix, linting) are superseded.
- **Nothing needs porting off the prod host.** Verify this again before the window.

The old lineage is preserved locally as the branch `backup/pre-rewrite-working`, which is **not on
origin**. Push it before the cutover:

```bash
git push origin backup/pre-rewrite-working
```

Because the histories diverged, do not `git pull` or merge on prod; it will conflict across the
directory rename. Tag the current state, then check the release out cleanly:

```bash
git tag prod-pre-mvp-$(date +%Y%m%d) && git push origin --tags   # if origin is reachable
git checkout <release-branch> && git pull --ff-only
```

### The schema plan is unaffected

Prod's Alembic revision is `6f2b9e4a1c3d`, and the migration surface at prod's April tip is
**identical to `main`**: 20 files, no extras. The forward-only path applies unchanged (27 migrations
to `c4f7b1e93a20`, re-derive on the day). It was verified by replaying it against a seeded scratch
database at `6f2b9e4a1c3d`.

The four answers that drive the rest of this document:

| Question                                 | Answer as of 2026-08-03                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Alembic revision                         | `6f2b9e4a1c3d` — matches `main`, so the forward-only plan applies unchanged (27 migrations as of 2026-08-18) |
| `backend/.env.prod` present?             | Yes — it is the **source** for the secret files created in step 4                                            |
| `secrets/prod/` present?                 | No — step 4 creates all 16 from scratch                                                                      |
| Superuser name, `relab_*` roles present? | Custom name from `backend/.env.prod`; no `relab_*` roles, so step 5 is required                              |

Re-confirm these on the day.

`$PGSUPERUSER` throughout this document is whatever that `\du` reports. On `main` it came from
`backend/.env.prod`, so it is **not** necessarily `postgres`.

## 0a. Rehearse, and confirm the release gates — before the window

None of these touch the prod host, and all three are cheaper to fix now than mid-outage.

### Rehearse the whole thing on staging

Staging shares `compose.deploy.yaml` with prod, driven by the host's root `.env`, so a full
`staging-*` pass rehearses steps 4 through 10:

```bash
just staging-build
just staging-up YES
just staging-migrate YES
just backup staging          # initializes the repo; the smoke test needs a snapshot
just restore-check staging
```

Do this even if staging's data is uninteresting; the *procedure* is what is rehearsed.

### Adopt the monitoring templates at `v0.3.0`

The monitoring stack changed both what a spoke ships and what watches it, so re-vendor before the
window and land it on staging first. Two things move:

- The agent keeps only the four cAdvisor metrics the central stack reads and drops its own histogram
  buckets: roughly 1,000 fewer series per host, none of them queried by anything here.
- The gateway counts ingest per project, and `ProjectTelemetrySilent` and `ProjectsUncovered` now
  key on those counters rather than scanning every series a project sends. A project shipping only
  logs or only traces is covered at last, and a sender that sets no `project` resource attribute is
  counted as `unknown` and alerts as uncovered. `compose.deploy.yaml` already sets
  `OTEL_RESOURCE_ATTRIBUTES: project=${PROJECT},env=${ENVIRONMENT}`, so nothing changes for the API.

```bash
git -C ../monitoring fetch --tags && git -C ../monitoring checkout v0.3.0
cp ../monitoring/templates/compose.telemetry.yml     compose.telemetry.yml
cp ../monitoring/templates/compose.telemetry.gpu.yml compose.telemetry.gpu.yml
cp ../monitoring/templates/alloy/config.alloy        deploy/alloy/config.alloy
cp ../monitoring/templates/run_scheduled.sh          scripts/run_scheduled.sh
sed -i 's/Vendored at \*\*`v0.2.0`\*\*/Vendored at **`v0.3.0`**/' deploy/README.md
git diff --stat   # four vendored files and the tag line in deploy/README.md, nothing else
```

Commit that on its own. `GPU_METRICS` stays: `scripts/deploy_ops.sh` reads it to decide whether to
include the GPU overlay, which is this repo's convention rather than the monitoring stack's.

**The agent config is a bind mount, so `up -d` does not reload it.** A host that pulls the new
config keeps running the old one until the container is replaced:

```bash
docker restart "$(docker compose -p relab_staging ps -q alloy)"   # relab_prod on the prod host
```

### Confirm the CI gate actually blocks merges

`just ci` runs in `.github/workflows/ci.yml`, whose terminal job is `ci-result` (context
`CI Result`). Protection lives in a GitHub ruleset, not in the repository, so check it through the
API (the legacy `branches/main/protection` endpoint 404s for rulesets):

```bash
gh api repos/:owner/:repo/rules/branches/main \
  --jq '.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context'
```

`CI Result` must appear. If it does not, every gate in this release is advisory. Record the answer
as launch evidence.

### Read what release-please proposes

`CHANGELOG.md` already carries a hand-written `v0.3.0` section; `release-please` still owns the
version bump from the squash commit on `main`. The repository's squash default pastes every
branch commit into the commit body, so override the message in the merge dialog (or with
`gh pr merge --squash --subject ... --body-file ...`): subject `feat!: release v0.3.0`, body with a
`BREAKING CHANGE:` footer. With `bump-minor-pre-major: true` that resolves to `0.3.0`.

The release PR it opens bumps every version string (`CITATION.cff`, `backend/app/__version__.py`,
`app/app.json`, and each `package.json`) and prepends a generated changelog section. For this
release, keep the hand-written section and delete the generated one. Set `date-released` in
`CITATION.cff` by hand; release-please only rewrites versions.

```bash
gh pr list --label 'autorelease: pending' --state open
```

Confirm the version, changelog, and release notes match this release's scope **before** merging
that PR. The GitHub release it publishes gets the changelog section as its body, as `v0.2.0` did.
Zenodo archives the release on its own; the concept DOI in `CITATION.cff` resolves to it.

## 0b. Abort rule

Do not remove the old volume, the old backup directory, or `backend/.env.prod` until all of the
following hold:

- the post-upgrade verification in step 9 passes,
- an upload, an OAuth login, and a product page have been exercised by hand,
- `just restore-check prod` succeeds.

The migration runs as a **single transaction** (`backend/alembic/env.py` never sets
`transaction_per_migration`), so any failure during step 8 rolls the schema back to `6f2b9e4a1c3d`
untouched: no partial state, no `alembic stamp` repair. One statement escapes that transaction (a
`CONCURRENTLY` index drop); see "The seven migrations added after this runbook was written" in §3.
It is idempotent, so a retry is still clean. The irreversible risks are the *data* losses flagged in
step 3, for which the pre-upgrade dump is the only recovery path.

______________________________________________________________________

## 1. Preparation on the deploy host (no downtime)

```bash
cd /path/to/relab
git fetch origin
git status                 # confirm a clean tree before switching
```

Record the current state while the old stack is still running:

```bash
docker ps -a --format '{{.Names}}\t{{.Image}}' | tee ~/relab-cutover/containers-before.txt
docker volume ls | grep relab | tee ~/relab-cutover/volumes-before.txt
```

Volumes are **not** renamed in this release: `relab_prod_database_data`, `relab_prod_user_uploads`,
and `relab_prod_cache_data` carry over untouched, and the project name is still `relab_prod`.

### 1a. Decide whether to run ClamAV

`up` starts `clamav` (the `scanning` profile) unless the root `.env` says `MALWARE_SCAN_ENABLED=false`.
It needs 3–4 GiB of RAM, and its first start downloads virus signatures into a fresh `clamav_db`
volume, which can take several minutes during which the API stays unhealthy.

```bash
free -g
```

Without enough RAM, set `MALWARE_SCAN_ENABLED=false`. Uploaded files are then not checked for
malware on a platform that accepts uploads from external contributors; treat it as an explicit,
temporary accepted risk.

______________________________________________________________________

## 2. Take the backup that everything else depends on

```bash
mkdir -p ~/relab-cutover
docker compose -p relab_prod exec -T postgres \
  pg_dump -U "$PGSUPERUSER" -d relab_db --format=custom \
  > ~/relab-cutover/prod-pre-mvp.dump

docker run --rm \
  -v relab_prod_user_uploads:/uploads:ro \
  -v ~/relab-cutover:/out \
  alpine:3.22 tar -C /uploads -czf /out/user_uploads-pre-mvp.tar.gz .

ls -lh ~/relab-cutover        # both must be non-empty
```

`$PGSUPERUSER` is whatever your cluster was initialized with (see step 5); it is very likely **not**
`postgres`.

Also preserve the old backup directory: the release replaces the plain-copy backup services with an
encrypted **restic** repository, and the new tooling cannot read the old dumps.

```bash
cp -a "${BACKUP_DIR:-./backups}" ~/relab-cutover/old-backups
```

______________________________________________________________________

## 3. Pre-flight data checks (read-only, run against live prod)

Run these *before* the window. Each one exists because a migration either aborts or destroys data.
Record every number; step 9 compares against them.

```bash
docker compose -p relab_prod exec -T postgres psql -U "$PGSUPERUSER" -d relab_db
```

```sql
-- A. Email canonicalization (f8a91c2d4e6b) ABORTS the whole upgrade on a hit.
SELECT lower(btrim(email)) AS canonical, count(*), array_agg(email)
FROM "user" GROUP BY 1 HAVING count(*) > 1;

SELECT id, email FROM "user"
WHERE email IS NULL OR email <> btrim(email)
   OR email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
   OR email ~ '[^[:ascii:]]' OR length(email) > 254;
-- Both MUST return 0 rows. Fix the offending rows first; the migration
-- cannot be told to skip them.

-- B. Recording sessions (8b70d4c2f1a9) are DELETED unconditionally.
SELECT count(*) FROM recording_session;      -- must be 0, else a recording is in flight
SELECT * FROM recording_session;             -- capture these rows if any exist

-- C. Circularity notes (c7d8e9f0a1b2): record the expected post-upgrade count.
SELECT count(*) AS will_be_non_null FROM product
WHERE NULLIF(btrim(coalesce(recyclability_observation,'')),'')       IS NOT NULL
   OR NULLIF(btrim(coalesce(recyclability_comment,'')),'')           IS NOT NULL
   OR NULLIF(btrim(coalesce(recyclability_reference,'')),'')         IS NOT NULL
   OR NULLIF(btrim(coalesce(repairability_observation,'')),'')       IS NOT NULL
   OR NULLIF(btrim(coalesce(repairability_comment,'')),'')           IS NOT NULL
   OR NULLIF(btrim(coalesce(repairability_reference,'')),'')         IS NOT NULL
   OR NULLIF(btrim(coalesce(remanufacturability_observation,'')),'') IS NOT NULL
   OR NULLIF(btrim(coalesce(remanufacturability_comment,'')),'')     IS NOT NULL
   OR NULLIF(btrim(coalesce(remanufacturability_reference,'')),'')   IS NOT NULL;

-- D. Data that is dropped outright, with schema-only downgrades. Export anything
--    you still want.
SELECT (SELECT count(*) FROM organization)                                AS orgs_dropped,
       (SELECT count(*) FROM newslettersubscriber)                        AS newsletter_dropped,
       (SELECT count(*) FROM product WHERE dismantling_notes IS NOT NULL) AS notes_dropped,
       (SELECT count(*) FROM "user" WHERE last_login_ip IS NOT NULL)      AS last_ip_dropped;
-- If newsletter_dropped > 0:
-- \copy (SELECT email, is_confirmed, created_at FROM newslettersubscriber) TO '/tmp/newsletter.csv' CSV HEADER

-- E. THE UPLOAD QUOTA LOCKOUT — read the note below. This is now the list of
--    accounts that must be promoted to the `lab` role in step 8b.
SELECT owner_id, count(*) AS media_count FROM (
  SELECT p.owner_id FROM file  f JOIN product p ON f.parent_type='PRODUCT' AND f.parent_id=p.id
  UNION ALL
  SELECT p.owner_id FROM image i JOIN product p ON i.parent_type='PRODUCT' AND i.parent_id=p.id
) m GROUP BY owner_id ORDER BY media_count DESC;
-- media_count counts files AND images across every record the account owns,
-- base products and components alike. It is not a count of products.

-- F. Baseline counts for step 9.
SELECT (SELECT count(*) FROM product WHERE parent_id IS NULL)     AS base_products,
       (SELECT count(*) FROM product WHERE parent_id IS NOT NULL) AS components,
       (SELECT count(*) FROM image)                               AS images,
       (SELECT count(*) FROM file)                                AS files,
       (SELECT count(*) FROM "user")                              AS users,
       (SELECT count(*) FROM oauthaccount)                        AS oauth_links;

-- G. New CHECK constraints (the material-quantity and amount_in_parent
--    tightening). Both MUST return 0 — the migration aborts on any offending
--    row rather than skipping it; fix the data first.
SELECT count(*) FROM materialproductlink WHERE quantity <= 0;
SELECT count(*) FROM product WHERE amount_in_parent IS NOT NULL AND amount_in_parent <= 0;

-- H. Stray sessions. Four of the newer migrations run with lock_timeout = 3s and
--    abort rather than queue, so anything holding a conflicting lock fails the
--    run. Under a full outage this should be empty apart from your own psql.
SELECT pid, usename, state, wait_event_type,
       now() - xact_start AS xact_age, left(query, 60) AS query
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid()
ORDER BY xact_start;
```

### The quota lockout (query E) — expect this to bite

The release adds a per-user upload ledger. `upload_file_count` is backfilled from real rows, and
enforcement is `User.upload_file_count < file_limit`. Since 2026-08-18 the limit is **tiered by the
account's role**, and every account is created and backfilled as `contributor`.

| Role          | Files  | Storage  | Root `.env` overrides                                               |
| ------------- | ------ | -------- | ------------------------------------------------------------------- |
| `contributor` | 1000   | 1024 MB  | `MAX_UPLOAD_FILES_PER_USER`, `MAX_UPLOAD_BYTES_PER_USER_MB`         |
| `lab`         | 20 000 | 20480 MB | `MAX_UPLOAD_FILES_PER_LAB_USER`, `MAX_UPLOAD_BYTES_PER_LAB_USER_MB` |

With ~3,610 images concentrated in the lab account, that account lands far above the contributor
limit of 1000 and is **blocked from all further uploads** the moment the app restarts, returning
`413 Upload quota exceeded`. Nothing is deleted and no existing file is affected; only new
reservations fail.

**The fix is step 8b: promote that account to `lab`. Do not raise the contributor tier**, which
applies to every external contributor. Raise the *lab* tier if 20 000 is too low:

```env
MAX_UPLOAD_FILES_PER_LAB_USER=50000
```

A lab value below its contributor counterpart is refused at settings validation, so the stack will
not start on an inverted pair.

Related: `upload_size_bytes` is added with a default of `0`, so every pre-existing file counts as
zero bytes until backfilled. Step 8 runs `just backfill-upload-sizes` right after the migration to
populate it from the real files on disk/storage. Until that runs, `upload_total_bytes` reads 0 for
every user and byte-based quota is meaningless. Leave `MAX_UPLOAD_BYTES_PER_USER_MB` high enough
that it cannot bite in the gap between migrate and backfill.

### The seven migrations added after this runbook was written

`f1a2b3c4d5e6` (the original target) to `c4f7b1e93a20` (the head) adds seven revisions that §3's
queries were not written against. Audited 2026-08-18:

| Revision       | What it does                         | Aborts on data? | Drops data? |
| -------------- | ------------------------------------ | --------------- | ----------- |
| `bfd99abac57f` | Adds two nullable terms columns      | No              | No          |
| `c3e7b1a90d24` | Drops a redundant index CONCURRENTLY | No              | No          |
| `d4b8e1c60a72` | `pg_trgm` + search/thumbnail indexes | No              | No          |
| `34345aa9c369` | Adds `image.width_px`/`height_px`    | No              | No          |
| `7c1f3b6a52d8` | Validates the dimensions CHECK       | No (see below)  | No          |
| `b7e2d9a4c1f0` | Trigram index on `producttype`       | No              | No          |
| `c4f7b1e93a20` | Adds `user.role` + its CHECK         | No              | No          |

**None of the seven aborts on bad data and none drops data**, so §3 needs no new data query for
them, only query H for lock contention. Three caveats:

`7c1f3b6a52d8` runs `VALIDATE CONSTRAINT`, which aborts on a violating row. It cannot here:
`width_px`/`height_px` are added nullable two revisions earlier and nothing in the chain backfills
them, so every row is NULL and the constraint (`IS NULL OR > 0`) is satisfied. Its 15-minute
statement ceiling is for the table scan, which is nothing at prod's row count.

`d4b8e1c60a72` runs `CREATE EXTENSION IF NOT EXISTS pg_trgm` as `relab_migrator`, which is
`NOSUPERUSER`. That works: `pg_trgm` is a **trusted** extension in the pinned `postgres:18` image,
and step 5's role script grants `CREATE ON DATABASE` to the migrator, which is all a trusted
extension needs.

**Correction to §0b's abort rule.** `c3e7b1a90d24` drops its index inside an `autocommit_block()`,
because `CONCURRENTLY` cannot run in a transaction. If a later migration fails, that one index stays
dropped while `alembic_version` rolls back. The drop is `if_exists=True`, so a retry is clean, and
the index was redundant, but a post-failure schema may differ from the pre-run one by exactly that
index.

**A consequence that outlives the cutover: nobody has accepted the contributor terms.**
`bfd99abac57f` adds `terms_accepted_version`/`terms_accepted_at` without a backfill, because a
stamped value would fabricate evidence of a licence grant nobody made. The app prompts on the next
login after this deploy, and `POST /v1/users/me/accept-terms` records the grant server-side.
Declining changes nothing, so **expect the backlog to clear gradually**: a contributor who has not
logged in since the cutover has granted nothing. Before building a release, check who is covered:

```sql
SELECT count(*) FILTER (WHERE terms_accepted_version IS NOT NULL) AS accepted,
       count(*) FILTER (WHERE terms_accepted_version IS NULL)     AS not_yet
FROM "user";
```

Nothing here blocks the cutover. It blocks a dataset release naming any account still in the
`not_yet` column (`scripts/build_dataset_release.py::check_owner_selection` refuses them).

______________________________________________________________________

## 4. Migrate secrets to the new layout

The release reads secrets as **files** under `secrets/prod/`, via pydantic-settings `secrets_dir`.
`backend/.env.prod` is no longer loaded.

Which path applies depends on what step 0 found.

**If `secrets/prod/` does not exist on the host** (expected), create all 16 from scratch, with the
values from the live `backend/.env.prod`. Generate the scaffolding first, then overwrite the
carried-over ones by hand:

```bash
just deploy-secrets-template prod    # creates all 16 at 0644 with fresh values
```

The directory is `0700` and the files are `0644`: the containers run as uid 1001 and must read the
mounted files, while the directory keeps them private from other users on the host.

Then, for each row below, replace the generated file's contents with the value already in
`backend/.env.prod`. A fresh value is not equivalent:

| `backend/.env.prod` variable    | `secrets/prod/` file            | Why it must be carried over                                                                                |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `FASTAPI_USERS_SECRET`          | `auth_token_secret`             | Signs password-reset and verification links; a new value invalidates every link already in someone's inbox |
| `SUPERUSER_PASSWORD`            | `bootstrap_superuser_password`  | Your documented emergency admin password                                                                   |
| `POSTGRES_PASSWORD`             | `postgres_password`             | Must match the existing cluster or nothing connects                                                        |
| `REDIS_PASSWORD`                | `redis_password`                | Must match the running cache                                                                               |
| `OAUTH_STATE_SECRET`            | `oauth_state_secret`            | Invalidates in-flight OAuth logins if changed                                                              |
| `CACHE_SIGNING_SECRET`          | `cache_signing_secret`          | Invalidates signed cache entries if changed                                                                |
| `GOOGLE_OAUTH_CLIENT_SECRET`    | `google_oauth_client_secret`    | Real credential, cannot be invented                                                                        |
| `GITHUB_OAUTH_CLIENT_SECRET`    | `github_oauth_client_secret`    | Real credential                                                                                            |
| `MICROSOFT_GRAPH_CLIENT_SECRET` | `microsoft_graph_client_secret` | Real credential                                                                                            |
| `EMAIL_PASSWORD`                | `smtp_password`                 | Real credential                                                                                            |

Write them without leaving values in shell history:

```bash
install -m 644 /dev/null secrets/prod/auth_token_secret
printf '%s\n' 'VALUE_FROM_ENV_PROD' > secrets/prod/auth_token_secret   # repeat per row
```

The three `database_*_password` files and `restic_password` are new: keep the generated random
values; the roles you create in step 5 consume the database ones. `data_encryption_key` is also new;
keep the generated value and **record it**, because step 6a encrypts existing data with it and the
data is unreadable without it.

**If `secrets/prod/` already exists** with the old names, the delta is two renames. Copy, do not
regenerate:

```bash
cp secrets/prod/fastapi_users_secret secrets/prod/auth_token_secret
cp secrets/prod/superuser_password   secrets/prod/bootstrap_superuser_password
```

Fill any remaining gaps and verify:

```bash
chmod 700 secrets/prod              # one-time: the directory carries the privacy
chmod 644 secrets/prod/*            # one-time: uid 1001 in the containers must read these
just deploy-secrets-template prod   # creates only what is missing, 0644
just env-inventory                  # the 16 expected names
just deploy-secrets-check
```

`deploy-secrets-template` generates real random values, except for external identity credentials
(`*_oauth_client_secret`, `microsoft_graph_client_secret`), which are created **empty**. Empty is
valid for a provider you are not using: an empty *optional* input passes `env-inventory`/env-policy,
an empty *required* one fails loudly, and the runtime accepts empty for unused providers.
**Fill in by hand** whichever providers you use. `deploy-secrets-check` rejects carried-over legacy
placeholder values: the `replace-me-*` marker and the May-era `placeholder-<env>-<name>` scaffolding
(a dozen of the latter were found on the staging host on 2026-08-12).

Leave the two old files (`fastapi_users_secret`, `superuser_password`) in place until the cutover is
verified, then delete them.

______________________________________________________________________

## 5. Provision the database roles and extensions — run once now, then it is automatic

The release connects as three least-privilege roles (`relab_app`, `relab_migrator`, `relab_backup`)
instead of the cluster superuser, and reads query statistics through `pg_stat_statements`.
`deploy/postgres/initdb/provision.sh` creates all of it, but `/docker-entrypoint-initdb.d` scripts
**only run when the data directory is empty**. Prod's volume is populated, so on its own it never
runs and the API fails to connect.

Since 2026-09-06 that is no longer a runbook-only step: `just prod-up` runs `provision.sh` against
the live database before starting anything else, and `just restore` runs it after replacing the
schema. Run it by hand here only so that the pre-flight in this section can be verified before the
window; the same command is what `prod-up` will keep running.

First establish what your cluster is. Staging, for reference, has a single login role
`cml_test_admin` and no `postgres` role at all:

```bash
docker compose -p relab_prod exec -T postgres \
  psql -U "$PGSUPERUSER" -d relab_db -c "\du"
```

> **If the superuser is not named `postgres`:** `compose.deploy.yaml` defaults `POSTGRES_USER` to
> `postgres`. The healthcheck does not catch the mismatch: `pg_isready` treats a
> `FATAL: role does not exist` response as "server accepting connections", so the container reports
> **healthy** while the provisioning script and every real client fail (observed on staging
> 2026-08-12). Resolve it before the window: set `POSTGRES_SUPERUSER=<role>` in the host's root
> `.env` (or create a `postgres` superuser role in the cluster).

Then run the script against the live database. It is idempotent and already mounted inside the
container, so run it directly rather than transcribing it:

```bash
docker compose -p relab_prod exec -T postgres bash /docker-entrypoint-initdb.d/provision.sh
```

It reads the role names from the container environment and the passwords from the mounted
`secrets/prod/database_*_password` files. Against a populated database it will:

- create only the roles that do not exist yet, leaving any existing role's password untouched;
- grant on the tables and sequences that **already exist**, which `ALTER DEFAULT PRIVILEGES` alone
  does not cover;
- transfer ownership of every table and sequence in `public` (including `alembic_version`) to
  `relab_migrator`. Postgres requires *ownership*, not grants, for the DDL the migrations run; on an
  adopted cluster the superuser owns everything, and step 8's migration fails immediately with
  `permission denied for table alembic_version` without this (found in the staging rehearsal on
  2026-08-12, and again on 2026-09-06 when staging's restore had handed 16 tables back to the
  superuser);
- create `pg_stat_statements` in the `extensions` schema. The server has been loading the library
  (`shared_preload_libraries`) all along and collecting statistics nothing could read; on
  2026-09-06 prod had only `plpgsql` and `pg_trgm` installed. It is **not** a trusted extension, so
  `relab_migrator` cannot create it, which is why it lives here and not in an Alembic migration;
- apply `statement_timeout`, `lock_timeout` and `idle_in_transaction_session_timeout` to
  `relab_app`, and a fixed `search_path` (`public, extensions, pg_catalog`) to all three roles.

No downtime is needed: `ALTER ROLE ... SET` applies to new sessions, so restart the API afterwards
(or wait out the 30-minute connection recycle) for the timeouts to take effect on the pool.

Then discard the statistics collected before the view existed, which are mostly backup and
migration DDL, so the first numbers you read are application traffic:

```bash
docker compose -p relab_prod exec -T postgres \
  psql -U "$PGSUPERUSER" -d relab_db -c 'SELECT pg_stat_statements_reset();'
```

Verify all three roles exist and can log in before continuing.

______________________________________________________________________

## 6. Update the root `.env`

Backend settings that used to live in `backend/.env.prod` are now split: secrets into
`secrets/prod/` and everything else into the root `.env`.

**Required; the stack will not render without these:**

```env
ENVIRONMENT=prod            # the recipes refuse a host whose .env says otherwise
API_PUBLIC_URL=https://api.cml-relab.org
APP_PUBLIC_URL=https://app.cml-relab.org
SITE_PUBLIC_URL=https://cml-relab.org
DOCS_PUBLIC_URL=https://docs.cml-relab.org
FEATURED_PRODUCT_ID=464     # landing hero; empty renders the fixture
CLOUDFLARE_TUNNEL_TOKEN=…   # renamed from TUNNEL_TOKEN, same value
EMAIL_PROVIDER=smtp         # or microsoft_graph
EMAIL_FROM=…
EMAIL_REPLY_TO=…
BOOTSTRAP_SUPERUSER_EMAIL=…
GOOGLE_OAUTH_CLIENT_ID=…    # carry from backend/.env.prod — the app refuses to
GITHUB_OAUTH_CLIENT_ID=…    # boot in prod/staging when either is empty
```

The OAuth client *IDs* are non-secret and live here; the client *secrets* went to `secrets/prod/` in
step 4. With the IDs absent, `prod-migrate`'s `create_superuser` (and the API itself) fail at
settings validation after the migrations have already applied (found in the staging rehearsal).

**Carry across from `backend/.env.prod`,** noting the renames:

| old                                            | new                                                      |
| ---------------------------------------------- | -------------------------------------------------------- |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USERNAME` | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME`              |
| `SUPERUSER_EMAIL` / `SUPERUSER_NAME`           | `BOOTSTRAP_SUPERUSER_EMAIL` / `BOOTSTRAP_SUPERUSER_NAME` |
| `BACKUP_DIR`                                   | `BACKUP_HOST_DIR`                                        |

`LOKI_URL` has no replacement: **delete it.** Container logs no longer go to Loki directly; see the
telemetry note below.

**Upload quotas are now a pair of tiers.** If the host's `.env` carries a raised
`MAX_UPLOAD_FILES_PER_USER` from an earlier attempt at the lockout, reconsider it: that variable is
now the *contributor* tier and applies to every external contributor. The lab account is covered by
promotion (step 8b) and `MAX_UPLOAD_FILES_PER_LAB_USER` instead. A lab tier below its contributor
counterpart fails settings validation and the stack will not start.

Log labels changed with the collection path: Loki's `service,env,host` label set is now the
OpenTelemetry resource attributes `service.name`, `env` and `project`. Existing Grafana queries
filtering on `host=` need updating.

> **Telemetry is one switch and two credentials.** Set
> `OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.cml-relab.org`, `OTLP_AUTH_TOKEN` (a bearer token from the
> monitoring stack operator) and `TELEMETRY_EDGE_KEY` (shared with `infra/cloudflare-zone`). The
> endpoint switch turns on the API's own OpenTelemetry exporter **and** auto-includes
> `compose.telemetry.yml`, a Grafana Alloy agent that forwards every other container's stdout to the
> same endpoint. **Then run `./bootstrap.sh relab prod` on the monitoring host as part of this step**:
> telemetry flowing and telemetry being *watched* are two different things, and only the second
> survives this host going quiet. Run it before step 8 starts the stack — the hub's coverage alert
> fires on telemetry arriving for a pair nobody bootstrapped. `just deploy-secrets-check` fails if the
> endpoint is set without both credentials.
>
> Compose derives `OTEL_EXPORTER_OTLP_HEADERS` from the token, so you do not write the SDK's
> percent-encoded header format by hand.
>
> `LOKI_PUSH_URL` and the Loki Docker-driver overlay are **gone**. Delete both `LOKI_URL` and
> `LOKI_PUSH_URL` from the host's `.env`; nothing reads them. The monitoring stack
> (github.com/CMLPlatform/monitoring) publishes only `grafana.` and `otel.` and exposes no Loki push
> hostname, because Loki has no authentication of its own.
>
> Alloy also ships host metrics (CPU, memory, disk, network and `hwmon` temperatures and fan speeds)
> over the same endpoint, so this host does not need a separate host-monitoring agent. It does not
> replace the per-job dead-man's switch: see "Alerting is two mechanisms" under Known post-launch
> gaps, and [DEPLOY-PROD.md](DEPLOY-PROD.md) Part 1.5 for the standing configuration.
>
> Since monitoring `v0.3.0` the gateway counts what arrives, per project and environment
> (`telemetry_datapoints_total`, `telemetry_logs_total`, `telemetry_spans_total`), and the silence
> and coverage alerts read those counters. Verify a host with them rather than with a bare
> `{project="relab"}` selector: the counters see every signal, including a host that ships logs and
> no metrics, and they cost the same whatever the fleet grows to.
>
> `TELEMETRY_EDGE_KEY` must equal `TF_VAR_telemetry_edge_key` in `infra/cloudflare-zone`; rotate
> the pair together. The bearer token rotates independently with the collector.
>
> A wrong token shows up as `Failed to export logs batch code: 401, reason: Unauthorized` in the
> API's own container log, the one telemetry failure that is loud.

**Delete these stale names:** `APP_ENV`, `COMPOSE_PROJECT_NAME`, `BUILD_MODE`, `CSP_API_ORIGIN`,
`WEB_CONCURRENCY`, `BACKEND_API_URL`, `FRONTEND_APP_URL`, `DOCS_URL`, `OAUTH_ALLOWED_REDIRECT_URIS`,
and any `RELAB_*_IMAGE` overrides (the release always builds locally and silently ignores them).

Check it:

```bash
just env-policy-check
just compose-config
```

### Two renames that have no code migrating them

Both are one-time and manual.

**1. The telemetry edge header: deploy the hosts, then apply OpenTofu. In that order.**

This release renames the header the edge key travels in. `infra/cloudflare-zone` is zone-global, so
a single `tofu apply` lands on prod and staging together, and a host still sending the old name has
its exports dropped with no error anywhere. So:

1. `just prod-up YES` and `just staging-up YES` on both hosts, on this release.
1. Confirm both are sending: on the monitoring host,
   `count(telemetry_datapoints_total{project="relab"})` is non-zero for `env="prod"` and
   `env="staging"`.
1. Only then `just cloudflare-zone-apply YES`.

Rolling back the deploy after step 3 reintroduces the old header and silently loses telemetry; roll
the zone back with it.

**2. The ping variables: rename them on each host before the next job fires.**

`run_scheduled.sh` is vendored and carries no project prefix, so it reads `PING_*` where the units'
env file still says `RELAB_PING_*`. An unset variable disables pinging *silently*. On each host:

```bash
sudo sed -i 's/^RELAB_PING_/PING_/' /etc/relab/relab.env
just timers-install prod        # re-render the units; warns if any URL is still unset
just watchdog prod              # check 3b confirms PING_WATCHDOG resolves
```

`just timers-install` warns about missing *and* empty `PING_*` names, so a host skipped here reports
itself the next time it is touched, and healthchecks.io fires its own "no ping received" alarm
within the job's period regardless.

______________________________________________________________________

## 7. Stop the old stack — from the old checkout

Five services were renamed (`docs-site`→`docs`, `app-site`→`app`, `web-site`→`www`, and
`uploads-backup`+`postgres-backup`→`backup`). The new compose files do not know the old names, so
stop the stack from the old checkout.

**Stop first, then switch:**

```bash
just prod-down YES backups          # still on the old revision
docker ps -a | grep relab_prod      # must be empty of running containers
```

Only then:

```bash
git checkout <release-branch> && git pull --ff-only
```

If you switched too early, `just prod-down YES` passes `--remove-orphans` and clears the renamed
containers; verify with `docker ps -a | grep relab_prod`.

______________________________________________________________________

## 8. Build, start, migrate

Images are built locally and pinned to `:prod-local` with no registry pull. A stale image silently
runs the *old* code, so the rebuild is mandatory:

```bash
just prod-build
```

Confirm no seeding is enabled (`SEED_DUMMY_DATA`, `SEED_CPV_CATEGORIES`, `SEED_CPV_PRODUCT_TYPES`,
`SEED_HS_CATEGORIES` unset or false); the taxonomy seeds are not gated on an empty database.

```bash
just prod-up YES
just prod-migrate YES
```

`prod-up` starts the database, cache, and (unless disabled in 1a) ClamAV; expect the API to stay
unhealthy for a few minutes on first boot while virus signatures download. `prod-migrate` runs every
pending migration in one transaction, then always runs `create_superuser` (which only creates when
absent; it will not reset your existing superuser's password).

If the migration aborts, prod is untouched at `6f2b9e4a1c3d`. Fix the data (almost certainly a
query-A email, or a query-G quantity/amount_in_parent row), and re-run.

This two-command order means the API serves against the *old* schema between `prod-up` and
`prod-migrate`. That is acceptable here, in a full outage behind a closed tunnel, but not for a
routine release. For those, start the stack with the `migrations` profile and the API waits for the
migrator to exit 0 before it starts:

```bash
just prod-up YES migrations   # migrate, then serve, in one step
```

The dependency is declared `required: false`, so a profile-less `prod-up` behaves as it always has.
If the migration fails, the migrator exits non-zero and the API never starts.

Once the migration succeeds, backfill the byte-quota ledger (see the quota lockout note above; this
wraps the same script as `just backfill-upload-sizes`, which only exists locally, not in the
container):

```bash
ENVIRONMENT=prod PROJECT=relab docker compose -p relab_prod --env-file .env \
  -f compose.yaml -f compose.deploy.yaml \
  --profile migrations run --rm --entrypoint python \
  migrator -m scripts.maintenance.backfill_upload_sizes
```

______________________________________________________________________

## 8a. Encrypt the previously plaintext columns

Only if step 0 found prod at `main` (or any revision without `DATA_ENCRYPTION_KEY`). `main` stores
OAuth access/refresh tokens and YouTube broadcast keys as plaintext; the release expects them
AES-256-GCM encrypted under `secrets/prod/data_encryption_key`. Until this runs, OAuth refresh and
any YouTube flow fail to read their stored values.

Dry run first:

```bash
ENVIRONMENT=prod PROJECT=relab docker compose -p relab_prod --env-file .env \
  -f compose.yaml -f compose.deploy.yaml \
  --profile migrations run --rm --entrypoint python \
  migrator -m scripts.maintenance.migrate_encryption_v1_to_v2 --dry-run
```

If it reports no errors, run it for real by dropping `--dry-run`. It is a one-time pass tied to the
key created in step 4; losing that key makes the encrypted columns unrecoverable.

______________________________________________________________________

## 8b. Promote the lab accounts — before anyone tries to upload

The role model (added 2026-08-18) backfills **every** existing account to `contributor`. Until this
step runs, the account holding the bulk of prod's media is over its tier and cannot upload (see the
quota lockout note in step 3).

Find who is affected. This reads the ledger *after* the backfill, so it is the authoritative list
rather than query E's estimate:

```bash
ENVIRONMENT=prod PROJECT=relab docker compose -p relab_prod --env-file .env \
  -f compose.yaml -f compose.deploy.yaml \
  --profile migrations run --rm --entrypoint python \
  migrator -m scripts.maintenance.list_accounts_over_contributor_quota
```

It logs one line per account that is over the quota its current role grants, **by id only**; no
email or username reaches those logs. An empty report means nothing is locked out and this step is a
no-op.

Promote through the admin API, which audit-logs the change. As a superuser with a bearer token:

```bash
curl -fsS -X PUT https://api.cml-relab.org/v1/admin/users/<user_id>/role \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"role": "lab"}'
```

If the tunnel is still closed at this point in the window, the same change by SQL is acceptable. It
skips the audit event, so note in the launch record that it was done this way and why:

```sql
UPDATE "user" SET role = 'lab' WHERE id = '<user_id>';
```

Re-run the report; it must come back empty before you proceed. Then confirm the tiers:

```sql
SELECT role, count(*), max(upload_file_count) AS max_files, max(upload_total_bytes) AS max_bytes
FROM "user" GROUP BY role;
```

`role` accepts only `contributor` and `lab`; the `ck_user_role_valid` check constraint rejects
anything else, so a typo in the SQL form fails loudly.

______________________________________________________________________

## 9. Verify before declaring success

```sql
SELECT version_num FROM alembic_version;      -- must equal `alembic heads` for
                                              -- the release checkout, NOT the
                                              -- stale f1a2b3c4d5e6 above

-- Compare against the step 3 baseline (query F).
SELECT (SELECT count(*) FROM product WHERE parent_id IS NULL)     AS base_products,
       (SELECT count(*) FROM product WHERE parent_id IS NOT NULL) AS components,
       (SELECT count(*) FROM image)                               AS images,
       (SELECT count(*) FROM file)                                AS files,
       (SELECT count(*) FROM "user")                              AS users,
       (SELECT count(*) FROM oauthaccount)                        AS oauth_links;

-- Circularity notes: 'populated' must equal query C, and no empty objects.
SELECT count(*) FILTER (WHERE circularity_properties IS NOT NULL)   AS populated,
       count(*) FILTER (WHERE circularity_properties = '{}'::jsonb) AS empty_objects
FROM product;
SELECT id, jsonb_pretty(circularity_properties) FROM product
WHERE circularity_properties IS NOT NULL LIMIT 5;   -- comments/refs should be folded in

-- Email canonicalization complete and unique: all three equal.
SELECT count(*), count(email_canonical), count(DISTINCT email_canonical) FROM "user";

-- No orphaned media.
SELECT count(*) FROM image i WHERE i.parent_type='PRODUCT'
  AND NOT EXISTS (SELECT 1 FROM product p WHERE p.id = i.parent_id);   -- 0

-- Quota ledger: file counts real, bytes real once step 8's backfill has run.
SELECT sum(upload_file_count), sum(upload_total_bytes), max(upload_file_count) FROM "user";

-- Roles: every account is `contributor` unless step 8b promoted it, and nobody
-- is left above the tier they now hold (this must return 0 rows).
SELECT role, count(*) FROM "user" GROUP BY role;
SELECT id, role, upload_file_count FROM "user"
WHERE (role = 'contributor' AND upload_file_count > 1000)
   OR (role = 'lab'         AND upload_file_count > 20000);
-- Compare the thresholds against the host's own MAX_UPLOAD_FILES_PER_* values
-- if they were overridden in the root .env.

ANALYZE product; ANALYZE "user"; ANALYZE image; ANALYZE file;
```

The `ANALYZE` matters: the release adds trigram, composite and partial indexes that the planner will
not choose until it has statistics for them. Confirm they are used, on real data (on the empty dev
database every plan is a sequential scan):

```sql
-- Trigram search must reach the index, not fall back to a scan. The indexes are
-- built on relab_unaccent(column) since a9c2e4f60b18, so a query on the bare
-- column (or lower(name)) is the Seq Scan to look for.
EXPLAIN SELECT id FROM product WHERE relab_unaccent(name) % relab_unaccent('drill');

-- The product thumbnail subquery must read one index entry, with no Sort node
-- above the image scan.
EXPLAIN SELECT p.id, (SELECT i.file FROM image i
                      WHERE i.parent_type='PRODUCT' AND i.parent_id=p.id
                      ORDER BY i.created_at LIMIT 1)
FROM product p ORDER BY p.id LIMIT 50;
```

Then re-measure the API against the prod-shaped dataset; the list-endpoint work only shows up at
real row counts. Needs `k6` on the host; the run is read-only, two virtual users against public GET
paths:

```bash
cd backend
BASE_URL=https://api.cml-relab.org just perf-baseline
```

It writes `backend/reports/performance/latest-k6-summary.json`. Record the `product_list_read` p95
next to the counts from the step 3 baseline; it is the reference point for the next release that
touches a read path.

Then exercise the real paths:

```bash
curl -fsS https://api.cml-relab.org/live
curl -fsS https://api.cml-relab.org/health
```

Every public origin, not just the API; a healthy API behind a broken tunnel route still reads as a
failed launch:

```bash
curl -fsS -o /dev/null -w '%{http_code} %{url_effective}\n' \
  https://api.cml-relab.org/live \
  https://api.cml-relab.org/health \
  https://app.cml-relab.org/ \
  https://cml-relab.org/ \
  https://docs.cml-relab.org/
```

No container may be restarting or unhealthy. The API reports `unhealthy` whenever Postgres or Redis
is unreachable:

```bash
docker compose -p relab_prod ps --format '{{.Service}}\t{{.Status}}'
```

Two host-level checks that nothing else covers:

```bash
# Log rotation. Docker's default is UNBOUNDED json-file logging; the per-service caps
# in compose.deploy.yaml are the rotation control the repo enforces, with the host
# daemon.json log-opts (DEPLOY-PROD.md Part 1.0) as an optional fallback for
# containers outside the stack. Every service must report max-size — a service
# without it fills the disk on its first crash loop.
docker compose -p relab_prod ps -q | xargs docker inspect \
  --format '{{.Name}} {{json .HostConfig.LogConfig.Config}}' \
  # every line must show "max-size":"10m"; an empty {} is a finding, not noise

# Telemetry actually leaving the host. Alloy logs a bad token or a challenged edge
# (TELEMETRY_EDGE_KEY differing from the zone's). Zero matches is the pass condition.
docker logs --since 10m "$(docker compose -p relab_prod ps -q alloy)" 2>&1 \
  | grep -Ei 'error|failed|401|403' || echo "alloy: no export errors"
```

The check above proves telemetry left this host. From the monitoring host, confirm it arrived,
attributed, and is being watched — all three within about two minutes:

```promql
count(telemetry_datapoints_total{project="relab",env="prod"})   # non-zero: metrics arriving
count(telemetry_logs_total{project="relab",env="prod"})         # non-zero: container stdout
count(telemetry_datapoints_total{project="unknown"})            # must be empty
count(container_start_time_seconds{project="relab",env="prod",name!=""})  # one per container
```

An `unknown` project means a sender reached the gateway without `project`/`env` resource attributes;
find it before it becomes a permanent `ProjectsUncovered` alert. Grafana → Alerting must also list
`ProjectTelemetrySilent` for `relab/prod`, which exists only if `./bootstrap.sh relab prod` was run
in step 6.

By hand: log in with Google **and** GitHub (the GitHub client changed in this release), open a
product with images, and **upload one image as the lab account that owns the bulk of the media**;
any other account has a near-empty ledger and would pass the quota check without proving anything.
If that account was promoted in step 8b, also confirm the "Research files" block is visible on one
of its records: it renders only for `lab`, so its absence means the promotion did not take.

### Go / no-go

There is no automated gate and nothing pages anyone; a human makes this decision, once. **Go**
requires all of:

- `alembic_version` equals the release checkout's `alembic heads`, and every count above matches the
  step 3 baseline,
- all five origins return 2xx and no container is restarting or unhealthy,
- both OAuth providers, a product page, and one image upload **by the lab account** work by hand,
- the over-quota report from step 8b comes back empty,
- the monitoring host counts telemetry for `relab/prod`, and a `ProjectTelemetrySilent` rule exists
  for that pair.

Anything unresolved is **no-go**: roll back with §12 and retry in a later window. Do not launch
"mostly working" and fix forward; the pre-upgrade dump gets less useful the longer prod accepts
writes on the new schema.

______________________________________________________________________

## 10. Set up backups

The full procedure (repository, timer, offsite credential, monitoring crons) is
**[DEPLOY-PROD.md](DEPLOY-PROD.md) Part 1**. It is standing host setup and stays after this runbook
is deleted. Do it now, then come back.

Specific to this cutover:

- **This is first-time setup.** `main` has no restic tooling, so there are no pre-existing
  snapshots. The old plain-copy backup directory was preserved in §2; the new tooling cannot read
  it, so keep it until §0b's abort conditions are all satisfied.

- **Retire the old backup container if the host ever ran one.** Compose does not remove a container
  whose profile went away, so it would keep running beside the new timer:

  ```bash
  ENVIRONMENT=prod PROJECT=relab docker compose -p relab_prod --env-file .env \
    -f compose.yaml -f compose.deploy.yaml --profile backups rm -sf backup
  ```

- **Reclaim `/var` once the old directory is dead.** As of 2026-08-27 the host carried 25.5 GB under
  `/var/backups/relab` (9 daily, 4 weekly and 6 monthly `user_uploads` tarballs at ~1.5 GB each)
  against 12.1 GB free on an 86 GB `/var`. The daily tier grows 1.5 GB a day with no sign of
  pruning, and a full `/var` takes Docker, Loki, Tempo and Prometheus down together on that host.

  These are full tarballs, not incrementals; restic dedup should collapse the same history to a
  fraction. Delete the old directory only when all of these hold, in order:

  1. `just restore-check prod` passes against a restic snapshot;
  1. every §0b abort condition is satisfied, so there is no path back that needs the old copies;
  1. at least one restic snapshot has been verified **offsite**.

  Until all three hold, keep them and free space elsewhere.

Do not declare this step done until `just restore-check prod` passes; §0b depends on it. **That
check only began asserting anything on 2026-09-06**: it piped its "restored N tables, M rows"
test into `psql` through a `docker exec` with no stdin, so it read EOF and exited 0 without
running. Verified on staging that day; prod has never had it run for real, so treat this as a
first run and read the `NOTICE: restored N tables, M rows` line, not just the exit code.

______________________________________________________________________

## 11. Cloudflare — prod is still unadopted; do nothing for prod

**Do not run `just cloudflare-apply prod`** during or after this cutover.

Live traffic depends only on `CLOUDFLARE_TUNNEL_TOKEN` being set in the root `.env` for the
`cloudflared` service. It does not depend on this Terraform, and importing does not change or
reissue that token.

`just cloudflare-check` is safe at any time: it verifies a throwaway copy of each root, so it needs
no credentials, no network, and no state access.

### What is adopted, as of 2026-08-19

| Root                     | Workspace | Status                                                                                                   |
| ------------------------ | --------- | -------------------------------------------------------------------------------------------------------- |
| `infra/cloudflare-zone/` | `default` | **Adopted and applied.** TLS settings, cache and firewall rulesets imported; rate-limit ruleset created. |
| `infra/cloudflare/`      | `staging` | **Adopted and applied.** Its tunnel now answers to `relab-staging`, renamed from `cml-relab-test`.       |
| `infra/cloudflare/`      | `prod`    | **Nothing.** No workspace, no state.                                                                     |

Confirm before trusting this table:

```bash
just cloudflare-plan staging     # a plan, not an apply
just cloudflare-zone-plan
```

### Three things the staging adoption taught, that prod will meet too

- **The live tunnels carry their original names.** Staging's was `cml-relab-test` while the module
  computes `relab-${environment}`, so applying **renames** it. The rename is safe (the tunnel id is
  unchanged and `cloudflared` authenticates by id and secret, not name) but it is a real change.
  Prod's tunnel is `cml-relab-prod` (`9f5762a9-…`), so adopting prod will rename it to
  `relab-prod`. The account also holds tunnels this repo does not manage (`cml-monitoring`, the
  `ssh-…` and `cml-rpi5-…` ones); leave them alone.

- **Zone-scoped resources are shared.** prod and staging share `cml-relab.org`, so the TLS settings
  and the three entrypoint rulesets affect both environments at once. They live in
  `infra/cloudflare-zone/` with a single owner, which is why prod's own import list is six
  per-environment resources. The zone was found at TLS 1.0 and is now at 1.2, for every hostname
  including prod's.

- **This zone's Cloudflare plan is restrictive, and it fails at apply time.** The `http_ratelimit`
  phase allows one rule, a 10s counting period and a 10s mitigation timeout, and neither the
  `matches` operator nor `http.host` may be used in it. Each refusal landed *partway through* an
  apply, after earlier resources had already changed. They are asserted in
  `infra/cloudflare-zone/tests/`, so `just cloudflare-check` catches a regression.

### Adopting prod, as separate work outside any window

No `prod` workspace exists, so a plan today would show every resource as a *create*: duplicate DNS
records, a **second** tunnel whose id does not match the live `CLOUDFLARE_TUNNEL_TOKEN`, and a
replacement for the rulesets that protect prod right now.

Generate the import blocks rather than writing them by hand:

```bash
cd infra/cloudflare
./generate-imports.sh edge prod > imports.tf
cat imports.tf                       # review before running anything
just cloudflare-plan prod            # must show 0 to add, 0 to destroy
```

If it reports no tunnel by the expected names, it lists every tunnel in the account with its id and
connection count; re-run with `RELAB_TUNNEL_NAME='<name>'` once you know which one serves prod.

Delete `imports.tf` once the apply succeeds: import blocks re-run on every plan until removed, and
they make `tofu test` unusable while present.

`infra/cloudflare/README.md` carries the token scopes, where state lives, the state-encryption
rules, and the full import workflow.

______________________________________________________________________

## 12. Rollback

If verification fails and the release cannot be trusted:

1. `just prod-down YES backups` from the release checkout.

1. `git checkout main`.

1. Restore the database from `~/relab-cutover/prod-pre-mvp.dump`:

   ```bash
   docker compose -p relab_prod exec -T postgres \
     pg_restore --clean --if-exists --no-owner -U "$PGSUPERUSER" -d relab_db \
     < ~/relab-cutover/prod-pre-mvp.dump
   ```

1. Restore uploads from `user_uploads-pre-mvp.tar.gz` if anything wrote to them.

1. `just prod-up YES` on `main` (the backup service is timer-driven, not part of `up`).

For later releases, `just prod-rollback YES <sha> [<revision>]` does this from the images
`prod-build` tags with the commit sha ([DEPLOY-PROD.md](DEPLOY-PROD.md) Part 3). It cannot help
here: `main` was never built by that recipe.

The schema has no scripted down-migration path for the dropped data: the `downgrade()` functions
restore column *shape* but not content. The dump from step 2 is the real recovery mechanism, which
is why step 0 forbids deleting it early.

## Known post-launch gaps

Accepted risks, not blockers. Owner: the deploy operator, who also makes the go/no-go call in §9.

- **Schema rollback is shape-only.** `just prod-rollback` can `alembic downgrade`, but refuses when
  a migration in the range dropped or rewrote data, because a downgrade re-adds such objects empty.
  For this release the §2 dump is the only data rollback; §12 is the only rehearsed path.

- **Rate-limit buckets reset once at this deploy.** The rate-limiter's HMAC signing key moved to
  `cache_signing_secret`, so every existing bucket key changes and in-flight windows restart from
  zero. Harmless (limits are short-lived), but do not read a post-deploy lull in 429s as a real
  change in traffic.

- **Alerting is two mechanisms.** Container logs, host metrics and application traces go to the
  central Grafana stack. A per-job dead-man's switch pushes from this host to healthchecks.io, so a
  dead host, a dead collector or a broken tunnel still produces an alarm. `just watchdog prod` is
  the local check whose exit code that ping reports. Setup for both is standing configuration; see
  [DEPLOY-PROD.md](DEPLOY-PROD.md) Parts 1.2, 1.4 and 1.5.

- **This cutover is start-then-migrate.** The §8 commands bring the API up against the old schema
  before `prod-migrate` runs. Harmless here because you are taking a full outage. For routine
  releases, pass the `migrations` profile to `prod-up` instead and the API waits for the migrator to
  exit 0 (see §8). That closes the window but is still not a zero-downtime deploy, since the API is
  down for the length of the migration.
