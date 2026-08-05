#!/usr/bin/env bash
# Operator and smoke-test helpers for Relab restic backups.
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_BACKUP_IMAGE="${DEPLOY_BACKUP_IMAGE:-relab-backups-smoke}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:18@sha256:78481659c47e862334611ccdaf7c369c986b3046da9857112f3b309114a65fb4}"
RESTORE_CONTAINER=""

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

resolve_backup_paths() {
    local env="$1"

    # NOTE: BACKUP_HOST_DIR is a root .env value; Compose loads it itself, this script
    # must too — but only that one name, read in a subshell. Sourcing the whole .env
    # here would let it overwrite every other exported value, and would invert Compose's
    # precedence, where a shell-exported value wins over the file.
    local backup_dir="${BACKUP_HOST_DIR:-}"
    if [[ -z "$backup_dir" && -f "$ROOT_DIR/.env" ]]; then
        backup_dir="$(
            set -a
            # shellcheck source=/dev/null
            . "$ROOT_DIR/.env" >/dev/null 2>&1
            printf '%s' "${BACKUP_HOST_DIR:-}"
        )"
    fi
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
# Args: <repo dir> <restic password file> <scratch dir>.
# Sets RESTORE_CONTAINER so the caller's EXIT trap can remove the container.
verify_postgres_restore() {
    local repo_dir="$1"
    local password_file="$2"
    local work_dir="$3"

    mkdir -p "$work_dir/restore"
    # The backup image runs as uid 1001, so the restore bind mount must be writable by it.
    docker run --rm -v "$work_dir/restore:/work" --entrypoint chown alpine:3.22 -R 1001:1001 /work
    RESTORE_CONTAINER="relab_restore_smoke_$(date +%s)_$$"

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
    docker exec "$RESTORE_CONTAINER" pg_restore --no-owner -U postgres -d relab_restore /tmp/relab.dump
    # NOTE: pg_restore can exit 0 on an empty archive, so assert tables actually landed.
    docker exec "$RESTORE_CONTAINER" psql -U postgres -d relab_restore -v ON_ERROR_STOP=1 -c \
        "DO \$\$ BEGIN IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') = 0 THEN RAISE EXCEPTION 'restored dump has no tables in schema public'; END IF; END \$\$;"
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
        -e BACKUP_RUN_ONCE=true \
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

backup_offsite_copy() {
    local env="${1:-staging}"
    local offsite_repo="${RESTIC_OFFSITE_REPOSITORY:-}"

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
        -e BACKUP_RUN_ONCE=true
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

    verify_postgres_restore "$DEPLOY_RESTIC_REPOSITORY" "$tmp_root/restic_password" "$tmp_root"

    echo "✅ Backup restore smoke test passed"
}

main() {
    case "${1:-}" in
        docker-smoke-backups)
            docker_smoke_backups
            ;;
        backup-offsite-copy)
            backup_offsite_copy "${2:-staging}"
            ;;
        backup-restore-smoke)
            backup_restore_smoke "${2:-prod}"
            ;;
        *)
            echo "Usage: $0 {docker-smoke-backups|backup-offsite-copy ENV|backup-restore-smoke ENV}" >&2
            exit 2
            ;;
    esac
}

main "$@"
