# Production cutover: `main` → the MVP release

One-time runbook for upgrading the production host from the `main` revision to
the current release. Written 2026-08-03.

Supersedes `secrets/prod/PROD_MIGRATION_PLAYBOOK.md`. That playbook described
the role-hardening, encryption, and restic work as if it were being applied in
May — but none of it exists on `main`, so **prod never received it**. Those
steps are folded into this document instead (5, 8a, and 10).

This file is committed deliberately: it contains no secrets, and the previous
playbook lived under `secrets/`, which is gitignored and therefore never reached
the deploy host.

Prod's Alembic revision is `6f2b9e4a1c3d` and the release is `f1a2b3c4d5e6`
(20 migrations).

Prod's *code* is not literally at `main` — it sits on a pre-rewrite lineage of
the working branch from April (step 0). For deployment purposes the two are
equivalent, and that was checked rather than assumed: prod's tip and `main`
declare the **same** Compose services (`api`, `app-site`, `docs-site`,
`web-site`, `migrator`, `postgres`, `redis`, `cloudflared`, `postgres-backup`,
`uploads-backup`), the **same** volumes (`database_data`, `user_uploads`,
`cache_data`), the same `relab_prod` project name, the same `backend/.env.prod`
config mechanism, and the same 20 migrations. Everything below that is phrased
as "on `main`" therefore applies to the host as it actually is.

## What makes this cutover different

This is not a routine deploy. The deployment layout itself changed:

- Backend configuration moves out of a hand-maintained `backend/.env.prod` into
  16 files under `secrets/prod/`. **`backend/.env.prod` is no longer read at
  all**, and `main` had no secret-file mechanism whatsoever, so these files
  likely do not exist on prod yet and must be created from the values currently
  in `backend/.env.prod`.
- Three least-privilege database roles are expected to exist. `main` has no
  role-hardening script at all, and the scripts that create them only run on an
  empty Postgres volume — **so they must be created by hand on prod.**
- OAuth tokens and YouTube broadcast keys are stored **in plaintext** on `main`
  (it has no `data_encryption_key`). They need a one-time encryption pass.
- Five services were renamed, so the old stack must be stopped from the *old*
  checkout or it leaves orphaned containers running.
- Backups become an encrypted restic repository. `main` has no restic tooling,
  so this is first-time setup, not a re-enable.
- ClamAV is new, needs 3–4 GiB, and is now behind the `scanning` profile.

Read sections 0 and 1 fully before touching anything. Steps 2–6 are preparation
and can be done ahead of the window; the outage starts at step 7.

______________________________________________________________________

## 0. Establish what prod actually is — do this first

This section was run on 2026-08-03 and its findings are recorded below. Re-run
it on the day of the cutover rather than trusting them — the host can move.

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

Prod is **not** at `main`. It sits on a pre-rewrite lineage of the working
branch, tip `2abd707e` dated **2026-04-24** — roughly three months of drift, and
older than the `frontend-app/` → `app/` rename.

The working branch history was rewritten at some point, so prod's commits will
never appear in `origin`: the same release commit exists twice under different
hashes (`5e13df20` on prod vs `39c58600` on `main`). That makes
`origin/main..HEAD` misleading — it lists ~70 commits that are mostly a rewrite
artifact, not genuine local work. Comparing by content instead:

- The six commits after prod last merged `main` are all 2026-04-24, and their
  content is already in the release. The one functional change among them, the
  `numColumns` paging fix (`83b2dda0`), survives verbatim in
  `app/src/features/products/screenData.ts`. The rest (CI workflow
  consolidation, biome schema paths, an Expo Dockerfile env fix, linting) are
  superseded by later work.
- **Nothing needs porting off the prod host.** Verify this again before the
  window rather than trusting this paragraph, but that was the finding.

The old lineage is preserved locally as the branch `backup/pre-rewrite-working`,
which is **not on origin**. Push it before the cutover, so the only copies are
not one laptop and one production host:

```bash
git push origin backup/pre-rewrite-working
```

Because the histories diverged, do not try to `git pull` or merge on prod — it
will conflict across the directory rename. Tag the current state, then check the
release out cleanly:

```bash
git tag prod-pre-mvp-$(date +%Y%m%d) && git push origin --tags   # if origin is reachable
git checkout <release-branch> && git pull --ff-only
```

### The reassuring part: the schema plan is unaffected

