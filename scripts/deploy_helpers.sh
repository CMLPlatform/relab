#!/usr/bin/env bash
# Shared shell helpers for root justfile deploy recipes.

DEPLOY_SECRET_MANIFEST="${DEPLOY_SECRET_MANIFEST:-deploy/required-secret-files.txt}"
DEPLOY_BACKUP_IMAGE="${DEPLOY_BACKUP_IMAGE:-relab-backups-smoke}"
DEPLOY_CREATED_PROD_ENV=false
DEPLOY_CREATED_STAGING_ENV=false
DEPLOY_CREATED_DEV_ENV=false
DEPLOY_CREATED_ROOT_ENV=false
DEPLOY_CREATED_SECRET_FILES=()

deploy_secret_files() {
    if [[ ! -f "$DEPLOY_SECRET_MANIFEST" ]]; then
        echo "Deploy secret manifest not found: $DEPLOY_SECRET_MANIFEST" >&2
        exit 1
    fi

    local line
    while IFS= read -r line; do
        line="${line%%#*}"
        line="${line//[[:space:]]/}"
        [[ -n "$line" ]] && printf '%s\n' "$line"
    done < "$DEPLOY_SECRET_MANIFEST"
}

deploy_prepare_compose_validation_files() {
    if [[ ! -f backend/.env.prod && -f backend/.env.prod.example ]]; then
        cp backend/.env.prod.example backend/.env.prod
        DEPLOY_CREATED_PROD_ENV=true
    fi
    if [[ ! -f backend/.env.staging && -f backend/.env.staging.example ]]; then
        cp backend/.env.staging.example backend/.env.staging
        DEPLOY_CREATED_STAGING_ENV=true
    fi
    if [[ ! -f backend/.env.dev && -f backend/.env.dev.example ]]; then
        cp backend/.env.dev.example backend/.env.dev
        DEPLOY_CREATED_DEV_ENV=true
    fi
    if [[ ! -f .env ]]; then
        : > .env
        DEPLOY_CREATED_ROOT_ENV=true
    fi

    local env name path
    for env in prod staging; do
        mkdir -p "secrets/$env"
        while IFS= read -r name; do
            path="secrets/$env/$name"
            if [[ ! -f "$path" ]]; then
                printf 'placeholder-%s-%s\n' "$env" "$name" > "$path"
                DEPLOY_CREATED_SECRET_FILES+=("$path")
            fi
        done < <(deploy_secret_files)
    done

    export TUNNEL_TOKEN="${TUNNEL_TOKEN:-placeholder}"
    export LOKI_URL="${LOKI_URL:-http://placeholder/loki/api/v1/push}"
}

deploy_cleanup_compose_validation_files() {
    [[ "$DEPLOY_CREATED_PROD_ENV" == true ]] && rm -f backend/.env.prod
    [[ "$DEPLOY_CREATED_STAGING_ENV" == true ]] && rm -f backend/.env.staging
    [[ "$DEPLOY_CREATED_DEV_ENV" == true ]] && rm -f backend/.env.dev
    [[ "$DEPLOY_CREATED_ROOT_ENV" == true ]] && rm -f .env

    local path
    for path in "${DEPLOY_CREATED_SECRET_FILES[@]}"; do
        rm -f "$path"
    done
    rmdir secrets/prod secrets/staging secrets 2>/dev/null || true
}

deploy_load_root_env_preserving() {
    local -a names=("$@")
    local -A saved=()
    local name

    for name in "${names[@]}"; do
        saved["$name"]="${!name:-}"
    done

    if [[ -f .env ]]; then
        set -a
        # shellcheck disable=SC1091
        source .env
        set +a
    fi

    for name in "${names[@]}"; do
        if [[ -n "${saved[$name]}" ]]; then
            printf -v "$name" '%s' "${saved[$name]}"
            export "${name?}"
        fi
    done
}

deploy_require_dir() {
    local description="$1"
    local path="$2"
    if [[ ! -d "$path" ]]; then
        echo "$description not found: $path" >&2
        exit 1
    fi
    realpath "$path"
}

deploy_require_file() {
    local description="$1"
    local path="$2"
    if [[ ! -f "$path" ]]; then
        echo "$description not found: $path" >&2
        exit 1
    fi
    realpath "$path"
}

deploy_resolve_backup_paths() {
    local env="$1"
    local repo="${BACKUP_DIR:-./backups}/restic"
    local secret="secrets/$env/restic_password"

    DEPLOY_RESTIC_REPOSITORY="$(deploy_require_dir "Restic repository" "$repo")"
    DEPLOY_RESTIC_PASSWORD_FILE="$(deploy_require_file "Restic password file" "$secret")"
    export DEPLOY_RESTIC_REPOSITORY DEPLOY_RESTIC_PASSWORD_FILE
}

deploy_build_backup_image() {
    docker build -f backend/Dockerfile.backups -t "$DEPLOY_BACKUP_IMAGE" backend
}
