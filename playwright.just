# Shared Playwright browser bootstrap, imported by app/, docs/, and www/.
# Browsers live in one machine-wide cache (~/.cache/ms-playwright), so whichever
# subrepo installs them first serves the others — only the *asking* was duplicated.

# Ensure the browsers this suite needs are present. Idempotent: a no-op unless a
# Playwright bump moved the pinned build, which is the only time a run dies with
# "Executable doesn't exist at ~/.cache/ms-playwright/...". Set INSTALL=force to
# also install the system packages (--with-deps; needs sudo/apt), which CI does not.
_browsers *browsers:
    #!/usr/bin/env bash
    set -euo pipefail
    # An imported recipe runs from this file's directory (the monorepo root),
    # where `pnpm exec` goes recursive and finds no playwright — so step into
    # the subrepo whose justfile pulled us in.
    cd {{ quote(justfile_directory()) }}
    args=(install)
    if [[ "${INSTALL:-}" == force ]]; then args+=(--with-deps); fi
    # CI runs chromium only, and without --with-deps. Every library chromium needs is
    # already in the ubuntu-latest image: the last run that passed --with-deps reported
    # each one "already the newest version" and installed nothing but nine font packages,
    # for scripts these suites never render. What it did cost was an `apt-get update` on
    # every E2E job, which against a slow mirror once took 14 minutes for a step that
    # normally takes 6 seconds.
    #
    # If a future runner image drops one of those libraries, chromium fails to launch on
    # a missing shared object. Run with INSTALL=force to put the system packages back.
    if [[ -n "${CI:-}" ]]; then
        exec pnpm exec playwright "${args[@]}" chromium
    fi
    pnpm exec playwright "${args[@]}" {{ browsers }}