Prod's Alembic revision is `6f2b9e4a1c3d`, and the migration surface at prod's
April tip is **identical to `main`** — 20 files, no extras. So despite the code
drift, the database is exactly where this runbook assumes, and the 20-migration
path to `f1a2b3c4d5e6` applies unchanged. That path was verified by replaying it
against a seeded scratch database at `6f2b9e4a1c3d`.

The four answers that drive the rest of this document:

| Question                                 | Answer as of 2026-08-03                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Alembic revision                         | `6f2b9e4a1c3d` — matches `main`, so the 20-migration plan applies unchanged     |
| `backend/.env.prod` present?             | Yes — it is the **source** for the secret files created in step 4               |
| `secrets/prod/` present?                 | No — step 4 creates all 16 from scratch                                         |
| Superuser name, `relab_*` roles present? | Custom name from `backend/.env.prod`; no `relab_*` roles, so step 5 is required |

Re-confirm these on the day rather than trusting the table: it records one
observation, and anything could change in between.

`$PGSUPERUSER` throughout this document is whatever that `\du` reports — on
`main` it came from `backend/.env.prod`, so it is **not** necessarily `postgres`.

## 0b. Abort rule

Do not remove the old volume, the old backup directory, or `backend/.env.prod`
until all of the following hold:

- the post-upgrade verification in step 9 passes,
- an upload, an OAuth login, and a product page have been exercised by hand,
- `just backup-restore-smoke prod` succeeds.

The migration runs as a **single transaction** (`backend/alembic/env.py` never
sets `transaction_per_migration`), so any failure during step 8 rolls the schema
back to `6f2b9e4a1c3d` untouched — no partial state, no `alembic stamp` repair.
The irreversible risks are the *data* losses flagged in step 3, which the
pre-upgrade dump is the only recovery path for.

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

Volumes are **not** renamed in this release — `relab_prod_database_data`,
`relab_prod_user_uploads`, and `relab_prod_cache_data` carry over untouched, and
the project name is still `relab_prod`. No volume migration is needed.

### 1a. Decide whether to run ClamAV

`clamav` sits behind the `scanning` Compose profile. It needs 3–4 GiB of RAM,
and its first start downloads virus signatures into a fresh `clamav_db` volume,
which can take several minutes during which the API stays unhealthy.

```bash
free -g
```

**With enough RAM** — run it, and pass the profile on every up/down:

```bash
just prod-up YES backups scanning
```

Passing any profile replaces the `backups` default, so list `backups` explicitly
whenever you pass `scanning`.

**Without** — omit the profile *and* disable scanning in the root `.env`, or
uploads fail closed:

```env
MALWARE_SCAN_ENABLED=false
```

`prod-up` enforces this pairing: it refuses to start when `MALWARE_SCAN_ENABLED`
is anything but `false` while the `scanning` profile is off. Whichever way you
decide here, the rest of this runbook's `prod-up` commands assume it — keep the
`scanning` profile on every one of them, or drop it from every one.

Running without scanning means uploaded files are not checked for malware on a
platform that accepts uploads from external contributors. Treat it as an
explicit, temporary accepted risk, not a default.

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

`$PGSUPERUSER` is whatever your cluster was initialized with — see step 5, this
is very likely **not** `postgres`.

Also preserve the old backup directory: the release replaces the plain-copy
backup services with an encrypted **restic** repository, and the old dumps are
not readable by the new tooling.

```bash
cp -a "${BACKUP_DIR:-./backups}" ~/relab-cutover/old-backups
```

______________________________________________________________________

## 3. Pre-flight data checks (read-only, run against live prod)

Run these *before* the window. Each one exists because a migration either aborts
or destroys data. Record every number — step 9 compares against them.

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

