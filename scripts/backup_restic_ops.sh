#!/usr/bin/env bash
# Operator and smoke-test helpers for Relab restic backups.
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_BACKUP_IMAGE="${DEPLOY_BACKUP_IMAGE:-relab-backups-smoke}"
# Built by build_migrator_image below; compose names it "<project>-<service>".
DEPLOY_MIGRATOR_IMAGE="${DEPLOY_MIGRATOR_IMAGE:-relab_test-migrator}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:18@sha256:78481659c47e862334611ccdaf7c369c986b3046da9857112f3b309114a65fb4}"
RESTORE_CONTAINER=""
# Read by restore_cleanup, which runs from an EXIT trap — i.e. after
# restore_postgres has returned and its locals are gone. Script scope, not local.
RESTORE_API_CONTAINER=""
RESTORE_API_WAS_RUNNING=false
RESTORE_PG_CONTAINER=""
RESTORE_TMP_ROOT=""
RESTORE_HOST_UID=""
RESTORE_HOST_GID=""

restore_cleanup() {
    if [[ "$RESTORE_API_WAS_RUNNING" == true ]]; then
        docker start "$RESTORE_API_CONTAINER" >/dev/null 2>&1 || true
    fi
    if [[ -n "$RESTORE_PG_CONTAINER" ]]; then
        docker exec "$RESTORE_PG_CONTAINER" rm -f /tmp/relab-restore.dump >/dev/null 2>&1 || true
    fi
    if [[ -n "$RESTORE_TMP_ROOT" && -d "$RESTORE_TMP_ROOT" ]]; then
        docker run --rm -v "$RESTORE_TMP_ROOT:/work" --entrypoint chown alpine:3.22 \
            -R "$RESTORE_HOST_UID:$RESTORE_HOST_GID" /work >/dev/null 2>&1 || true
        rm -rf "$RESTORE_TMP_ROOT"
    fi
}

# Assert a restored database has both schema and data. A dump taken from a freshly
# migrated, empty database has every table and zero rows, so it passes a schema-only
# check. Counts rows directly rather than reading pg_stat_user_tables, which is empty
# until ANALYZE.
read -r -d '' ASSERT_RESTORE_NOT_EMPTY <<'SQL' || true
DO $$
DECLARE
    tbl record;
    n bigint;
    total bigint := 0;
    tables int := 0;
BEGIN
    FOR tbl IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        tables := tables + 1;
        EXECUTE format('SELECT count(*) FROM %I.%I', tbl.schemaname, tbl.tablename) INTO n;
        total := total + n;
    END LOOP;
    IF tables = 0 THEN
        RAISE EXCEPTION 'restored dump has no tables in schema public';
    END IF;
    IF total = 0 THEN
        RAISE EXCEPTION 'restored dump has % tables but 0 rows -- the snapshot is empty', tables;
    END IF;
    RAISE NOTICE 'restored % tables, % rows', tables, total;
END $$;
SQL

require_dir() {
    local description="$1"
    local path="$2"
    if [[ ! -d "$path" ]]; then
        echo "$description not found: $path" >&2
        exit 1
    fi
    realpath "$path"
}

require_file() {
    local description="$1"
    local path="$2"
    if [[ ! -f "$path" ]]; then
        echo "$description not found: $path" >&2
        exit 1
    fi
    realpath "$path"
}

# Read a single var from the root .env in a subshell, without letting it
# overwrite any other exported value in this process.
# NOTE: Compose loads .env itself; this script must mirror that for the few
# values it also needs — but a shell-exported value still wins over the
# file, matching Compose's own precedence.
read_dotenv_var() {
    local var_name="$1"
    [[ -f "$ROOT_DIR/.env" ]] || return 0
    (
        set -a
        # shellcheck source=/dev/null
        . "$ROOT_DIR/.env" >/dev/null 2>&1
        printf '%s' "${!var_name:-}"
    )
}

