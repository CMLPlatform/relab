#!/usr/bin/env bash
# Operator and smoke-test helpers for Relab restic backups.
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_BACKUP_IMAGE="${DEPLOY_BACKUP_IMAGE:-relab-backups-smoke}"
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

# Assert a restored database has both schema AND data. Table existence alone is not
# enough: a dump taken from a freshly migrated, empty database has every table and
# zero rows, and passes a schema-only check while having restored nothing. Counts
# rows for real rather than reading pg_stat_user_tables, which is empty until ANALYZE.
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

# Restore the latest `postgres`-tagged snapshot from a restic repository into a
# throwaway Postgres container and assert the dump loads.
# Args: <repo dir> <restic password file> <scratch dir> [container name].
# Sets RESTORE_CONTAINER so the caller's EXIT trap can remove the container. The
# systemd path passes a DETERMINISTIC name so the unit's ExecStopPost reaper can
# remove the container after a SIGKILL, when no trap here ever runs — an unowned
# leftover holds a full restored copy of production data.
verify_postgres_restore() {
    local repo_dir="$1"
    local password_file="$2"
    local work_dir="$3"

    mkdir -p "$work_dir/restore"
    # The backup image runs as uid 1001, so the restore bind mount must be writable by it.
    docker run --rm -v "$work_dir/restore:/work" --entrypoint chown alpine:3.22 -R 1001:1001 /work
    RESTORE_CONTAINER="${4:-relab_restore_smoke_$(date +%s)_$$}"
    # A deterministic name can collide with a leftover from a killed earlier run;
    # replacing it is exactly what we want.
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

    docker run -d --name "$RESTORE_CONTAINER" \
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
    # The dump is taken with --schema=public and so recreates the schema itself;
    # pre-creating it here makes pg_restore fail on "schema public already exists".
    docker exec "$RESTORE_CONTAINER" psql -U postgres -d relab_restore -v ON_ERROR_STOP=1 \
        -c 'DROP SCHEMA IF EXISTS public CASCADE;'
    # --no-acl: the dump carries GRANTs/ALTER DEFAULT PRIVILEGES for roles
    # (relab_app, relab_migrator, relab_backup) that don't exist on a scratch
    # cluster; ACLs are irrelevant to a restorability check.
    local -a restore_args=(--no-owner --no-acl -U postgres -d relab_restore /tmp/relab.dump)
    # NOTE: --schema=public dumps omit CREATE EXTENSION, so the scratch cluster is
    # missing pg_trgm when trigram GIN indexes (gin_trgm_ops) are rebuilt. Real
    # clusters get it from the alembic migrations (f3a8c2d1e5b7, a1b2c3d4e5f6)
    # that own trigram search, not from initdb; mirror that list here and keep
    # it in sync if a migration ever adds another extension. The index
    # definitions schema-qualify the opclass as "public.gin_trgm_ops", so the
    # extension has to exist in "public" specifically — restore pre-data (which
    # recreates the "public" schema) first, create the extension, then restore
    # the rest so the later post-data section can build the trigram indexes.
    docker exec "$RESTORE_CONTAINER" pg_restore --section=pre-data "${restore_args[@]}"
    docker exec "$RESTORE_CONTAINER" psql -U postgres -d relab_restore -v ON_ERROR_STOP=1 \
        -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
    docker exec "$RESTORE_CONTAINER" pg_restore --section=data "${restore_args[@]}"
    docker exec "$RESTORE_CONTAINER" pg_restore --section=post-data "${restore_args[@]}"
    # NOTE: pg_restore can exit 0 on an empty archive, so assert schema AND rows landed.
    docker exec -i "$RESTORE_CONTAINER" psql -U postgres -d relab_restore -v ON_ERROR_STOP=1 -f - \
        <<<"$ASSERT_RESTORE_NOT_EMPTY"
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
        -c "CREATE TABLE public.backup_smoke(id integer PRIMARY KEY, name text NOT NULL);" \
        -c "INSERT INTO public.backup_smoke VALUES (1, 'ok');" \
        -c "GRANT pg_read_all_data TO relab_backup;"

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

    echo "✅ Restic backups smoke test passed"
}