-- E. THE UPLOAD QUOTA LOCKOUT — read the note below.
SELECT owner_id, count(*) AS media_count FROM (
  SELECT p.owner_id FROM file  f JOIN product p ON f.parent_type='PRODUCT' AND f.parent_id=p.id
  UNION ALL
  SELECT p.owner_id FROM image i JOIN product p ON i.parent_type='PRODUCT' AND i.parent_id=p.id
) m GROUP BY owner_id ORDER BY media_count DESC;

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
```

### The quota lockout (query E) — expect this to bite

The release adds a per-user upload ledger. `upload_file_count` is backfilled
**accurately** from real rows, and `max_upload_files_per_user` defaults to
**1000** with no override anywhere in `deploy/`. Enforcement is
`User.upload_file_count < file_limit`.

With ~3,610 images concentrated in the lab account, that account very likely
lands above 1000 and is **permanently blocked from all further uploads** the
moment the app restarts, returning `413 Upload quota exceeded`.

The default is now **5000**, and it is overridable from the root `.env`. If any
row in query E is at or near that, raise it before bringing the app up:

```env
MAX_UPLOAD_FILES_PER_USER=20000
```

Related: `upload_size_bytes` is added with a default of `0`, so every
pre-existing file counts as zero bytes until backfilled. Step 8 now runs
`just backfill-upload-sizes` right after the migration to populate it from the
real files on disk/storage — until that runs, `upload_total_bytes` reads 0 for
every user and byte-based quota is meaningless. Leave
`MAX_UPLOAD_BYTES_PER_USER_MB` high enough that it cannot bite in the gap
between migrate and backfill.

______________________________________________________________________

## 4. Migrate secrets to the new layout

The release reads secrets as **files** under `secrets/prod/`, via
pydantic-settings `secrets_dir`. `backend/.env.prod` is no longer loaded.

Which path applies depends on what step 0 found.

**If `secrets/prod/` does not exist on the host** (expected — `main` had no
secret-file mechanism at all), you are creating all 16 from scratch, and the
values must come out of the live `backend/.env.prod`. Generate the scaffolding
first, then overwrite the carried-over ones by hand:

```bash
just deploy-secrets-template prod    # creates all 16 at 0600 with fresh values
```

Then, for each row below, replace the generated file's contents with the value
already in `backend/.env.prod`. **Carrying these across matters** — a fresh
value is not equivalent:

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
install -m 600 /dev/null secrets/prod/auth_token_secret
printf '%s\n' 'VALUE_FROM_ENV_PROD' > secrets/prod/auth_token_secret   # repeat per row
```

The three `database_*_password` files and `restic_password` are new — the
generated random values are correct, and the database ones are consumed by the
roles you create in step 5. `data_encryption_key` is also new; keep the
generated value and **record it**, because step 6a encrypts existing data with
it and the data is unreadable without it.

**If `secrets/prod/` already exists** with the old names, the delta is just two
renames — copy, do not regenerate:

```bash
cp secrets/prod/fastapi_users_secret secrets/prod/auth_token_secret
cp secrets/prod/superuser_password   secrets/prod/bootstrap_superuser_password
chmod 600 secrets/prod/auth_token_secret secrets/prod/bootstrap_superuser_password
```

Fill any remaining gaps and verify:

```bash
just deploy-secrets-template prod   # creates only what is missing, 0600
just env-inventory                  # the 16 expected names
just deploy-secrets-check
```

`deploy-secrets-template` now generates real random values rather than
`replace-me-*` placeholders, except for external identity credentials
(`*_oauth_client_secret`, `microsoft_graph_client_secret`) which it cannot
invent. **Fill those in by hand** — production now *refuses to start* on a
placeholder rather than warning.

Leave the two old files (`fastapi_users_secret`, `superuser_password`) in place
until the cutover is verified, then delete them.

______________________________________________________________________

## 5. Create the database roles by hand — do not skip

The release connects as three least-privilege roles (`relab_app`,
`relab_migrator`, `relab_backup`) instead of the cluster superuser.
`deploy/postgres/initdb/10-relab-roles.sh` creates them, but
`/docker-entrypoint-initdb.d` scripts **only run when the data directory is
empty**. Prod's volume is populated, so they will never run and the API will
fail to connect.

First establish what your cluster actually is — staging, for reference, has a
single login role `cml_test_admin` and no `postgres` role at all:

```bash
docker compose -p relab_prod exec -T postgres \
  psql -U "$PGSUPERUSER" -d relab_db -c "\du"
```

> **If the superuser is not named `postgres`:** `compose.deploy.yaml` defaults
> `POSTGRES_USER` to `postgres`, and the healthcheck runs
> `pg_isready -U "$POSTGRES_USER"`. A cluster whose superuser has a different
> name will fail its healthcheck and never become ready. Resolve this before the
> window — set `POSTGRES_SUPERUSER=<role>` in the host's root `.env` (or create a
> `postgres` superuser role in the cluster). This is a genuine mismatch, not a
> formality.

Then run the role script against the live database. It is idempotent and
already mounted inside the container, so run it directly rather than
transcribing it — hand-copying is how the per-role timeouts at the bottom get
missed:

```bash
docker compose -p relab_prod exec -T postgres bash /docker-entrypoint-initdb.d/10-relab-roles.sh
```

