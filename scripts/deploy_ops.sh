#!/usr/bin/env bash
# Root deploy/Compose operations behind the public justfile recipes.
set -euo pipefail

PROD_COMPOSE_ENV="${PROD_COMPOSE_ENV:-deploy/env/prod.compose.env}"
STAGING_COMPOSE_ENV="${STAGING_COMPOSE_ENV:-deploy/env/staging.compose.env}"

loki_overlay_args() {
    if [[ -f .env ]] && grep -qE '^LOKI_URL=[^[:space:]]' .env; then
        printf '%s\n' -f compose.logging.loki.yaml
    fi
}

compose_args() {
    local env="$1"
    local compose_env

    case "$env" in
        prod) compose_env="$PROD_COMPOSE_ENV" ;;
        staging) compose_env="$STAGING_COMPOSE_ENV" ;;
        *) echo "env must be 'prod' or 'staging'" >&2; exit 2 ;;
    esac

    printf '%s\n' docker compose --env-file .env --env-file "$compose_env" -f compose.yaml -f compose.deploy.yaml
    loki_overlay_args
}

run_deploy_compose() {
    local env="$1"
    shift
    mapfile -t compose_command < <(compose_args "$env")
    "${compose_command[@]}" "$@"
}

render_compose_json() {
    local env="$1"
    local output_path="$2"
    shift 2

    local -a profile_flags=()
    local profile
    for profile in "$@"; do
        profile_flags+=(--profile "$profile")
    done

    run_deploy_compose "$env" "${profile_flags[@]}" config --format json > "$output_path"
}

compose_config() {
    source scripts/deploy_helpers.sh
    deploy_prepare_compose_validation_files
    trap deploy_cleanup_compose_validation_files EXIT

    docker compose -p relab_dev -f compose.yaml -f compose.dev.yaml config >/dev/null
    docker compose -p relab_test -f compose.yaml -f compose.ci.yaml config >/dev/null
    run_deploy_compose staging config >/dev/null
    run_deploy_compose prod config >/dev/null
    run_deploy_compose staging --profile backups --profile migrations config >/dev/null
    run_deploy_compose prod --profile backups --profile migrations config >/dev/null
    docker compose --env-file .env --env-file "$PROD_COMPOSE_ENV" \
        -f compose.yaml -f compose.deploy.yaml -f compose.logging.loki.yaml config >/dev/null
    docker compose --env-file .env --env-file "$STAGING_COMPOSE_ENV" \
        -f compose.yaml -f compose.deploy.yaml -f compose.logging.loki.yaml config >/dev/null
    docker compose -p relab_e2e -f compose.e2e.yaml config >/dev/null

    echo "✓ Compose configurations validated"
}

deploy_secrets_check() {
    source scripts/deploy_helpers.sh
    tmp_root="$(mktemp -d)"
    cleanup() {
        rm -rf "$tmp_root"
        deploy_cleanup_compose_validation_files
    }
    trap cleanup EXIT

    deploy_prepare_compose_validation_files
    render_compose_json prod "$tmp_root/prod.json" backups migrations
    render_compose_json staging "$tmp_root/staging.json" backups migrations
    python3 scripts/deploy_policy_check.py secrets \
        --manifest deploy/required-secret-files.txt \
        prod="$tmp_root/prod.json" \
        staging="$tmp_root/staging.json"
    echo "✓ Deploy secret manifest matches Compose"
}

deploy_secrets_template() {
    local env="${1:?env is required}"
    case "$env" in
        prod|staging) ;;
        *) echo "env must be 'prod' or 'staging'"; exit 1 ;;
    esac

    source scripts/deploy_helpers.sh
    mkdir -p "secrets/$env"
    local name path
    while IFS= read -r name; do
        path="secrets/$env/$name"
        if [[ ! -f "$path" ]]; then
            printf 'replace-me-%s-%s\n' "$env" "$name" > "$path"
            echo "created $path"
        else
            echo "kept $path"
        fi
        chmod 600 "$path"
    done < <(deploy_secret_files)
    echo "✓ Secret files are present under secrets/$env"
}

compose_policy_check() {
    source scripts/deploy_helpers.sh
    tmp_root="$(mktemp -d)"
    cleanup() {
        rm -rf "$tmp_root"
        deploy_cleanup_compose_validation_files
    }
    trap cleanup EXIT

    deploy_prepare_compose_validation_files
    docker compose -p relab_dev -f compose.yaml -f compose.dev.yaml config --format json > "$tmp_root/dev.json"
    docker compose -p relab_e2e -f compose.e2e.yaml config --format json > "$tmp_root/e2e.json"
    render_compose_json prod "$tmp_root/prod.json" backups migrations
    render_compose_json staging "$tmp_root/staging.json" backups migrations
    python3 scripts/deploy_policy_check.py compose \
        dev="$tmp_root/dev.json" \
        e2e="$tmp_root/e2e.json" \
        prod="$tmp_root/prod.json" \
        staging="$tmp_root/staging.json"
    echo "✓ Compose network policy validated"
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
            "" ) ;;
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
            deploy_secrets_check
            ;;
        deploy-secrets-template)
            deploy_secrets_template "${2:-}"
            ;;
        compose-policy-check)
            compose_policy_check
            ;;
        stack)
            stack_command "${2:-}" "${3:-}" "${@:4}"
            ;;
        *)
            echo "Usage: $0 {compose-config|deploy-secrets-check|deploy-secrets-template ENV|compose-policy-check|stack ENV ACTION [ARGS...]}" >&2
            exit 2
            ;;
    esac
}

main "$@"
