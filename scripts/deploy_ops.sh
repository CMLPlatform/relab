#!/usr/bin/env bash
# Root deploy/Compose operations behind the public justfile recipes.
set -euo pipefail

PROD_COMPOSE_ENV="${PROD_COMPOSE_ENV:-deploy/env/prod.compose.env}"
STAGING_COMPOSE_ENV="${STAGING_COMPOSE_ENV:-deploy/env/staging.compose.env}"

write_validation_env_file() {
    local path="$1"
    cat >"$path" <<'EOF'
CLOUDFLARE_TUNNEL_TOKEN=placeholder
LOKI_PUSH_URL=http://placeholder/loki/api/v1/push
GOOGLE_OAUTH_CLIENT_ID=placeholder-google-client-id
GITHUB_OAUTH_CLIENT_ID=placeholder-github-client-id
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.test
SMTP_USERNAME=relab@example.test
EMAIL_FROM=Reverse Engineering Lab <relab@example.test>
EMAIL_REPLY_TO=relab@example.test
BOOTSTRAP_SUPERUSER_EMAIL=admin@example.test
EOF
}

loki_overlay_args() {
    local root_env_file="${1:-.env}"
    if [[ -f "$root_env_file" ]] && grep -qE '^LOKI_PUSH_URL=[^[:space:]]' "$root_env_file"; then
        printf '%s\n' -f compose.logging.loki.yaml
    fi
}

host_overlay_args() {
    if [[ -f compose.host.yaml ]]; then
        printf '%s\n' -f compose.host.yaml
    fi
}

compose_env_file() {
    local env="$1"
    case "$env" in
        prod) printf '%s\n' "$PROD_COMPOSE_ENV" ;;
        staging) printf '%s\n' "$STAGING_COMPOSE_ENV" ;;
        *)
            echo "env must be 'prod' or 'staging'" >&2
            exit 2
            ;;
    esac
}

compose_args() {
    local env="$1"
    local root_env_file="${2:-.env}"
    local compose_env

    compose_env="$(compose_env_file "$env")"

    printf '%s\n' docker compose -p "relab_$env" --env-file "$root_env_file" --env-file "$compose_env" -f compose.yaml -f compose.deploy.yaml
    loki_overlay_args "$root_env_file"
    host_overlay_args
}

run_deploy_compose() {
    local env="$1"
    shift
    mapfile -t compose_command < <(compose_args "$env")
    "${compose_command[@]}" "$@"
}

run_validation_deploy_compose() {
    local env="$1"
    local root_env_file="$2"
    shift 2
    mapfile -t compose_command < <(compose_args "$env" "$root_env_file")
    "${compose_command[@]}" "$@"
}

render_compose_json() {
    local env="$1"
    local root_env_file="$2"
    local output_path="$3"
    shift 3

    local -a profile_flags=()
    local profile
    for profile in "$@"; do
        profile_flags+=(--profile "$profile")
    done

    run_validation_deploy_compose "$env" "$root_env_file" "${profile_flags[@]}" config --format json >"$output_path"
}

compose_config() {
    tmp_root="$(mktemp -d)"
    cleanup() {
        rm -rf "$tmp_root"
    }
    trap cleanup EXIT
    local validation_env="$tmp_root/validation.env"
    write_validation_env_file "$validation_env"

    local env
    COMPOSE_DISABLE_ENV_FILE=1 docker compose -p relab_dev -f compose.yaml -f compose.dev.yaml config >/dev/null
    docker compose -p relab_test -f compose.yaml -f compose.ci.yaml config >/dev/null
    for env in staging prod; do
        run_validation_deploy_compose "$env" "$validation_env" config >/dev/null
        run_validation_deploy_compose "$env" "$validation_env" --profile backups --profile migrations config >/dev/null
        local -a host_args=()
        mapfile -t host_args < <(host_overlay_args)
        docker compose -p "relab_$env" --env-file "$validation_env" --env-file "$(compose_env_file "$env")" \
            -f compose.yaml -f compose.deploy.yaml -f compose.logging.loki.yaml "${host_args[@]}" config >/dev/null
    done
    docker compose -p relab_e2e -f compose.e2e.yaml config >/dev/null

    echo "✅ Compose configurations validated"
}

validate_deploy_secret_paths() {
    tmp_root="$(mktemp -d)"
    cleanup() {
        rm -rf "$tmp_root"
    }
    trap cleanup EXIT

    local validation_env="$tmp_root/validation.env"
    write_validation_env_file "$validation_env"
    COMPOSE_DISABLE_ENV_FILE=1 docker compose -p relab_dev -f compose.yaml -f compose.dev.yaml --profile migrations config --format json >"$tmp_root/dev.json"
    render_compose_json prod "$validation_env" "$tmp_root/prod.json" backups migrations
    render_compose_json staging "$validation_env" "$tmp_root/staging.json" backups migrations
    uv run python scripts/env_policy.py secrets-check \
        dev="$tmp_root/dev.json" \
        prod="$tmp_root/prod.json" \
        staging="$tmp_root/staging.json"
    echo "✅ Deploy secret file paths match Compose"
}

