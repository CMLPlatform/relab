#!/usr/bin/env bash
# Root deploy/Compose operations behind the public justfile recipes.
set -euo pipefail

write_validation_env_file() {
    uv run python scripts/env_policy.py validation-env "$1"
}

telemetry_overlay_args() {
    local root_env_file="${1:-.env}"
    # Gated on the same variable that turns on the API's own exporter, so container
    # stdout and application telemetry are never half-enabled with respect to each other.
    # The value must start with http: an empty `OTEL_EXPORTER_OTLP_ENDPOINT=` or a
    # quoted-empty value would otherwise pull in the overlay, whose `:?` guards then
    # abort every compose command on the host.
    if [[ -f "$root_env_file" ]] && grep -qE '^OTEL_EXPORTER_OTLP_ENDPOINT=["'\'']?http' "$root_env_file"; then
        printf '%s\n' -f compose.telemetry.yml

        # GPU collection is a second opt-in, nested because the exporter is only useful
        # when something scrapes it. A card is a property of the host, not of the
        # environment. Truthy values only: on a host without the NVIDIA runtime,
        # including the overlay makes `up` abort with "could not select device driver".
        if grep -qiE '^GPU_METRICS=["'\'']?(1|true|yes)["'\'']?[[:space:]]*(#.*)?$' "$root_env_file"; then
            printf '%s\n' -f compose.telemetry.gpu.yml
        fi
    fi
}

host_overlay_args() {
    if [[ -f compose.host.yaml ]]; then
        printf '%s\n' -f compose.host.yaml
    fi
}

# Docker Compose gives exported shell variables precedence over --env-file, so a
# stray `export API_PUBLIC_URL=...` would beat the host's .env. Scrub the names the
# .env owns before invoking compose. Keep in sync with REQUIRED_ROOT_OPERATOR_INPUT_NAMES
# in scripts/env_policy.py, plus the telemetry names below. MALWARE_SCAN_ENABLED is scrubbed
# too: the `scanning` profile is derived from the .env value, so the container must read
# the same source.
COMPOSE_SCRUBBED_ENV_NAMES=(
    PROJECT
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
    # The telemetry trio. An endpoint rename was once undone by a shell that had
    # sourced the pre-rename .env: compose preferred the exported value, so down/up
    # recreated the agent pointing at the dead hostname. These are
    # OPTIONAL_ROOT_OPERATOR_INPUT_NAMES in env_policy.py; the file is their only source.
    OTEL_EXPORTER_OTLP_ENDPOINT
    OTEL_EXPORTER_OTLP_PROTOCOL
    OTLP_AUTH_TOKEN
    TELEMETRY_EDGE_KEY
)

compose_args() {
    local env="$1"
    local root_env_file="${2:-.env}"

    local -a unset_flags=()
    local name
    for name in "${COMPOSE_SCRUBBED_ENV_NAMES[@]}"; do
        unset_flags+=(-u "$name")
    done

    # The recipe's environment, not the .env's, selects images and secrets; the .env
    # ENVIRONMENT only guards the recipe (require_dotenv_environment).
    printf '%s\n' env "${unset_flags[@]}" PROJECT=relab "ENVIRONMENT=$env" docker compose -p "relab_$env" --env-file "$root_env_file" -f compose.yaml -f compose.deploy.yaml
    telemetry_overlay_args "$root_env_file"
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
        # compose_args already emits the telemetry overlay here: the validation env sets
        # OTEL_EXPORTER_OTLP_ENDPOINT, and naming the file a second time makes compose
        # reject the render (duplicate list items in the merged service). Only the GPU
        # overlay needs adding explicitly: GPU_METRICS is host-specific and absent from
        # the validation env.
        local -a base_args=()
        mapfile -t base_args < <(compose_args "$env" "$validation_env")
        "${base_args[@]}" -f compose.telemetry.gpu.yml config >/dev/null
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
# uid/gid/mode attributes are ignored — and deploy services run as uid 65532, so
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
            echo "error: $path is mode $mode — containers run as uid 65532 and cannot read it;" >&2
            echo "run: chmod 700 $dir && chmod 644 $dir/*" >&2
            failed=true
        fi
    done < <(uv run python scripts/env_policy.py secrets-list "$config_json")

    [[ "$failed" == "false" ]] || exit 2
}