It reads the role names from the container environment and the passwords from
the mounted `secrets/prod/database_*_password` files, so there is nothing to
fill in. Replayed against a populated database it will:

- create only the roles that do not exist yet, leaving any existing role's
  password untouched;
- grant on the tables and sequences that **already exist**, which
  `ALTER DEFAULT PRIVILEGES` alone does not cover;
- apply `statement_timeout`, `lock_timeout` and
  `idle_in_transaction_session_timeout` to `relab_app`.

No downtime is needed: `ALTER ROLE ... SET` applies to new sessions, so restart
the API afterwards (or wait out the 30-minute connection recycle) for the
timeouts to take effect on the pool.

Verify all three roles exist and can log in before continuing.

______________________________________________________________________

## 6. Update the root `.env`

Backend settings that used to live in `backend/.env.prod` are now split: secrets
into `secrets/prod/`, non-secret public URLs into the committed
`deploy/env/prod.compose.env` (do not edit it), and operator inputs into the
root `.env`.

**Required — the stack will not render without these:**

```env
CLOUDFLARE_TUNNEL_TOKEN=…   # renamed from TUNNEL_TOKEN, same value
EMAIL_PROVIDER=smtp         # or microsoft_graph
EMAIL_FROM=…
EMAIL_REPLY_TO=…
BOOTSTRAP_SUPERUSER_EMAIL=…
```

**Carry across from `backend/.env.prod`,** noting the renames:

| old                                            | new                                                      |
| ---------------------------------------------- | -------------------------------------------------------- |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USERNAME` | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME`              |
| `SUPERUSER_EMAIL` / `SUPERUSER_NAME`           | `BOOTSTRAP_SUPERUSER_EMAIL` / `BOOTSTRAP_SUPERUSER_NAME` |
| `LOKI_URL`                                     | `LOKI_PUSH_URL`                                          |
| `BACKUP_DIR`                                   | `BACKUP_HOST_DIR`                                        |

`LOKI_PUSH_URL` matters: log shipping is enabled by the *presence* of that
variable, so an `.env` still saying `LOKI_URL=` silently stops shipping logs.
The Loki label set also changed from `service,env,host` to
`service,env,project`, so existing Grafana queries filtering on `host=` need
updating.

**Delete these stale names:** `APP_ENV`, `COMPOSE_PROJECT_NAME`, `BUILD_MODE`,
`CSP_API_ORIGIN`, `WEB_CONCURRENCY`, `BACKEND_API_URL`, `FRONTEND_APP_URL`,
`DOCS_URL`, `OAUTH_ALLOWED_REDIRECT_URIS`, and any `RELAB_*_IMAGE` overrides
(the release always builds locally and silently ignores them).

Check it:

```bash
just env-policy-check
just compose-config
```

______________________________________________________________________

## 7. Stop the old stack — from the old checkout

Five services were renamed (`docs-site`→`docs`, `app-site`→`app`,
`web-site`→`www`, and `uploads-backup`+`postgres-backup`→`backup`). The new
compose files do not know the old names, so stopping the stack from the old
checkout is still the clean path.

**Stop first, then switch:**

```bash
just prod-down YES backups          # still on the old revision
docker ps -a | grep relab_prod      # must be empty of running containers
```

Only then:

```bash
git checkout <release-branch> && git pull --ff-only
```

If you switched too early, `just prod-down YES` now passes `--remove-orphans`
and clears the renamed containers for you; verify with
`docker ps -a | grep relab_prod`.

______________________________________________________________________

## 8. Build, start, migrate

Images are built locally and pinned to `:prod-local` with no registry pull — a
stale image silently runs the *old* code, so the rebuild is mandatory:

```bash
just prod-build
```

Confirm no seeding is enabled (`SEED_DUMMY_DATA`, `SEED_CPV_CATEGORIES`,
`SEED_CPV_PRODUCT_TYPES`, `SEED_HS_CATEGORIES` unset or false) — the taxonomy
seeds are not gated on an empty database.

```bash
just prod-up YES backups scanning   # drop `scanning` if you decided against ClamAV in 1a
just prod-migrate YES
```