resolve_backup_paths() {
    local env="$1"

    local backup_dir="${BACKUP_HOST_DIR:-}"
    [[ -z "$backup_dir" ]] && backup_dir="$(read_dotenv_var BACKUP_HOST_DIR)"
    backup_dir="${backup_dir:-./backups}"
    # Paths are anchored to the repo root so the script works from any CWD.
    [[ "$backup_dir" == /* ]] || backup_dir="$ROOT_DIR/$backup_dir"

    local repo="$backup_dir/restic"
    local secret="$ROOT_DIR/secrets/$env/restic_password"

    DEPLOY_RESTIC_REPOSITORY="$(require_dir "Restic repository" "$repo")"
    DEPLOY_RESTIC_PASSWORD_FILE="$(require_file "Restic password file" "$secret")"
    export DEPLOY_RESTIC_REPOSITORY DEPLOY_RESTIC_PASSWORD_FILE
}

build_backup_image() {
    docker build -f backend/Dockerfile.backups -t "$DEPLOY_BACKUP_IMAGE" backend
}

# Build through the CI compose files rather than `docker build`, so the build reuses
# the `type=gha,scope=migrator` cache the other smoke recipes already populate.
build_migrator_image() {
    docker compose -p relab_test -f "$ROOT_DIR/compose.yaml" -f "$ROOT_DIR/compose.ci.yaml" build migrator
}

# Restore the latest `postgres`-tagged snapshot from a restic repository into a
# throwaway Postgres container and assert the dump loads.
# Args: <repo dir> <restic password file> <scratch dir> [container name].
# Sets RESTORE_CONTAINER so the caller's EXIT trap can remove the container. The
# systemd path passes a deterministic name so the unit's ExecStopPost reaper can remove
# the container after a SIGKILL, when no trap here runs. A leftover holds a full restored
# copy of production data.
# Replay a pg_dump custom-format archive already copied into a running Postgres
# container, then assert schema AND rows landed. One function for the smoke test and
# the live restore, so the sequence CI exercises is the sequence an operator runs.
# Args: <container> <dump path inside the container> <db user> <db name>
#       [extra pg_restore args...]
replay_dump() {
    local container="$1" dump="$2" user="$3" db="$4"
    shift 4
    # -i: the assertion below is fed on stdin, and without it psql reads EOF, runs
    # nothing and exits 0 -- an assertion that never fails because it never runs.
    local -a psql=(docker exec -i "$container" psql -U "$user" -d "$db" -v ON_ERROR_STOP=1)
    local -a pg_restore=(docker exec "$container" pg_restore "$@" -U "$user" -d "$db" "$dump")
    # The dump is taken with --schema=public and so recreates the schema itself;
    # pre-creating it here makes pg_restore fail on "schema public already exists".
    # Extensions other than pg_trgm live in the "extensions" schema, which the drop
    # below leaves alone; provision.sh created it on a live cluster, the scratch
    # cluster of the smoke test needs it before pre-data references the unaccent
    # dictionary. NOTE: keep this list in sync with the trusted extensions Alembic
    # installs there.
    "${psql[@]}" -c 'CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;'
    "${psql[@]}" -c 'DROP SCHEMA IF EXISTS public CASCADE;'
    # NOTE: --schema=public dumps omit CREATE EXTENSION, so the target is missing
    # pg_trgm when trigram GIN indexes (gin_trgm_ops) are rebuilt. Real clusters get
    # it from the alembic migrations (f3a8c2d1e5b7, a1b2c3d4e5f6) that own trigram
    # search, not from initdb; mirror that list here and keep it in sync if a
    # migration ever adds another extension. The index definitions schema-qualify
    # the opclass as "public.gin_trgm_ops", so the extension has to exist in "public"
    # specifically — restore pre-data (which recreates the "public" schema) first,
    # create the extension, then restore the rest so the later post-data section can
    # build the trigram indexes.
    "${pg_restore[@]}" --section=pre-data
    "${psql[@]}" -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
    "${pg_restore[@]}" --section=data
    "${pg_restore[@]}" --section=post-data
    # NOTE: pg_restore can exit 0 on an empty archive, and a schema-only check passes
    # on a migrated-but-empty dump, so assert rows landed too.
    "${psql[@]}" -f - <<<"$ASSERT_RESTORE_NOT_EMPTY"
}

verify_postgres_restore() {
    local repo_dir="$1"
    local password_file="$2"
    local work_dir="$3"

    mkdir -p "$work_dir/restore"
    # The backup image runs as uid 1001, so the restore bind mount must be writable by it.
    docker run --rm -v "$work_dir/restore:/work" --entrypoint chown alpine:3.22 -R 1001:1001 /work
    RESTORE_CONTAINER="${4:-relab_restore_smoke_$(date +%s)_$$}"
    # A deterministic name can collide with a leftover from a killed earlier run;
    # replace it.
    docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true

    docker run --rm \
        -v "$repo_dir:/restic:ro" \
        -v "$password_file:/run/secrets/restic_password:ro" \
        -v "$work_dir/restore:/restore" \
        -e RESTIC_PASSWORD_FILE=/run/secrets/restic_password \
        --entrypoint restic \
        "$DEPLOY_BACKUP_IMAGE" \
        restore --no-lock latest --repo /restic --tag postgres --target /restore

    local dump_file
    dump_file="$(find "$work_dir/restore" -type f -name '*.dump' | sort | tail -n1)"
    if [[ -z "$dump_file" ]]; then
        echo "No PostgreSQL .dump file found in restored restic snapshot" >&2
        exit 1
    fi

    # --network none: this container holds a full copy of production data behind a fixed
    # password for as long as the check runs. The dump arrives by `docker cp` and every
    # query goes through `docker exec`, so it needs no network.
    docker run -d --name "$RESTORE_CONTAINER" --network none \
        -e POSTGRES_PASSWORD=restore-password \
        -e POSTGRES_DB=relab_restore \
        "$POSTGRES_IMAGE" >/dev/null

    local restore_ready=false
    for _ in {1..60}; do
        if docker exec "$RESTORE_CONTAINER" psql -U postgres -d relab_restore -v ON_ERROR_STOP=1 -c 'SELECT 1;' \
            >/dev/null 2>&1; then
            restore_ready=true
            break
        fi
        sleep 1
    done
    if [[ "$restore_ready" != true ]]; then
        echo "Restore smoke Postgres container did not become query-ready" >&2
        exit 1
    fi

    docker cp "$dump_file" "$RESTORE_CONTAINER:/tmp/relab.dump"
    # --no-acl: the dump carries GRANTs/ALTER DEFAULT PRIVILEGES for roles
    # (relab_app, relab_migrator, relab_backup) that don't exist on a scratch
    # cluster; ACLs are irrelevant to a restorability check.
    replay_dump "$RESTORE_CONTAINER" /tmp/relab.dump postgres relab_restore --no-owner --no-acl
}

docker_smoke_backups() {
    tmp_root="$(mktemp -d)"
    network="relab_backup_smoke_$(date +%s)"
    postgres_container="${network}_postgres"
    host_uid="$(id -u)"
    host_gid="$(id -g)"

    cleanup() {
        docker rm -f "$postgres_container" >/dev/null 2>&1 || true
        docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
        docker network rm "$network" >/dev/null 2>&1 || true
        docker run --rm -v "$tmp_root:/work" --entrypoint chown alpine:3.22 -R "$host_uid:$host_gid" /work \
            >/dev/null 2>&1 || true
        rm -rf "$tmp_root"
    }
    trap cleanup EXIT

    mkdir -p "$tmp_root/uploads/images" "$tmp_root/uploads/files" "$tmp_root/restic" "$tmp_root/offsite" "$tmp_root/rclone"
    printf 'smoke test image bytes\n' >"$tmp_root/uploads/images/example.txt"
    printf 'smoke test file bytes\n' >"$tmp_root/uploads/files/example.txt"
    printf '[offsite]\ntype = local\n' >"$tmp_root/rclone/rclone.conf"

    build_backup_image
    docker run --rm -v "$tmp_root/restic:/work" --entrypoint chown alpine:3.22 -R 1001:1001 /work
    docker run --rm -v "$tmp_root/offsite:/work" --entrypoint chown alpine:3.22 -R 1001:1001 /work
    docker network create "$network" >/dev/null
    docker run -d --name "$postgres_container" --network "$network" \
        -e POSTGRES_PASSWORD=postgres-password \
        -e POSTGRES_DB=relab_smoke \
        "$POSTGRES_IMAGE" >/dev/null

    for _ in {1..60}; do
        if docker exec "$postgres_container" psql -U postgres -d relab_smoke -v ON_ERROR_STOP=1 -c 'SELECT 1;' \
            >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    docker exec "$postgres_container" psql -U postgres -d relab_smoke -v ON_ERROR_STOP=1 \
        -c "CREATE ROLE relab_backup LOGIN PASSWORD 'backup-password';" \
        -c "GRANT pg_read_all_data TO relab_backup;"

    # Migrate the scratch database to Alembic head instead of hand-rolling a table: the
    # dump then carries the real schema, so replay_dump's extension list is exercised by
    # every extension a migration installs, not just the ones someone remembered.
    # .env.test supplies the settings alembic's env.py loads; the role overrides point it
    # at the scratch cluster's bootstrap superuser, which has no relab_* roles.
    build_migrator_image
    docker run --rm --network "$network" \
        --env-file "$ROOT_DIR/backend/.env.test" \
        -e DATABASE_HOST="$postgres_container" \
        -e POSTGRES_DB=relab_smoke \
        -e DATABASE_MIGRATION_USER=postgres \
        -e DATABASE_MIGRATION_PASSWORD=postgres-password \
        --entrypoint alembic \
        "$DEPLOY_MIGRATOR_IMAGE" upgrade head

    # One row per table the restore assertions read. The diacritic makes the search
    # assertion below fail unless unaccent survived the round trip.
    docker exec "$postgres_container" psql -U postgres -d relab_smoke -v ON_ERROR_STOP=1 \
        -c "INSERT INTO \"user\" (id, email, email_canonical, hashed_password, is_active, is_superuser, is_verified, mfa_enabled)
            VALUES (gen_random_uuid(), 'smoke@example.com', 'smoke@example.com', 'not-a-real-hash',
                    true, false, true, false);" \
        -c "INSERT INTO taxonomy (name, domains) VALUES ('Smoke', ARRAY['PRODUCTS']::taxonomydomain[]);" \
        -c "INSERT INTO category (name, taxonomy_id) SELECT 'Café', id FROM taxonomy;" \
        -c "INSERT INTO product (name, owner_id) SELECT 'Café', id FROM \"user\";"

    docker run --rm \
        --network "$network" \
        -v "$tmp_root/uploads:/data/uploads:ro" \
        -v "$tmp_root/restic:/restic" \
        -v "$tmp_root/offsite:/offsite" \
        -v "$tmp_root/rclone/rclone.conf:/run/secrets/rclone.conf:ro" \
        -e DATABASE_HOST="$postgres_container" \
        -e DATABASE_BACKUP_USER=relab_backup \
        -e DATABASE_BACKUP_PASSWORD=backup-password \
        -e POSTGRES_DB=relab_smoke \
        -e RESTIC_PASSWORD=smoke-password \
        -e RESTIC_OFFSITE_REPOSITORY=rclone:offsite:/offsite \
        -e RCLONE_CONFIG=/run/secrets/rclone.conf \
        "$DEPLOY_BACKUP_IMAGE"

    docker run --rm \
        -v "$tmp_root/restic:/restic:ro" \
        -e RESTIC_PASSWORD=smoke-password \
        --entrypoint restic \
        "$DEPLOY_BACKUP_IMAGE" \
        snapshots --no-lock --repo /restic --tag user-uploads --json >/dev/null
    docker run --rm \
        -v "$tmp_root/restic:/restic:ro" \
        -e RESTIC_PASSWORD=smoke-password \
        --entrypoint restic \
        "$DEPLOY_BACKUP_IMAGE" \
        snapshots --no-lock --repo /restic --tag postgres --json >/dev/null
    docker run --rm \
        -v "$tmp_root/offsite:/offsite:ro" \
        -v "$tmp_root/rclone/rclone.conf:/run/secrets/rclone.conf:ro" \
        -e RESTIC_PASSWORD=smoke-password \
        -e RCLONE_CONFIG=/run/secrets/rclone.conf \
        --entrypoint restic \
        "$DEPLOY_BACKUP_IMAGE" \
        snapshots --no-lock --repo rclone:offsite:/offsite --tag postgres --json >/dev/null

    # Snapshots existing is not proof they restore; replay the dump into scratch Postgres.
    printf 'smoke-password\n' >"$tmp_root/restic_password"
    chmod 0444 "$tmp_root/restic_password"
    verify_postgres_restore "$tmp_root/restic" "$tmp_root/restic_password" "$tmp_root"

    # Present is not the same as functional: exercise the unaccented trigram path and
    # assert the restore landed on the same revision the checkout migrates to.
    docker exec -i "$RESTORE_CONTAINER" psql -U postgres -d relab_restore -v ON_ERROR_STOP=1 -f - <<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM category WHERE relab_unaccent(name) % relab_unaccent('cafe')) THEN
        RAISE EXCEPTION 'restored category is not searchable through relab_unaccent + pg_trgm';
    END IF;
END $$;
SQL

    expected_head="$(docker run --rm --entrypoint alembic "$DEPLOY_MIGRATOR_IMAGE" heads | awk '{print $1}')"
    restored_head="$(docker exec "$RESTORE_CONTAINER" psql -U postgres -d relab_restore -tAc \
        'SELECT version_num FROM alembic_version')"
    if [[ "$restored_head" != "$expected_head" ]]; then
        echo "Restored alembic_version is '$restored_head', expected head '$expected_head'" >&2
        exit 1
    fi

    echo "✅ Restic backups smoke test passed"
}

backup_offsite_copy() {
    local env="${1:-staging}"
    resolve_backup_paths "$env"

    local rclone_config="$ROOT_DIR/secrets/$env/rclone.conf"
    local tmp_root
    tmp_root="$(mktemp -d)"
    # Expand tmp_root into the trap now (double quotes): a single-quoted trap would
    # defer expansion to EXIT, when this `local` is out of scope — under `set -u`
    # cleanup would then fail and leave the copied restic password in /tmp.
    # shellcheck disable=SC2064  # eager expansion is intentional here (see above)
    trap "rm -rf '$tmp_root'" EXIT
    install -m 0444 "$DEPLOY_RESTIC_PASSWORD_FILE" "$tmp_root/restic_password"
    if [[ ! -f "$rclone_config" ]]; then
        echo "no offsite target: write $rclone_config with exactly one remote"
        exit 1
    fi

    build_backup_image
    local -a docker_args=(
        --rm
        -v "$DEPLOY_RESTIC_REPOSITORY:/restic"
        -v "$tmp_root/restic_password:/run/secrets/restic_password:ro"
        -e RESTIC_PASSWORD_FILE=/run/secrets/restic_password
        -e SKIP_DATABASE_BACKUP=true
        -e SKIP_UPLOAD_BACKUP=true
    )

    # The container derives the repository from the config's one remote
    # (backup_relab_restic.sh derive_offsite_repository).
    install -m 0444 "$rclone_config" "$tmp_root/rclone.conf"
    docker_args+=(
        -v "$tmp_root/rclone.conf:/run/secrets/rclone.conf:ro"
        -e RCLONE_CONFIG=/run/secrets/rclone.conf
    )

    docker run "${docker_args[@]}" "$DEPLOY_BACKUP_IMAGE"
}

backup_restore_smoke() {
    local env="${1:-prod}"

    resolve_backup_paths "$env"

    tmp_root="$(mktemp -d)"
    host_uid="$(id -u)"
    host_gid="$(id -g)"

    cleanup() {
        docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
        docker run --rm -v "$tmp_root:/work" --entrypoint chown alpine:3.22 -R "$host_uid:$host_gid" /work \
            >/dev/null 2>&1 || true
        rm -rf "$tmp_root"
    }
    trap cleanup EXIT

    install -m 0444 "$DEPLOY_RESTIC_PASSWORD_FILE" "$tmp_root/restic_password"
    build_backup_image

    # Deterministic container name: relab-restore-check@.service reaps it by name in
    # ExecStopPost when systemd kills this job on timeout (see verify_postgres_restore).
    verify_postgres_restore "$DEPLOY_RESTIC_REPOSITORY" "$tmp_root/restic_password" "$tmp_root" \
        "relab-restore-check-$env"

    echo "✅ Backup restore smoke test passed"
}

# Restore a `postgres`-tagged snapshot into the LIVE database of an environment.
# Destructive: drops schema "public" and replaces it with the snapshot's contents.
# Args: <env> <confirm> [snapshot id, default "latest"].
restore_postgres() {
    local env="${1:-}" confirm="${2:-}" snapshot="${3:-latest}"
    if [[ -z "$env" ]]; then
        echo "Usage: $0 restore ENV YES [SNAPSHOT]" >&2
        exit 2
    fi
    if [[ "$confirm" != "YES" ]]; then
        echo "Refusing to restore into '$env': pass YES to confirm." >&2
        echo "This DROPS the current schema and replaces it with snapshot '$snapshot'." >&2
        exit 2
    fi
    # Same allowlist as the watchdog: env is spliced into secret paths and container
    # names, and this is the one command that drops a live schema.
    case "$env" in
        prod | staging) ;;
        *)
            echo "error: env must be 'prod' or 'staging', got '$env'" >&2
            exit 2
            ;;
    esac

    resolve_backup_paths "$env"

    local pg_container="relab_${env}-postgres-1"
    local api_container="relab_${env}-api-1"
    if ! docker inspect "$pg_container" >/dev/null 2>&1; then
        echo "Postgres container not found: $pg_container (is the stack up?)" >&2
        exit 1
    fi

    local tmp_root
    tmp_root="$(mktemp -d)"
    RESTORE_PG_CONTAINER="$pg_container"
    RESTORE_API_CONTAINER="$api_container"
    RESTORE_TMP_ROOT="$tmp_root"
    RESTORE_HOST_UID="$(id -u)"
    RESTORE_HOST_GID="$(id -g)"
    trap restore_cleanup EXIT

    build_backup_image
    mkdir -p "$tmp_root/restore"
    # The backup image runs as uid 1001, so the restore bind mount must be writable by it.
    docker run --rm -v "$tmp_root/restore:/work" --entrypoint chown alpine:3.22 -R 1001:1001 /work

    docker run --rm \
        -v "$DEPLOY_RESTIC_REPOSITORY:/restic:ro" \
        -v "$DEPLOY_RESTIC_PASSWORD_FILE:/run/secrets/restic_password:ro" \
        -v "$tmp_root/restore:/restore" \
        -e RESTIC_PASSWORD_FILE=/run/secrets/restic_password \
        --entrypoint restic \
        "$DEPLOY_BACKUP_IMAGE" \
        restore --no-lock "$snapshot" --repo /restic --tag postgres --target /restore

    local dump_file
    dump_file="$(find "$tmp_root/restore" -type f -name '*.dump' | sort | tail -n1)"
    if [[ -z "$dump_file" ]]; then
        echo "No PostgreSQL .dump file found in snapshot '$snapshot'" >&2
        exit 1
    fi
    echo "Restoring $(basename "$dump_file") into $pg_container"

    # The API is the only writer, so stopping it makes the restore a clean swap rather
    # than a race against live traffic. restore_cleanup restarts it on the way out even
    # when pg_restore fails.
    if [[ "$(docker inspect -f '{{.State.Running}}' "$api_container" 2>/dev/null)" == "true" ]]; then
        RESTORE_API_WAS_RUNNING=true
        docker stop "$api_container" >/dev/null
    fi

    docker cp "$dump_file" "$pg_container:/tmp/relab-restore.dump"

    # The same replay as the smoke test, so CI has exercised this sequence. This path
    # keeps ACLs: relab_app/relab_migrator/relab_backup exist here, and dropping their
    # grants would leave the API unable to read its own tables.
    local pg_user pg_db
    pg_user="$(docker exec "$pg_container" sh -c 'printf %s "${POSTGRES_USER:-postgres}"')"
    pg_db="$(docker exec "$pg_container" sh -c 'printf %s "$POSTGRES_DB"')"
    replay_dump "$pg_container" /tmp/relab-restore.dump "$pg_user" "$pg_db"

    # DROP SCHEMA public CASCADE also took the ALTER DEFAULT PRIVILEGES rows that
    # give relab_app access to tables future migrations create, and a
    # --schema=public dump does not carry them back. Existing tables keep their
    # grants, so the API works until the next migration adds a table. provision.sh
    # is idempotent and already mounted, so run it again.
    docker exec "$pg_container" bash /docker-entrypoint-initdb.d/provision.sh >/dev/null

    echo "✅ Restored $env from snapshot '$snapshot'"
}

# List the snapshots in an environment's local repository. Read-only: --no-lock keeps the
# repo mount read-only, so this is safe to run while a backup is in flight. Needed
# because after a bad backup, `just restore <env> YES latest` restores the one snapshot
# you must not use, and picking another one requires knowing the ids.
list_snapshots() {
    local env="${1:-}" count="${2:-20}"
    if [[ -z "$env" ]]; then
        echo "Usage: $0 snapshots ENV [COUNT]" >&2
        exit 2
    fi
    resolve_backup_paths "$env"
    build_backup_image >/dev/null

    docker run --rm -i \
        -v "$DEPLOY_RESTIC_REPOSITORY:/restic:ro" \
        -v "$DEPLOY_RESTIC_PASSWORD_FILE:/run/secrets/restic_password:ro" \
        -e RESTIC_PASSWORD_FILE=/run/secrets/restic_password \
        --entrypoint restic \
        "$DEPLOY_BACKUP_IMAGE" \
        snapshots --no-lock --repo /restic --tag postgres --latest "$count"
}

main() {
    case "${1:-}" in
        docker-smoke-backups)
            docker_smoke_backups
            ;;
        backup-offsite-copy)
            backup_offsite_copy "${2:-staging}"
            ;;
        restore-check)
            backup_restore_smoke "${2:-prod}"
            ;;
        restore)
            restore_postgres "${2:-}" "${3:-}" "${4:-latest}"
            ;;
        snapshots)
            list_snapshots "${2:-}" "${3:-20}"
            ;;
        *)
            echo "Usage: $0 {docker-smoke-backups|backup-offsite-copy ENV|restore-check ENV|restore ENV YES [SNAPSHOT]|snapshots ENV [COUNT]}" >&2
            exit 2
            ;;
    esac
}

main "$@"
