"""The web export's Metro cache mount must be scoped to the values Babel inlines.

`babel-preset-expo` replaces every `process.env.EXPO_PUBLIC_*` read with a literal in a
production web export, but nothing env-valued enters Metro's transform cache key. A cache
warmed by a build with different origins therefore returns modules carrying the old URLs,
with exit 0 and no warning. BuildKit derives an unnamed cache mount's id from its target
and shares it across every build on the daemon, so the `id` is the only thing separating
them.
"""

from __future__ import annotations

import re
from pathlib import Path

DOCKERFILE = Path(__file__).parents[1] / "app" / "Dockerfile"

# The `expo export` RUN, up to the end of its --mount flag.
EXPORT_MOUNT = re.compile(r"RUN\s+--mount=type=cache,(?P<options>[^\s]+)\s*\\\n\s*pnpm exec expo export")


def test_export_cache_mount_is_keyed_by_the_inlined_origins() -> None:
    match = EXPORT_MOUNT.search(DOCKERFILE.read_text(encoding="utf-8"))
    assert match is not None, "could not find the `expo export` cache mount in app/Dockerfile"

    options = match.group("options")
    for arg in ("EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_WEBSITE_URL", "EXPO_PUBLIC_DOCS_URL"):
        assert f"${{{arg}}}" in options, (
            f"the Metro cache mount id must interpolate {arg}; without it a rebuild after an "
            f"origin change reuses transforms carrying the previous URL"
        )
