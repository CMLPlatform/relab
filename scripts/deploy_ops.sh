#!/usr/bin/env bash
# Root deploy/Compose operations behind the public justfile recipes.
set -euo pipefail

PROD_COMPOSE_ENV="${PROD_COMPOSE_ENV:-deploy/env/prod.compose.env}"
STAGING_COMPOSE_ENV="${STAGING_COMPOSE_ENV:-deploy/env/staging.compose.env}"

write_validation_env_file() {
    uv run python scripts/env_policy.py validation-env "$1"
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

# Docker Compose gives exported shell variables precedence over every --env-file,
# so a stray `export ENVIRONMENT=staging` would run staging images under the prod
# project name. Scrub the names the env files own before invoking compose. Keep in
# sync with COMMITTED_DEPLOY_ENV_NAMES + REQUIRED_ROOT_OPERATOR_INPUT_NAMES in
# scripts/env_policy.py. MALWARE_SCAN_ENABLED is scrubbed too: the `up` guard reads it
# from .env, so an exported shell value must not reach the container and quietly turn
# scanning on without the clamav profile.
COMPOSE_SCRUBBED_ENV_NAMES=(
    ENVIRONMENT
    API_PUBLIC_URL
    APP_PUBLIC_URL
    SITE_PUBLIC_URL
    DOCS_PUBLIC_URL
    FEATURED_PRODUCT_ID
    CLOUDFLARE_TUNNEL_TOKEN
    EMAIL_PROVIDER
    EMAIL_FROM
    EMAIL_REPLY_TO
    BOOTSTRAP_SUPERUSER_EMAIL
    MALWARE_SCAN_ENABLED
)

compose_args() {
    local env="$1"
    local root_env_file="${2:-.env}"
    local compose_env

    compose_env="$(compose_env_file "$env")"

    local -a unset_flags=()
    local name
    for name in "${COMPOSE_SCRUBBED_ENV_NAMES[@]}"; do
        unset_flags+=(-u "$name")
    done

    printf '%s\n' env "${unset_flags[@]}" docker compose -p "relab_$env" --env-file "$root_env_file" --env-file "$compose_env" -f compose.yaml -f compose.deploy.yaml
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
        # Same command as above plus the loki overlay, which compose_args only
        # emits when the root .env sets LOKI_PUSH_URL. Built via compose_args so
        # the shell-env scrub applies here too.
        local -a base_args=()
        mapfile -t base_args < <(compose_args "$env" "$validation_env")
        "${base_args[@]}" -f compose.logging.loki.yaml config >/dev/null
    done
    local e2e_config="$tmp_root/e2e.json"
    docker compose -p relab_e2e -f compose.e2e.yaml config --format json >"$e2e_config"
    uv run python scripts/env_policy.py e2e-compose-check "$e2e_config"

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
    assert_secret_file_modes prod "$tmp_root/prod.json"
    assert_secret_file_modes staging "$tmp_root/staging.json"
    uv run python scripts/env_policy.py secrets-placeholder-check
    echo "✅ Deploy secret file paths match Compose"
}

# Privacy lives on the directory (0700), readability on the files (0644).
# Compose file-secrets are plain bind mounts that keep host permissions — the
# uid/gid/mode attributes are ignored — and deploy services run as uid 1001, so
# an operator-owned 0600 file is unreadable inside the container. A 0644 file in
# a 0700 directory is still unreachable to other host users.
# Only the names Compose actually mounts are checked, so operator notes kept
# beside them are left alone.
assert_secret_file_modes() {
    local env="$1"
    local config_json="$2"
    local dir="secrets/$env"
    local name path mode dir_mode failed=false

    [[ -d "$dir" ]] || return 0

    dir_mode="$(stat -c '%a' "$dir")"
    if [[ "$dir_mode" != "700" ]]; then
        echo "error: $dir has mode $dir_mode, expected 700" >&2
        echo "Fix with: chmod 700 $dir" >&2
        failed=true
    fi

    while IFS= read -r name; do
        [[ -n "$name" ]] || continue
        path="$dir/$name"
        [[ -f "$path" ]] || continue
        mode="$(stat -c '%a' "$path")"
        if ((8#$mode & 8#022)); then
            echo "error: $path is mode $mode — group/other-writable secrets are rejected" >&2
            echo "Fix with: chmod 644 $path" >&2
            failed=true
        elif ((8#$mode & 8#004 == 0)); then
            echo "error: $path is mode $mode — containers run as uid 1001 and cannot read it;" >&2
            echo "run: chmod 700 $dir && chmod 644 $dir/*" >&2
            failed=true
        fi
    done < <(uv run python scripts/env_policy.py secrets-list "$config_json")

    [[ "$failed" == "false" ]] || exit 2
}

deploy_secret_template_value() {
    local env="$1"
    local name="$2"

    # Every environment auto-generates what it can. Seeding prod/staging with
    # derivable placeholders left security-critical secrets (auth_token_secret,
    # oauth_state_secret) guessable from a public repo.
    case "$name" in
        data_encryption_key)
            python3 -c 'import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("="))'
            ;;
        rclone.conf)
            # An rclone remote is operator-supplied, so seed a commented placeholder: it is
            # non-empty (later runs keep it) and carries no `replace-me-` marker, which the
            # env policy would reject. rclone.conf is optional — the backup service only reads
            # it when RESTIC_OFFSITE_REPOSITORY names an `rclone:` target.
            printf '%s\n' \
                '# Placeholder. Replace with a real rclone config (rclone config) before' \
                '# setting RESTIC_OFFSITE_REPOSITORY to an rclone:<remote>:<path> target.' \
                '# Offsite copies stay disabled while this file holds only comments.'
            ;;
        *_oauth_client_secret | microsoft_graph_client_secret)
            # External identity credentials can't be auto-generated: a random
            # token just yields a silent 401 at runtime, and warn_on_placeholder_secrets
            # (backend/app/core/secrets.py) hard-crashes staging/prod on ANY
            # replace-me value, even for providers nobody configured. Empty is the
            # correct "not configured" value: optional-and-empty passes env_policy,
            # required-and-empty fails loudly, and the runtime accepts empty for
            # unused providers. Fill in by hand when the provider is actually used.
            printf ''
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
    # Global, like tmp_root: bash pops the function frame before the EXIT trap runs,
    # so a `local` here would be invisible to cleanup.
    tmp_secret=""
    cleanup() {
        rm -rf "$tmp_root"
        # A generator that fails mid-write leaves a partial 0600 secret next to the real
        # ones; drop it rather than let a later run mistake it for an operator file.
        if [[ -n "${tmp_secret:-}" ]]; then
            rm -f "$tmp_secret"
        fi
    }
    trap cleanup EXIT

    local validation_env="$tmp_root/validation.env"
    write_validation_env_file "$validation_env"

    if [[ "$env" == "dev" ]]; then
        COMPOSE_DISABLE_ENV_FILE=1 docker compose -p relab_dev -f compose.yaml -f compose.dev.yaml --profile migrations config --format json >"$tmp_root/$env.json"
    else
        render_compose_json "$env" "$validation_env" "$tmp_root/$env.json" backups migrations
    fi

    # Privacy is the directory's job (0700); the files themselves stay 0644 in
    # every env because containers read them as a non-owner uid (deploy services
    # run as 1001, dev's api/migrator as root-without-CAP_DAC_OVERRIDE/appuser)
    # and Compose file-secrets are bind mounts that keep host permissions.
    mkdir -p "secrets/$env"
    chmod 700 "secrets/$env"
    umask 077
    local name path
    while IFS= read -r name; do
        [[ -n "$name" ]] || continue
        path="secrets/$env/$name"
        # NOTE: generate into a sibling temp file and rename, so an interrupted run
        # never leaves a 0-byte secret that later runs would keep. Empty files from
        # older runs count as absent.
        if [[ ! -s "$path" ]]; then
            tmp_secret="$(mktemp "$path.XXXXXX")"
            deploy_secret_template_value "$env" "$name" >"$tmp_secret"
            mv "$tmp_secret" "$path"
            chmod 644 "$path"
            if [[ -s "$path" ]]; then
                echo "created $path"
            else
                # External identity credentials template empty (see deploy_secret_template_value):
                # a 0-byte file reads as "not configured" everywhere, so re-templating on every
                # run recreates it empty again rather than "keeping" it — expected, not a bug.
                echo "created $path (empty — fill in when using this provider)"
            fi
        else
            # Existing operator files keep their mode; deploy-secrets-check reports
            # any that containers cannot read.
            echo "kept $path"
        fi
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

    if [[ "${DEPLOY_CONFIRMED:-false}" == "true" || "${FORCE:-}" == "1" || "${FORCE:-}" == "true" || "${FORCE:-}" == "YES" ]]; then
        return 0
    fi
    echo "Refusing to $action without explicit confirmation."
    echo "Use '$example' or '$force_example'."
    exit 1
}

# Entry point for the justfile's `_require-confirm`, so the YES/FORCE rule above is
# the only copy in the repo.
require_confirmation_command() {
    local confirm="${4:-}"

    DEPLOY_CONFIRMED=false
    if [[ "$confirm" == "YES" ]]; then
        DEPLOY_CONFIRMED=true
    fi

    require_confirmation "$1" "$2" "$3"
}

stack_command() {
    local env="$1"
    local action="$2"
    shift 2

    # compose_env_file's exit 2 fires inside a process substitution, where it only
    # prints and lets the caller continue, so validate the env up front instead.
    case "$env" in
        prod | staging) ;;
        *)
            echo "error: env must be 'prod' or 'staging', got '$env'" >&2
            exit 2
            ;;
    esac

    case "$action" in
        up)
            parse_profiles "$env" "migrations backups scanning" "$@"
            # Backups are part of a healthy stack, so `up` defaults to them the way
            # `build` does; explicit profiles still win.
            if [[ "${#DEPLOY_PROFILE_FLAGS[@]}" -eq 0 ]]; then
                DEPLOY_PROFILE_FLAGS=(--profile backups)
            fi
            # NOTE: MALWARE_SCAN_ENABLED=true with no clamav container fails all uploads closed.
            # Read it the way Compose does: drop an inline ` # comment`, surrounding whitespace
            # and one matching pair of quotes, so `MALWARE_SCAN_ENABLED="false"  # off` agrees
            # with the value the container actually gets. The name is scrubbed from the shell
            # env before compose runs, so .env is the only source both sides read.
            local scan_enabled
            scan_enabled="$(grep -E '^MALWARE_SCAN_ENABLED=' .env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
            scan_enabled="${scan_enabled%%[[:space:]]#*}"
            scan_enabled="${scan_enabled#"${scan_enabled%%[![:space:]]*}"}"
            scan_enabled="${scan_enabled%"${scan_enabled##*[![:space:]]}"}"
            if [[ "$scan_enabled" == \"*\" || "$scan_enabled" == \'*\' ]]; then
                scan_enabled="${scan_enabled:1:-1}"
            fi
            if [[ "${scan_enabled:-true}" != "false" && " ${DEPLOY_PROFILE_FLAGS[*]} " != *" scanning "* ]]; then
                echo "error: MALWARE_SCAN_ENABLED is not 'false' but the 'scanning' profile is off." >&2
                echo "Pass the 'scanning' profile or set MALWARE_SCAN_ENABLED=false in .env." >&2
                exit 2
            fi
            require_confirmation "start the $env stack" "just $env-up YES [profiles...]" "FORCE=1 just $env-up [profiles...]"
            run_deploy_compose "$env" "${DEPLOY_PROFILE_FLAGS[@]}" up -d
            ;;
        down)
            parse_profiles "$env" "migrations backups scanning" "$@"
            require_confirmation "stop the $env stack" "just $env-down YES [profiles...]" "FORCE=1 just $env-down [profiles...]"
            run_deploy_compose "$env" "${DEPLOY_PROFILE_FLAGS[@]}" down --remove-orphans
            ;;
        build)
            parse_profiles "$env" "migrations backups scanning" "$@"
            if [[ "${#DEPLOY_PROFILE_FLAGS[@]}" -eq 0 ]]; then
                DEPLOY_PROFILE_FLAGS=(--profile migrations --profile backups)
            fi
            local -a no_cache=()
            if [[ "${NO_CACHE:-}" == "1" || "${NO_CACHE:-}" == "true" ]]; then
                no_cache=(--no-cache)
            fi
            run_deploy_compose "$env" "${DEPLOY_PROFILE_FLAGS[@]}" build "${no_cache[@]}"
            # Every build overwrites the single :$env-local tag, so also tag the result
            # with the current commit. Rollback is then a `docker tag` away instead of a
            # full rebuild (see deploy/CUTOVER.md §12).
            local sha image
            sha="$(git rev-parse --short HEAD 2>/dev/null || true)"
            if [[ -n "$sha" ]]; then
                while IFS= read -r image; do
                    [[ "$image" == relab-*:"$env-local" ]] || continue
                    docker tag "$image" "${image%-local}-$sha"
                done < <(run_deploy_compose "$env" "${DEPLOY_PROFILE_FLAGS[@]}" config --images | sort -u)
                echo "tagged built images with $env-$sha"
            fi
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
            # `up migrator` exits 0 even when the migration fails; `run --rm` propagates
            # the migrator's exit code.
            run_deploy_compose "$env" --profile migrations run --rm migrator
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
        require-confirm)
            require_confirmation_command "${2:-}" "${3:-}" "${4:-}" "${5:-}"
            ;;
        *)
            echo "Usage: $0 {compose-config|deploy-secrets-check|deploy-secrets-template ENV|stack ENV ACTION [ARGS...]|require-confirm ACTION EXAMPLE FORCE_EXAMPLE [YES]}" >&2
            echo "ENV for deploy-secrets-template must be dev, prod, or staging" >&2
            exit 2
            ;;
    esac
}

# Sourcing this file (scripts/deploy_watchdog.sh reuses run_deploy_compose) must not
# run a subcommand, so only dispatch when executed directly.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