`prod-up` starts the database, cache, and (with the profile) ClamAV; expect the
API to stay unhealthy for a few minutes on first boot while virus signatures
download.
`prod-migrate` runs the 20 migrations in one transaction, then always runs
`create_superuser` (which only creates when absent — it will not reset your
existing superuser's password).

If the migration aborts, prod is untouched at `6f2b9e4a1c3d`. Fix the data
(almost certainly a query-A email, or a query-G quantity/amount_in_parent row),
and re-run.

This two-command order means the API serves against the *old* schema between
`prod-up` and `prod-migrate`. That is fine here — the cutover is a full outage
behind a closed tunnel — but it is not fine for a routine release. For those,
start the stack with the `migrations` profile instead and the API waits for the
migrator to exit 0 before it starts:

```bash
just prod-up YES backups scanning migrations   # migrate, then serve, in one step
```

The dependency is declared `required: false`, so a profile-less `prod-up`
behaves exactly as it always has. If the migration fails, the migrator exits
non-zero and the API never starts — the schema and the code stay in step.

Once the migration succeeds, backfill the byte-quota ledger (see the quota
lockout note above; wraps the same script as `just backfill-upload-sizes`,
which only exists locally, not in the container):

```bash
docker compose -p relab_prod --env-file .env --env-file deploy/env/prod.compose.env \
  -f compose.yaml -f compose.deploy.yaml \
  --profile migrations run --rm --entrypoint python \
  migrator -m scripts.maintenance.backfill_upload_sizes
```

______________________________________________________________________

## 8a. Encrypt the previously plaintext columns

Only if step 0 found prod at `main` (or any revision without
`DATA_ENCRYPTION_KEY`). `main` stores OAuth access/refresh tokens and YouTube
broadcast keys as plaintext; the release expects them AES-256-GCM encrypted
under `secrets/prod/data_encryption_key`. Until this runs, OAuth refresh and
any YouTube flow will fail to read their stored values.

Dry run first:

```bash
docker compose -p relab_prod --env-file .env --env-file deploy/env/prod.compose.env \
  -f compose.yaml -f compose.deploy.yaml \
  --profile migrations run --rm --entrypoint python \
  migrator -m scripts.maintenance.migrate_encryption_v1_to_v2 --dry-run
```

If it reports no errors, run it for real by dropping `--dry-run`. It is a
one-time pass tied to the key created in step 4 — losing that key makes the
encrypted columns unrecoverable.

______________________________________________________________________

## 9. Verify before declaring success

```sql
SELECT version_num FROM alembic_version;      -- f1a2b3c4d5e6

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

-- Quota ledger: file counts real, bytes expected 0 (see step 3).
SELECT sum(upload_file_count), sum(upload_total_bytes), max(upload_file_count) FROM "user";

ANALYZE product; ANALYZE "user"; ANALYZE image; ANALYZE file;
```

Then exercise the real paths:

```bash
curl -fsS https://api.cml-relab.org/live
curl -fsS https://api.cml-relab.org/health
```

Every public origin, not just the API — a healthy API behind a broken tunnel
route still reads as a failed launch to everyone else:

```bash
curl -fsS -o /dev/null -w '%{http_code} %{url_effective}\n' \
  https://api.cml-relab.org/live \
  https://api.cml-relab.org/health \
  https://app.cml-relab.org/ \
  https://cml-relab.org/ \
  https://docs.cml-relab.org/
```

No container may be restarting or unhealthy — the API in particular reports
`unhealthy` whenever Postgres or Redis is unreachable, which is the failure this
catches before a user does:

```bash
docker compose -p relab_prod ps --format '{{.Service}}\t{{.Status}}'
```

By hand: log in with Google **and** GitHub (the GitHub client changed in this
release), open a product with images, and **upload one image** — that last one
confirms the quota ledger is not tripping.

### Go / no-go

There is no automated gate and nothing pages anyone, so this is a deliberate
decision a human makes, once, out loud. **Go** requires all of:

- `alembic_version` is `f1a2b3c4d5e6`, and every count above matches the step 3
  baseline,
- all five origins return 2xx and no container is restarting or unhealthy,
- both OAuth providers, a product page, and one image upload work by hand.

Anything unresolved is **no-go**: roll back with §12 and retry in a later
window. Do not launch "mostly working" and fix forward — the pre-upgrade dump
gets less useful the longer prod accepts writes on the new schema.

______________________________________________________________________

## 10. Set up backups

```bash
just prod-up YES backups scanning   # drop `scanning` only if you disabled it in 1a
just backup-restore-smoke prod
```

Backups are now an encrypted restic repository under
`${BACKUP_HOST_DIR:-./backups}/restic`, needing `secrets/prod/restic_password`.
`main` has no restic tooling at all, so on a prod host coming from `main` this
is **first-time setup**: the repository is initialized on first run and there
are no pre-existing snapshots. From that point on, do not rotate
`restic_password` — every later snapshot depends on it. It is a required
secret: `up` starts the `backups` service by default.

For offsite, set the repository in the host's root `.env` and the scheduled
backup cycle copies snapshots there on every run:

```env
RESTIC_OFFSITE_REPOSITORY=rclone:<remote>:relab/prod/restic
```

An `rclone:` target reads its remote from `secrets/prod/rclone.conf`, which you
write by hand — `just deploy-secrets-template` seeds every missing secret file,
so overwrite the generated placeholder with the real rclone config. To copy on
demand outside the cycle:

```bash
just backup-offsite-copy prod
```

______________________________________________________________________

## 11. Cloudflare — do nothing, deliberately

`infra/cloudflare/` is new in this release. **Do not run `just cloudflare-apply`
during or after this cutover.**

There is no OpenTofu state for either workspace (`terraform.tfstate.d/staging/`
is empty; no `prod` workspace exists), so an apply against the live,
hand-configured zone would try to create everything from scratch: duplicate DNS
records, a **new** tunnel whose id does not match your live
`CLOUDFLARE_TUNNEL_TOKEN`, and — worst — new entries in the
`http_ratelimit`, `http_request_cache_settings`, and
`http_request_firewall_custom` phases, which allow exactly one ruleset per
(zone, phase) and could overwrite your hand-made rules.

Live traffic depends only on `CLOUDFLARE_TUNNEL_TOKEN` being set in the root
`.env` for the `cloudflared` service. It does not depend on this Terraform.

`just cloudflare-check` is safe (format, init, validate — no credentials, no
network). Adopting the module properly means importing each existing tunnel, DNS
record, and ruleset into state first; `infra/cloudflare/README.md` describes the
workflow but provides no import commands, so treat it as a separate project
after launch.

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

1. `just prod-up YES backups scanning` on `main` (drop `scanning` if you disabled
   it in 1a).

`just prod-build` also tags each image it builds with the commit it was built
from (`relab-backend:prod-<sha>` alongside `relab-backend:prod-local`), so
rolling back to the previous build needs no rebuild — per image:

```bash
docker tag relab-backend:prod-<oldsha> relab-backend:prod-local
just prod-up YES backups scanning   # drop `scanning` only if you disabled it in 1a
```

The schema has no scripted down-migration path for the dropped data: the
`downgrade()` functions restore column *shape* but not content. The dump from
step 2 is the real recovery mechanism, which is why step 0 forbids deleting it
early.

## Known post-launch gaps

Accepted risks, not blockers — but they are accepted by a person, not by
default. Owner: the deploy operator (currently the maintainer, Simon van
Lierde), who is also the one making the go/no-go call in §9. Do not discover
these by surprise:

- **No scripted schema rollback.** All 40 migrations define `downgrade()`, and
  `test_migrations_downgrade_upgrade` proves the newest one round-trips — but on
  an empty schema, one step only. Nothing tests a multi-step downgrade or data
  preservation, and a downgrade that re-adds a dropped column re-adds it empty.
  The §2 dump is the only data rollback; §12 is the only rehearsed path.

- **Rate-limit buckets reset once at this deploy.** The rate-limiter's HMAC
  signing key moved to `cache_signing_secret`, so every existing bucket key
  changes and in-flight windows restart from zero. Harmless (limits are
  short-lived), but do not read a post-deploy lull in 429s as a real change in
  traffic.

- **Minimal alerting only.** `just watchdog prod` checks the API container's health
  and the age of the newest restic snapshot, and exits non-zero with an `ALERT[...]`
  line per failure. Wire it to host cron so failures reach an operator:

  ```cron
  MAILTO=ops@example.org
  17 * * * * cd /path/to/relab && just watchdog prod >/dev/null
  ```

  Cron's `PATH` usually does not include `just` — use an absolute path to it or set
  `PATH=` in the crontab — and the cron user needs docker access (the `docker` group).

  Richer alerting (Loki rules, external uptime monitoring, Grafana) is still future
  work; anything the watchdog does not check is still discovered by hand.

- **This cutover is start-then-migrate.** The §8 commands bring the API up
  against the old schema before `prod-migrate` runs. Harmless here because you
  are taking a full outage. For routine releases, pass the `migrations` profile
  to `prod-up` instead and the API waits for the migrator to exit 0 (see §8) —
  that closes the window but is still not a zero-downtime deploy, since the API
  is down for the length of the migration.
