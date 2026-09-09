#!/usr/bin/env bash
# Blocks host-specific strings — account names, internal hostnames, deploy paths —
# from reaching this public repository's files, commit messages and, by extension,
# the pull-request bodies written from them.
#
# The terms themselves are the thing we must not commit, so they live in an
# untracked file inside .git, one per line, `#` for comments:
#
#     $(git rev-parse --git-common-dir)/info/private-terms
#
# Without that file the check is a no-op, so contributors and CI are unaffected;
# only a machine that has host knowledge enforces it. Matching is literal and
# case-insensitive.
#
# Usage:
#   check_private_terms.sh <file>...   # scan these files (pre-commit, commit-msg)
#   check_private_terms.sh --all       # scan tracked files + commits not on main
set -euo pipefail

terms_file="$(git rev-parse --git-common-dir)/info/private-terms"
[[ -f "$terms_file" ]] || exit 0

# Comments and blank lines out; anything left is a term to hunt for.
mapfile -t terms < <(sed -e 's/#.*//' -e 's/[[:space:]]*$//' "$terms_file" | grep -v '^$' || true)
[[ "${#terms[@]}" -gt 0 ]] || exit 0

hits=()

# Two terms on one line would otherwise report it twice; callers get unique lines.
report() {
    hits+=("  $1")
}

scan_files() {
    local term file
    for term in "${terms[@]}"; do
        for file in "$@"; do
            [[ -f "$file" ]] || continue
            # -F literal, -w whole-word (so a name inside an unrelated domain in a
            # wordlist is not a hit), -i case-insensitive, -n for a jump-to location.
            while IFS= read -r hit; do
                report "$file:$hit"
            done < <(grep -Fwin -- "$term" "$file" || true)
        done
    done
}

scan_commit_messages() {
    local base term sha
    # Commits on this branch but not on the integration branch: the ones a PR would
    # publish. No upstream (a fresh clone, a detached checkout) means nothing to scan.
    base="$(git merge-base HEAD origin/main 2>/dev/null || true)"
    [[ -n "$base" ]] || return 0
    for sha in $(git rev-list "$base..HEAD"); do
        for term in "${terms[@]}"; do
            if git log -1 --format='%B' "$sha" | grep -Fqwi -- "$term"; then
                report "commit $(git log -1 --format='%h %s' "$sha") contains '$term'"
            fi
        done
    done
}

if [[ "${1:-}" == "--all" ]]; then
    mapfile -t tracked < <(git ls-files)
    scan_files "${tracked[@]}"
    scan_commit_messages
else
    [[ $# -gt 0 ]] || exit 0
    scan_files "$@"
fi

if ((${#hits[@]})); then
    echo "Private terms found. These must not reach a public repository:" >&2
    printf '%s\n' "${hits[@]}" | sort -u >&2
    cat >&2 <<'EOF'

Rewrite the text without the host detail: say what the change establishes, not
which machine or account it happened on. Host-specific notes belong in the
gitignored plans under docs/superpowers/plans/, never in tracked files or commit
messages. Public history cannot be quietly edited once others have fetched it.
EOF
    exit 1
fi
