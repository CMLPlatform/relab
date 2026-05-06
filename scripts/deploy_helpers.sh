#!/usr/bin/env bash
# Shared shell helpers for root justfile deploy recipes.

DEPLOY_BACKUP_IMAGE="${DEPLOY_BACKUP_IMAGE:-relab-backups-smoke}"
DEPLOY_CREATED_DEV_ENV=false
DEPLOY_CREATED_ROOT_ENV=false

deploy_prepare_compose_validation_files() {
    if [[ ! -f backend/.env.dev && -f backend/.env.dev.example ]]; then
        cp backend/.env.dev.example backend/.env.dev
        DEPLOY_CREATED_DEV_ENV=true
    fi
    if [[ ! -f .env ]]; then
        : >.env
        DEPLOY_CREATED_ROOT_ENV=true
    fi

    export TUNNEL_TOKEN="${TUNNEL_TOKEN:-placeholder}"
    export LOKI_URL="${LOKI_URL:-http://placeholder/loki/api/v1/push}"
    export GOOGLE_OAUTH_CLIENT_ID="${GOOGLE_OAUTH_CLIENT_ID:-placeholder-google-client-id}"
    export GITHUB_OAUTH_CLIENT_ID="${GITHUB_OAUTH_CLIENT_ID:-placeholder-github-client-id}"
    export EMAIL_PROVIDER="${EMAIL_PROVIDER:-smtp}"
    export EMAIL_HOST="${EMAIL_HOST:-smtp.example.test}"
    export EMAIL_USERNAME="${EMAIL_USERNAME:-relab@example.test}"
    export EMAIL_FROM="${EMAIL_FROM:-Reverse Engineering Lab <relab@example.test>}"
    export EMAIL_REPLY_TO="${EMAIL_REPLY_TO:-relab@example.test}"
    export SUPERUSER_EMAIL="${SUPERUSER_EMAIL:-admin@example.test}"
}

deploy_cleanup_compose_validation_files() {
    [[ "$DEPLOY_CREATED_DEV_ENV" == true ]] && rm -f backend/.env.dev
    [[ "$DEPLOY_CREATED_ROOT_ENV" == true ]] && rm -f .env
    return 0
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