# Secrets read by local tooling rather than mounted into a container, so they never appear
# in the rendered Compose config that secrets-list enumerates. They still belong under
# secrets/<env>/: secrets-export globs the directory, so these reach the password manager
# and come back through secrets-restore like everything else.
#
# Regenerating dataset_pseudonym_salt on a fresh checkout changes every contributor code
# in a future dataset release. The release build compares the salt against
# PINNED_SALT_FINGERPRINT and aborts on a mismatch, so templating it is safe.
LOCAL_ONLY_SECRETS=(dataset_pseudonym_salt)

deploy_secret_template_value() {
    local env="$1"
    local name="$2"

    # Every environment auto-generates what it can. Derivable placeholders in
    # prod/staging left auth_token_secret and oauth_state_secret guessable from a
    # public repo.
    case "$name" in
        data_encryption_key)
            python3 -c 'import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("="))'
            ;;
        rclone.conf)
            # An rclone remote is operator-supplied, so seed a commented placeholder: it is
            # non-empty (later runs keep it) and carries no `replace-me-` marker, which the
            # env policy would reject. With no remote defined, offsite copies stay off.
            printf '%s\n' \
                '# Placeholder. Replace with a real rclone config defining ONE remote; the' \
                '# backup copies to rclone:<that remote>: (empty path). Offsite copies stay' \
                '# disabled while this file holds only comments.'
            ;;
        *_oauth_client_secret | microsoft_graph_client_secret)
            # External identity credentials cannot be auto-generated: a random token
            # yields a silent 401 at runtime, and warn_on_placeholder_secrets
            # (backend/app/core/secrets.py) crashes staging/prod on any replace-me
            # value, including providers nobody configured. Empty means "not
            # configured": optional-and-empty passes env_policy, required-and-empty
            # fails loudly, and the runtime accepts empty for unused providers.
            # Fill in by hand when the provider is used.
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
    # run as 65532, dev's api/migrator as root-without-CAP_DAC_OVERRIDE/appuser)
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
    done < <(
        uv run python scripts/env_policy.py secrets-list "$tmp_root/$env.json"
        printf '%s\n' "${LOCAL_ONLY_SECRETS[@]}"
    )
    echo "✅ Secret files are present under secrets/$env"
}

deploy_secrets_export() {
    local env="${1:?env is required}"
    case "$env" in
        dev | prod | staging) ;;
        *)
            echo "env must be 'dev', 'prod', or 'staging'" >&2
            exit 1
            ;;
    esac

    local dir="secrets/$env"
    [[ -d "$dir" ]] || {
        echo "error: $dir does not exist" >&2
        exit 1
    }

    echo "# relab $env secrets — exported $(date -I)"
    echo "# Restore with: just secrets-restore $env <file>"
    echo "# This recreates secrets/$env/ (dir mode 700, files mode 644) from this block."
    echo "# Treat this note as a live credential; store it only in the password manager."

    local path name value
    while IFS= read -r -d '' path; do
        name="$(basename "$path")"
        [[ "$name" == "rclone.conf" ]] && continue
        [[ "$name" == *.md ]] && continue
        value="$(cat "$path")"
        if [[ "$value" == *$'\n'* ]]; then
            echo "error: $path has a multi-line value; only rclone.conf may span multiple lines" >&2
            exit 1
        fi
        echo "$name=$value"
    done < <(find "$dir" -maxdepth 1 -type f -print0 | sort -z)

    local rclone_path="$dir/rclone.conf"
    if [[ -s "$rclone_path" ]]; then
        echo "# ---- rclone.conf (verbatim) ----"
        cat "$rclone_path"
    fi
}

