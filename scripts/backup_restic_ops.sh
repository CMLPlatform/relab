#!/usr/bin/env bash
# Operator and smoke-test helpers for RELab restic backups.
set -euo pipefail

POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:18@sha256:78481659c47e862334611ccdaf7c369c986b3046da9857112f3b309114a65fb4}"

docker_smoke_backups() {
    source scripts/deploy_helpers.sh

    tmp_root="$(mktemp -d)"
    network="relab_backup_smoke_$(date +%s)"
    postgres_container="${network}_postgres"
    host_uid="$(id -u)"
    host_gid="$(id -g)"

    cleanup() {
        docker rm -f "$postgres_container" >/dev/null 2>&1 || true
        docker network rm "$network" >/dev/null 2>&1 || true
        docker run --rm -v "$tmp_root:/work" --entrypoint chown alpine:3.22 -R "$host_uid:$host_gid" /work \
            >/dev/null 2>&1 || true
        rm -rf "$tmp_root"
    }
    trap cleanup EXIT

    mkdir -p "$tmp_root/uploads/images" "$tmp_root/uploads/files" "$tmp_root/restic" "$tmp_root/offsite" "$tmp_root/rclone"
    printf 'smoke test image bytes\n' > "$tmp_root/uploads/images/example.txt"
    printf 'smoke test file bytes\n' > "$tmp_root/uploads/files/example.txt"
    printf '[offsite]\ntype = local\n' > "$tmp_root/rclone/rclone.conf"

    deploy_build_backup_image
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

    echo "✅ Restic backups smoke test passed"
}

backup_offsite_copy() {
    local env="${1:-staging}"
    source scripts/deploy_helpers.sh

    deploy_load_root_env_preserving BACKUP_DIR RESTIC_OFFSITE_REPOSITORY
    deploy_resolve_backup_paths "$env"

    local rclone_config="secrets/$env/rclone.conf"
    local tmp_root
    tmp_root="$(mktemp -d)"
    trap 'rm -rf "$tmp_root"' EXIT
    install -m 0444 "$DEPLOY_RESTIC_PASSWORD_FILE" "$tmp_root/restic_password"
    if [[ -z "${RESTIC_OFFSITE_REPOSITORY:-}" ]]; then
        echo "RESTIC_OFFSITE_REPOSITORY must be set, for example: rclone:<remote>:relab/$env/restic"
        exit 1
    fi

    deploy_build_backup_image
    local -a docker_args=(
        --rm
        -v "$DEPLOY_RESTIC_REPOSITORY:/restic"
        -v "$tmp_root/restic_password:/run/secrets/restic_password:ro"
        -e RESTIC_PASSWORD_FILE=/run/secrets/restic_password
        -e RESTIC_OFFSITE_REPOSITORY="$RESTIC_OFFSITE_REPOSITORY"
        -e SKIP_DATABASE_BACKUP=true
        -e SKIP_UPLOAD_BACKUP=true
        -e BACKUP_RUN_ONCE=true
    )

    if [[ "$RESTIC_OFFSITE_REPOSITORY" == rclone:* ]]; then
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
    source scripts/deploy_helpers.sh

    deploy_load_root_env_preserving BACKUP_DIR RESTIC_OFFSITE_REPOSITORY
    deploy_resolve_backup_paths "$env"

    tmp_root="$(mktemp -d)"
    container="relab_restore_smoke_$(date +%s)"
    host_uid="$(id -u)"
    host_gid="$(id -g)"

    cleanup() {
        docker rm -f "$container" >/dev/null 2>&1 || true
        docker run --rm -v "$tmp_root:/work" --entrypoint chown alpine:3.22 -R "$host_uid:$host_gid" /work \
            >/dev/null 2>&1 || true
        rm -rf "$tmp_root"
    }
    trap cleanup EXIT

    mkdir -p "$tmp_root/restore"
    install -m 0444 "$DEPLOY_RESTIC_PASSWORD_FILE" "$tmp_root/restic_password"
    deploy_build_backup_image

    docker run --rm \
        -v "$DEPLOY_RESTIC_REPOSITORY:/restic:ro" \
        -v "$tmp_root/restic_password:/run/secrets/restic_password:ro" \
        -v "$tmp_root/restore:/restore" \
        -e RESTIC_PASSWORD_FILE=/run/secrets/restic_password \
        --entrypoint restic \
        "$DEPLOY_BACKUP_IMAGE" \
        restore --no-lock latest --repo /restic --tag postgres --target /restore

    dump_file="$(find "$tmp_root/restore" -type f -name '*.dump' | sort | tail -n1)"
    if [[ -z "$dump_file" ]]; then
        echo "No PostgreSQL .dump file found in restored restic snapshot"
        exit 1
    fi

    docker run -d --name "$container" \
        -e POSTGRES_PASSWORD=restore-password \
        -e POSTGRES_DB=relab_restore \
        "$POSTGRES_IMAGE" >/dev/null

    restore_ready=false
    for _ in {1..60}; do
        if docker exec "$container" psql -U postgres -d relab_restore -v ON_ERROR_STOP=1 -c 'SELECT 1;' \
            >/dev/null 2>&1; then
            restore_ready=true
            break
        fi
        sleep 1
    done
    if [[ "$restore_ready" != true ]]; then
        echo "Restore smoke Postgres container did not become query-ready"
        exit 1
    fi

    docker cp "$dump_file" "$container:/tmp/relab.dump"
    docker exec "$container" psql -U postgres -d relab_restore -v ON_ERROR_STOP=1 \
        -c 'DROP SCHEMA IF EXISTS public CASCADE;' \
        -c 'CREATE SCHEMA public;'
    docker exec "$container" pg_restore --no-owner -U postgres -d relab_restore /tmp/relab.dump
    docker exec "$container" psql -U postgres -d relab_restore -v ON_ERROR_STOP=1 \
        -c 'SELECT 1;' \
        -c "SELECT to_regclass('public.alembic_version');"

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
