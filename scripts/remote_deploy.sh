#!/usr/bin/env bash
# The only thing a deploy key may run on this host. Installed as the forced command of
# the deploy user's authorized_keys entry:
#
#   command="/opt/relab/scripts/remote_deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... devbox-deploy
#
# sshd puts what the client asked for in SSH_ORIGINAL_COMMAND; this maps a short allow-list
# onto the `just` recipes and refuses everything else, so the key cannot open a shell,
# read secrets, or run anything the release loop does not need. The environment is the
# host's own (root .env), never an argument: one host serves one environment.
#
# From the dev host, over an ssh config alias for the deploy user:
#   ssh relab-prod pull && ssh relab-prod build && ssh relab-prod up migrations
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
# No login shell under a forced command: the deploy user's uv lives in ~/.local/bin.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/snap/bin"

# `read -ra` splits on whitespace only; nothing here is ever eval'd or passed to a shell.
read -ra words <<<"${SSH_ORIGINAL_COMMAND:-${*:-}}"
action="${words[0]:-}"
args=("${words[@]:1}")

env_name="$(sed -n 's/^ENVIRONMENT=\([a-z]*\).*/\1/p' .env | head -1)"
[[ "$env_name" == prod || "$env_name" == staging ]] || {
    echo "remote_deploy: root .env names no deployable ENVIRONMENT" >&2
    exit 2
}

# ponytail: a case statement, not a table; add a line when the release loop grows a step.
case "$action" in
    pull)
        git fetch --quiet origin && git pull --ff-only && git log --oneline -1
        ;;
    build)
        # `build nocache`: www bakes the landing page's API data in at build time, so a
        # changed edge rule or featured product needs a rebuild the layer cache would skip.
        case "${args[0]:-}" in
            "") exec just stack "$env_name" build ;;
            nocache) NO_CACHE=1 exec just stack "$env_name" build ;;
            *)
                echo "remote_deploy: build takes 'nocache' or nothing" >&2
                exit 2
                ;;
        esac
        ;;
    up)
        # `migrations` is the routine profile; anything else must be a known profile name.
        for profile in "${args[@]}"; do
            [[ "$profile" =~ ^(migrations|backups)$ ]] || {
                echo "remote_deploy: unknown profile '$profile'" >&2
                exit 2
            }
        done
        exec just stack "$env_name" up YES "${args[@]}"
        ;;
    migrate)
        exec just stack "$env_name" migrate YES
        ;;
    rollback)
        [[ "${args[0]:-}" =~ ^[0-9a-f]{7,40}$ ]] || {
            echo "remote_deploy: rollback needs an image sha" >&2
            exit 2
        }
        # The alembic target is as dangerous as the sha and was not checked: `base`
        # downgrades through every revision, dropping every table. Only a concrete
        # revision id or a relative step may come over the key; going to `base` is a
        # deliberate act at the host's own console, not something a key can ask for.
        [[ "${args[1]:-}" =~ ^([0-9a-f]{7,40}|-[0-9]+)?$ ]] || {
            echo "remote_deploy: rollback revision must be a revision id or a -N step" >&2
            exit 2
        }
        exec just stack "$env_name" rollback YES "${args[0]}" "${args[1]:-}"
        ;;
    backup)
        exec just backup "$env_name" manual
        ;;
    watchdog)
        exec just watchdog "$env_name"
        ;;
    logs)
        # Non-following: a forced command has no pty for the client's ^C to reach.
        exec bash scripts/deploy_ops.sh stack "$env_name" logs --no-log-prefix --since "${args[0]:-15m}" --tail 300
        ;;
    status)
        exec bash scripts/deploy_ops.sh stack "$env_name" ps
        ;;
    "" | help)
        echo "usage: ssh <deploy-host> {pull|build [nocache]|up [migrations|backups]|migrate|rollback <sha> [<rev>]|backup|watchdog|logs [<since>]|status}"
        ;;
    *)
        echo "remote_deploy: '$action' is not allowed" >&2
        exit 2
        ;;
esac