deploy_secret_template_value() {
    local env="$1"
    local name="$2"

    if [[ "$env" != "dev" ]]; then
        printf 'replace-me-%s-%s\n' "$env" "$name"
        return
    fi

    case "$name" in
        data_encryption_key)
            python3 -c 'import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("="))'
            ;;
        *)
            python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
            ;;
    esac
}

deploy_secrets_template() {
    local env="${1:?env is required}"
    case "$env" in
        dev | prod | staging) ;;
        *)
            echo "env must be 'dev', 'prod', or 'staging'"
            exit 1
            ;;
    esac

    tmp_root="$(mktemp -d)"
    cleanup() {
        rm -rf "$tmp_root"
    }
    trap cleanup EXIT

    local validation_env="$tmp_root/validation.env"
    write_validation_env_file "$validation_env"

    if [[ "$env" == "dev" ]]; then
        COMPOSE_DISABLE_ENV_FILE=1 docker compose -p relab_dev -f compose.yaml -f compose.dev.yaml --profile migrations config --format json >"$tmp_root/$env.json"
    else
        render_compose_json "$env" "$validation_env" "$tmp_root/$env.json" backups migrations
    fi

    mkdir -p "secrets/$env"
    umask 077
    local name path
    while IFS= read -r name; do
        [[ -n "$name" ]] || continue
        path="secrets/$env/$name"
        if [[ ! -f "$path" ]]; then
            deploy_secret_template_value "$env" "$name" >"$path"
            echo "created $path"
        else
            echo "kept $path"
        fi
        chmod 600 "$path"
    done < <(uv run python scripts/env_policy.py secrets-list "$tmp_root/$env.json")
    echo "✅ Secret files are present under secrets/$env"
}

parse_profiles() {
    local stack="$1"
    local allowed_profiles="$2"
    shift 2

    DEPLOY_CONFIRMED=false
    DEPLOY_PROFILE_FLAGS=()

    local profile
    for profile in "$@"; do
        case "$profile" in
            "") ;;
            YES) DEPLOY_CONFIRMED=true ;;
            *)
                if [[ " $allowed_profiles " == *" $profile "* ]]; then
                    DEPLOY_PROFILE_FLAGS+=(--profile "$profile")
                else
                    echo "Unknown profile '$profile' for the $stack stack."
                    echo "Allowed profiles: $allowed_profiles"
                    exit 1
                fi
                ;;
        esac
    done
}

require_confirmation() {
    local action="$1"
    local example="$2"
    local force_example="$3"

    if [[ "$DEPLOY_CONFIRMED" == "true" || "${FORCE:-}" == "1" || "${FORCE:-}" == "true" || "${FORCE:-}" == "YES" ]]; then
        return 0
    fi
    echo "Refusing to $action without explicit confirmation."
    echo "Use '$example' or '$force_example'."
    exit 1
}

stack_command() {
    local env="$1"
    local action="$2"
    shift 2

    case "$action" in
        up)
            parse_profiles "$env" "migrations backups" "$@"
            require_confirmation "start the $env stack" "just $env-up YES [profiles...]" "FORCE=1 just $env-up [profiles...]"
            run_deploy_compose "$env" "${DEPLOY_PROFILE_FLAGS[@]}" up -d
            ;;
        down)
            parse_profiles "$env" "migrations backups" "$@"
            require_confirmation "stop the $env stack" "just $env-down YES [profiles...]" "FORCE=1 just $env-down [profiles...]"
            run_deploy_compose "$env" "${DEPLOY_PROFILE_FLAGS[@]}" down
            ;;
        build)
            parse_profiles "$env" "migrations backups" "$@"
            if [[ "${#DEPLOY_PROFILE_FLAGS[@]}" -eq 0 ]]; then
                DEPLOY_PROFILE_FLAGS=(--profile migrations --profile backups)
            fi
            local -a no_cache=()
            if [[ "${NO_CACHE:-}" == "1" || "${NO_CACHE:-}" == "true" ]]; then
                no_cache=(--no-cache)
            fi
            run_deploy_compose "$env" "${DEPLOY_PROFILE_FLAGS[@]}" build "${no_cache[@]}"
            ;;
        logs)
            run_deploy_compose "$env" logs -f
            ;;
        migrate)
            DEPLOY_CONFIRMED=false
            if [[ "${1:-}" == "YES" ]]; then
                DEPLOY_CONFIRMED=true
            fi
            require_confirmation "run $env database migrations" "just $env-migrate YES" "FORCE=1 just $env-migrate"
            run_deploy_compose "$env" --profile migrations up migrator
            ;;
        *)
            echo "Unknown stack action '$action'" >&2
            exit 2
            ;;
    esac
}

main() {
    case "${1:-}" in
        compose-config)
            compose_config
            ;;
        deploy-secrets-check)
            validate_deploy_secret_paths
            ;;
        deploy-secrets-template)
            deploy_secrets_template "${2:-}"
            ;;
        stack)
            stack_command "${2:-}" "${3:-}" "${@:4}"
            ;;
        *)
            echo "Usage: $0 {compose-config|deploy-secrets-check|deploy-secrets-template ENV|stack ENV ACTION [ARGS...]}" >&2
            echo "ENV for deploy-secrets-template must be dev, prod, or staging" >&2
            exit 2
            ;;
    esac
}

main "$@"
