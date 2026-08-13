# Shared Playwright browser bootstrap, imported by app/, docs/, and www/.
# Browsers live in one machine-wide cache (~/.cache/ms-playwright), so whichever
# subrepo installs them first serves the others — only the *asking* was duplicated.

# Ensure the browsers this suite needs are present. Idempotent: a no-op unless a
# Playwright bump moved the pinned build, which is the only time a run dies with
# "Executable doesn't exist at ~/.cache/ms-playwright/...". CI installs its own
# pinned subset in the workflow, so this is skipped there. Set INSTALL=force to
# also install the system packages (--with-deps; needs sudo/apt).
_browsers *BROWSERS:
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ -n "${CI:-}" ]]; then exit 0; fi
    # An imported recipe runs from this file's directory (the monorepo root),
    # where `pnpm exec` goes recursive and finds no playwright — so step into
    # the subrepo whose justfile pulled us in.
    cd {{ quote(justfile_directory()) }}
    args=(install)
    if [[ "${INSTALL:-}" == force ]]; then args+=(--with-deps); fi
    pnpm exec playwright "${args[@]}" {{ BROWSERS }}