deploy_secrets_restore() {
    local env="${1:?env is required}"
    local file="${2:?file is required}"
    case "$env" in
        dev | prod | staging) ;;
        *)
            echo "env must be 'dev', 'prod', or 'staging'" >&2
            exit 1
            ;;
    esac
    [[ -f "$file" ]] || {
        echo "error: $file does not exist" >&2
        exit 1
    }

    local dir="secrets/$env"
    mkdir -p "$dir"
    chmod 700 "$dir"

    local marker_line
    marker_line="$(grep -n -F -x -- '# ---- rclone.conf (verbatim) ----' "$file" | head -1 | cut -d: -f1 || true)"

    local kv_source
    if [[ -n "$marker_line" ]]; then
        kv_source="$(head -n "$((marker_line - 1))" "$file")"
    else
        kv_source="$(cat "$file")"
    fi

    local line k v path
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        [[ "$line" == \#* ]] && continue
        IFS='=' read -r k v <<<"$line"
        if [[ -z "$k" || "$k" == *"/"* || "$k" == "." || "$k" == ".." ]]; then
            echo "error: refusing to restore invalid secret key '$k'" >&2
            exit 1
        fi
        path="$dir/$k"
        if [[ -e "$path" ]]; then
            echo "overwrote $path"
        else
            echo "created $path"
        fi
        if [[ -z "$v" ]]; then
            : >"$path"
        else
            printf '%s\n' "$v" >"$path"
        fi
        chmod 644 "$path"
    done <<<"$kv_source"

    if [[ -n "$marker_line" ]]; then
        path="$dir/rclone.conf"
        if [[ -e "$path" ]]; then
            echo "overwrote $path"
        else
            echo "created $path"
        fi
        tail -n +"$((marker_line + 1))" "$file" >"$path"
        chmod 644 "$path"
    fi

    echo "Run 'just deploy-secrets-check' to verify."
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

# Read one KEY=value from the root .env the way Compose does: last assignment wins,
# an inline ` # comment`, surrounding whitespace and one matching pair of quotes are
# dropped. An unbalanced quote yields the raw text, which no caller treats as valid.
dotenv_value() {
    local value
    value="$(grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
    value="${value%%[[:space:]]#*}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "${#value}" -ge 2 && ("$value" == \"*\" || "$value" == \'*\') ]]; then
        value="${value:1:-1}"
    fi
    printf '%s' "$value"
}

# MALWARE_SCAN_ENABLED=true with no clamav container fails every upload closed, so the
# `scanning` profile follows the .env value instead of being passed by hand. Anything
# but an explicit `false` (missing file, empty, unbalanced quote) enables scanning.
scanning_enabled() {
    local value
    value="$(dotenv_value MALWARE_SCAN_ENABLED)"
    [[ "${value:-true}" != "false" ]]
}

add_scanning_profile_from_dotenv() {
    if scanning_enabled && [[ " ${DEPLOY_PROFILE_FLAGS[*]} " != *" scanning "* ]]; then
        DEPLOY_PROFILE_FLAGS+=(--profile scanning)
    fi
}

# One host serves one environment: the root .env carries the public URLs and the
# offsite repository for exactly one stack, so a recipe for the other one must not run.
require_dotenv_environment() {
    local env="$1" host_env
    # dotenv_value cannot tell "no such key" from "cannot read the file": its grep
    # discards both the error and the exit status, so an unreadable .env reports an
    # empty ENVIRONMENT and the mismatch below blames the config instead of the
    # permissions. Deploy .env files are readable only by the deploy user, so this is
    # what a recipe run under the wrong account hits first.
    if [[ -e .env && ! -r .env ]]; then
        echo "error: .env exists but is not readable by $(id -un); run this as the user that owns the deploy checkout." >&2
        exit 2
    fi
    host_env="$(dotenv_value ENVIRONMENT)"
    if [[ "$host_env" != "$env" ]]; then
        echo "error: this host's .env sets ENVIRONMENT='${host_env}', but the recipe targets '$env'." >&2
        exit 2
    fi
}

require_short_sha() {
    if [[ ! "$1" =~ ^[0-9a-f]{7,40}$ ]]; then
        echo "error: expected a commit sha (7-40 hex characters), got '$1'" >&2
        exit 2
    fi
}

# Every image the stack builds (all profiles), one name per line without the tag.
stack_images() {
    run_deploy_compose "$1" --profile migrations --profile backups config --images | sort -u \
        | sed -n "s/:$1-local\$//p" | grep '^relab-'
}

# Sha tags outlive their usefulness after a few releases and, untagged, nothing
# removes them. Keep the newest KEEP_SHA_TAGS per image (by image creation time).
KEEP_SHA_TAGS="${KEEP_SHA_TAGS:-5}"
prune_sha_tags() {
    local image="$1" env="$2" current="$3" tag
    while IFS= read -r tag; do
        [[ "$tag" == "$env-$current" ]] && continue
        docker image rm "$image:$tag" >/dev/null
    done < <(docker images "$image" --format '{{.CreatedAt}}\t{{.Tag}}' | grep -E "\s$env-[0-9a-f]{7,40}$" \
        | sort -r | tail -n "+$((KEEP_SHA_TAGS + 1))" | cut -f2)
}

# Fail unless every stack image carries the `<env>-<sha>` tag a previous `build` left,
# so a rollback never mixes two releases.
require_rollback_images() {
    local env="$1" sha="$2" image missing=0
    for image in "${@:3}"; do
        if ! docker image inspect "$image:$env-$sha" >/dev/null 2>&1; then
            echo "error: no image $image:$env-$sha; \`docker images '$image'\` lists the shas available" >&2
            missing=1
        fi
    done
    [[ "$missing" -eq 0 ]] || exit 2
}

# The uid every deploy service runs as. Keep in step with x-app-user in
# compose.deploy.yaml and APP_UID in backend/Dockerfile and backend/Dockerfile.backups.
DEPLOY_APP_UID=65532

# Turn one mount probe into the operator's next step. Split from the probe below so the
# wording and the remedy are covered by scripts/test_ops.sh, which starts no containers.
mount_writability_alert() {
    local env="$1" service="$2" path="$3" target="$4" writable="$5"

    [[ "$writable" == "yes" ]] && return 0

    echo "error: the $env stack's $service service cannot write $path as uid $DEPLOY_APP_UID." >&2
    case "$target" in
        volume:*)
            echo "Docker sets a named volume's ownership only when it first creates the volume, so" >&2
            echo "relab_${env}_${target#volume:} still belongs to whichever uid created it." >&2
            echo "Fix with: docker run --rm --user 0 -v relab_${env}_${target#volume:}:/mnt" \
                "relab-backend:$env-local chown -R $DEPLOY_APP_UID:$DEPLOY_APP_UID /mnt" >&2
            ;;
        host:*)
            echo "Docker creates a missing bind-mount directory root-owned." >&2
            echo "Fix with: sudo chown -R $DEPLOY_APP_UID:$DEPLOY_APP_UID ${target#host:}" >&2
            ;;
    esac
    return 1
}

# Every mount the stack writes to, probed as the service that writes it, before anything
# starts. A container gets no supplementary groups, so an ownership mismatch is not a
# degraded mode: `stat` and reads keep succeeding and every write fails EACCES. Nothing
# downstream would report it — `/live` never touches uploads and the migrator's backfills
# are wrapped in `|| echo` — so the deploy would report success and uploads would fail one
# at a time afterwards.
assert_deploy_mounts_writable() {
    local env="$1" backup_dir failed=0 entry service path target writable
    backup_dir="$(dotenv_value BACKUP_HOST_DIR)"
    local -a mounts=(
        "api /opt/relab/backend/data/uploads volume:user_uploads"
        "backup /var/cache/restic volume:restic_cache"
        "backup /restic host:${backup_dir:-./backups}/restic"
    )

    for entry in "${mounts[@]}"; do
        read -r service path target <<<"$entry"
        # shellcheck disable=SC2016 # $1 is the probe shell's own argument, not this shell's
        if run_deploy_compose "$env" --profile backups run --rm --no-deps -T \
            --entrypoint sh "$service" -c 'test -w "$1"' _ "$path" >/dev/null; then
            writable=yes
        else
            writable=no
        fi
        mount_writability_alert "$env" "$service" "$path" "$target" "$writable" || failed=1
    done

    [[ "$failed" -eq 0 ]] || exit 2
}

stack_command() {
    local env="$1"
    local action="$2"
    shift 2

    case "$env" in
        prod | staging) ;;
        *)
            echo "error: env must be 'prod' or 'staging', got '$env'" >&2
            exit 2
            ;;
    esac
    require_dotenv_environment "$env"

    case "$action" in
        up)
            parse_profiles "$env" "migrations backups scanning" "$@"
            # Root env policy, on the host, before anything starts. The vendored
            # telemetry overlay cannot require TELEMETRY_EDGE_KEY, because only projects
            # behind a WAF need it. Relab is behind one, and an empty key means the
            # Cloudflare skip rule stops matching and every export is bot-challenged
            # silently. scripts/env_policy.py owns that pairing.
            uv run python scripts/env_policy.py check --env "$env"
            # `up` does not start backups: the backup service is a one-shot driven
            # by a systemd timer (deploy/systemd/), not a long-running container.
            # `build` still defaults to the backups profile so the image exists.
            add_scanning_profile_from_dotenv
            require_confirmation "start the $env stack" "just stack $env up YES [profiles...]" "FORCE=1 just stack $env up [profiles...]"
            # Before the API starts, so a mount the containers cannot write stops the
            # deploy here rather than surfacing later as uploads and backups that fail
            # silently. On a host that has never run the stack this also creates the named
            # volumes, seeded from the images, which is what makes them writable.
            assert_deploy_mounts_writable "$env"
            # Provision before anything else starts. initdb only runs the script on an
            # empty volume; running it here on every start makes a populated volume
            # (prod's predates the roles) or a restored one converge without a runbook
            # step, and the migrator never runs before the objects it needs exist.
            run_deploy_compose "$env" up -d --wait postgres
            run_deploy_compose "$env" exec -T postgres bash /docker-entrypoint-initdb.d/provision.sh >/dev/null
            run_deploy_compose "$env" "${DEPLOY_PROFILE_FLAGS[@]}" up -d
            ;;
        backup)
            # One backup cycle, foreground, for the systemd timer. --no-deps: the
            # timer must not start postgres as a side effect; if the stack is down
            # the run fails and systemd records it, which is the correct signal.
            # --name is required: the container is a child of dockerd, not of the
            # systemd unit, so the unit's ExecStopPost needs a stable name to reap it
            # if systemd kills the run on timeout.
            # A host crash or dockerd death can skip ExecStopPost and leave the previous
            # run's container holding the name, which would then block every later run.
            # Same guard verify_postgres_restore uses for its deterministic name.
            docker rm -f "relab-backup-$env" >/dev/null 2>&1 || true
            # BACKUP_MANUAL tags this run's snapshots `manual`, which retention keeps
            # unconditionally. Set by `just backup <env> manual`, never by the timer.
            run_deploy_compose "$env" --profile backups run --rm --no-deps -T \
                -e "BACKUP_MANUAL=${BACKUP_MANUAL:-false}" \
                -e "BACKUP_MAINTENANCE=${BACKUP_MAINTENANCE:-auto}" \
                --name "relab-backup-$env" backup
            ;;
        backup-maintenance)
            # Retention, integrity check and offsite copy, without taking a snapshot.
            # The hourly backup timer skips all three; this is where they happen.
            docker rm -f "relab-backup-maintenance-$env" >/dev/null 2>&1 || true
            run_deploy_compose "$env" --profile backups run --rm --no-deps -T \
                -e "BACKUP_MAINTENANCE=only" \
                --name "relab-backup-maintenance-$env" backup
            ;;
        down)
            parse_profiles "$env" "migrations backups scanning" "$@"
            add_scanning_profile_from_dotenv
            require_confirmation "stop the $env stack" "just stack $env down YES [profiles...]" "FORCE=1 just stack $env down [profiles...]"
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
            # with the current commit; `rollback` retags from those. Tag every stack
            # image, not only the profiles built now, so the set is always complete.
            local sha image
            sha="$(git rev-parse --short HEAD 2>/dev/null || true)"
            if [[ -n "$sha" ]]; then
                for image in $(stack_images "$env"); do
                    docker image inspect "$image:$env-local" >/dev/null 2>&1 || continue
                    docker tag "$image:$env-local" "$image:$env-$sha"
                    prune_sha_tags "$image" "$env" "$sha"
                done
                echo "tagged built images with $env-$sha (keeping the newest $KEEP_SHA_TAGS)"
            fi
            ;;
        logs)
            # Follows by default; extra arguments replace -f (remote_deploy.sh passes
            # --since/--tail because a forced ssh command has no pty to interrupt).
            if (($# > 0)); then
                run_deploy_compose "$env" logs "$@"
            else
                run_deploy_compose "$env" logs -f
            fi
            ;;
        ps)
            run_deploy_compose "$env" ps --format 'table {{.Service}}\t{{.Status}}\t{{.Image}}'
            ;;
        rollback)
            # `just stack <env> rollback YES <sha> [<revision>]`: retag the images a previous
            # `build` tagged with its commit, optionally after `alembic downgrade`.
            local sha="${2:-}" revision="${3:-}"
            require_short_sha "$sha"
            # Not a process substitution: an `exit` inside one only ends the subshell.
            local -a images=()
            mapfile -t images <<<"$(stack_images "$env")"
            [[ "${#images[@]}" -gt 0 && -n "${images[0]}" ]] || {
                echo "error: could not list the $env stack images" >&2
                exit 2
            }
            require_rollback_images "$env" "$sha" "${images[@]}"
            require_confirmation_command "roll the $env stack back to $sha" "just stack $env rollback YES $sha" "FORCE=1 just stack $env rollback _ $sha" "${1:-}"
            if [[ -n "$revision" ]]; then
                # Both steps use the CURRENT migrator image: only the code being rolled
                # back knows how to downgrade its own migrations.
                run_deploy_compose "$env" --profile migrations run --rm --entrypoint python \
                    migrator -m scripts.maintenance.downgrade_safety "$revision"
                run_deploy_compose "$env" stop api
                run_deploy_compose "$env" --profile migrations run --rm --entrypoint alembic migrator downgrade "$revision"
            fi
            local image
            for image in "${images[@]}"; do
                docker tag "$image:$env-$sha" "$image:$env-local"
            done
            add_scanning_profile_from_dotenv
            run_deploy_compose "$env" "${DEPLOY_PROFILE_FLAGS[@]}" up -d
            ;;
        migrate)
            DEPLOY_CONFIRMED=false
            if [[ "${1:-}" == "YES" ]]; then
                DEPLOY_CONFIRMED=true
            fi
            require_confirmation "run $env database migrations" "just stack $env migrate YES" "FORCE=1 just stack $env migrate"
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
        secrets-export)
            deploy_secrets_export "${2:-}"
            ;;
        secrets-restore)
            deploy_secrets_restore "${2:-}" "${3:-}"
            ;;
        stack)
            stack_command "${2:-}" "${3:-}" "${@:4}"
            ;;
        require-confirm)
            require_confirmation_command "${2:-}" "${3:-}" "${4:-}" "${5:-}"
            ;;
        *)
            echo "Usage: $0 {compose-config|deploy-secrets-check|deploy-secrets-template ENV|secrets-export ENV|secrets-restore ENV FILE|stack ENV ACTION [ARGS...]|require-confirm ACTION EXAMPLE FORCE_EXAMPLE [YES]}" >&2
            echo "ENV for deploy-secrets-template/secrets-export/secrets-restore must be dev, prod, or staging" >&2
            exit 2
            ;;
    esac
}

# Sourcing this file (scripts/deploy_watchdog.sh reuses run_deploy_compose) must not
# run a subcommand, so only dispatch when executed directly.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