# Read a var from a committed per-environment Compose env file. These are plain
# KEY=value files, so parse rather than source: sourcing a committed file to read
# one name is a needless execution path. Strip an inline ` # comment`, surrounding
# whitespace and one matching quote pair, the same way Compose (and the
# MALWARE_SCAN_ENABLED reader in deploy_ops.sh) resolve the value — a quoted entry
# must not aim the offsite copy at a repository Compose never uses.
read_deploy_env_var() {
    local env="$1" var_name="$2" file="$ROOT_DIR/deploy/env/$1.compose.env" value
    [[ -f "$file" ]] || return 0
    value="$(sed -n "s/^${var_name}=//p" "$file" | tail -n1)"
    value="${value%%[[:space:]]#*}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then
        value="${value:1:-1}"
    fi
    printf '%s' "$value"
}

backup_offsite_copy() {
    local env="${1:-staging}"
    # Same precedence Compose applies: the per-environment committed file beats the
    # shared root .env. Reading only the root .env here was how `backup-offsite-copy
    # prod` still aimed prod snapshots at STAGING's offsite repository long after the
    # compose path was fixed — the one value there resolves to the staging path.
    local offsite_repo="${RESTIC_OFFSITE_REPOSITORY:-}"
    [[ -z "$offsite_repo" ]] && offsite_repo="$(read_deploy_env_var "$env" RESTIC_OFFSITE_REPOSITORY)"
    [[ -z "$offsite_repo" ]] && offsite_repo="$(read_dotenv_var RESTIC_OFFSITE_REPOSITORY)"

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
    if [[ -z "$offsite_repo" ]]; then
        echo "RESTIC_OFFSITE_REPOSITORY must be set, for example: rclone:<remote>:relab/$env/restic"
        exit 1
    fi

    build_backup_image
    local -a docker_args=(
        --rm
        -v "$DEPLOY_RESTIC_REPOSITORY:/restic"
        -v "$tmp_root/restic_password:/run/secrets/restic_password:ro"
        -e RESTIC_PASSWORD_FILE=/run/secrets/restic_password
        -e RESTIC_OFFSITE_REPOSITORY="$offsite_repo"
        -e SKIP_DATABASE_BACKUP=true
        -e SKIP_UPLOAD_BACKUP=true
    )

    if [[ "$offsite_repo" == rclone:* ]]; then
        if [[ ! -f "$rclone_config" ]]; then
            echo "rclone config file not found: $rclone_config"
            exit 1
        fi
        install -m 0444 "$rclone_config" "$tmp_root/rclone.conf"
        docker_args+=(
            -v "$tmp_root/rclone.conf:/run/secrets/rclone.conf:ro"
            -e RCLONE_CONFIG=/run/secrets/rclone.conf
        )
    fi

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

    # The API is the only writer, so stopping it makes the restore a clean swap
    # rather than a race against live traffic. restore_cleanup restarts it on the
    # way out even when pg_restore fails, so a failed restore does not also leave
    # the stack down.
    if [[ "$(docker inspect -f '{{.State.Running}}' "$api_container" 2>/dev/null)" == "true" ]]; then
        RESTORE_API_WAS_RUNNING=true
        docker stop "$api_container" >/dev/null
    fi

    docker cp "$dump_file" "$pg_container:/tmp/relab-restore.dump"

    # Same sequence as verify_postgres_restore, and for the same reasons: the
    # --schema=public dump recreates the schema itself, and pg_trgm must exist in
    # "public" before post-data rebuilds the trigram GIN indexes. Unlike the smoke
    # test this keeps ACLs — relab_app/relab_migrator/relab_backup exist here, and
    # dropping their grants would leave the API unable to read its own tables.
    local -r dump=/tmp/relab-restore.dump
    docker exec "$pg_container" sh -c \
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE;"'
    docker exec "$pg_container" sh -c \
        "pg_restore --section=pre-data -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" $dump"
    docker exec "$pg_container" sh -c \
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"'
    docker exec "$pg_container" sh -c \
        "pg_restore --section=data -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" $dump"
    docker exec "$pg_container" sh -c \
        "pg_restore --section=post-data -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" $dump"
    # pg_restore can exit 0 on an empty archive, and a schema-only check passes on a
    # migrated-but-empty dump, so assert rows landed too.
    docker exec -i "$pg_container" sh -c \
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f -' <<<"$ASSERT_RESTORE_NOT_EMPTY"

    echo "✅ Restored $env from snapshot '$snapshot'"
}

# List the snapshots in an environment's local repository. Read-only: --no-lock keeps
# the repo mount read-only, so this can be run safely while a backup is in flight.
# Exists because picking a snapshot to restore should not require hand-writing a
# `docker run` incantation -- `just restore <env> YES latest` is easy to reach for and,
# after a bad backup, `latest` is exactly the snapshot you must not use.
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
