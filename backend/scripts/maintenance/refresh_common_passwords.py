"""Refresh the committed common-password fallback list from the pinned upstream source."""
# spell-checker: ignore SecLists

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

import httpx

from app.api.auth.services.common_password_checker import (
    COMMON_PASSWORDS_FALLBACK_PATH,
    COMMON_PASSWORDS_SOURCE_URL,
    COMMON_PASSWORDS_TARGET_COUNT,
    normalize_common_password,
)

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from pathlib import Path

_MIN_PASSWORD_LENGTH = 12
_MAX_PASSWORD_LENGTH = 128


def _normalize_passwords(raw_text: str, *, target_count: int = COMMON_PASSWORDS_TARGET_COUNT) -> list[str]:
    """Normalize raw password text into the first policy-sized unique entries."""
    passwords: list[str] = []
    seen: set[str] = set()
    for raw_line in raw_text.splitlines():
        candidate = normalize_common_password(raw_line.strip())
        if not candidate or candidate.startswith("#") or candidate in seen:
            continue
        if _MIN_PASSWORD_LENGTH <= len(candidate) <= _MAX_PASSWORD_LENGTH:
            passwords.append(candidate)
            seen.add(candidate)
            if len(passwords) == target_count:
                break

    if len(passwords) < target_count:
        msg = f"Source produced {len(passwords)} passwords, fewer than required target {target_count}"
        raise ValueError(msg)
    return passwords


def _render_passwords_file(passwords: list[str]) -> str:
    """Render the fallback file contents."""
    header = [
        "# Curated local fallback for ASVS 5.0 V6.2.4 common-password validation.",
        f"# Source: {COMMON_PASSWORDS_SOURCE_URL}",
        f"# Filter: NFC + casefold + first {len(passwords)} unique entries with length 12..128.",
        f"# Count: {len(passwords)}",
        "# Refresh from upstream with: `just refresh-common-passwords`",
    ]
    return "\n".join([*header, *passwords, ""])


def _write_passwords_file(output_path: Path, passwords: list[str]) -> None:
    """Write rendered password fallback content to disk."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(_render_passwords_file(passwords), encoding="utf-8")


async def refresh_common_passwords(
    output_path: Path = COMMON_PASSWORDS_FALLBACK_PATH,
    *,
    target_count: int = COMMON_PASSWORDS_TARGET_COUNT,
) -> int:
    """Download the pinned password list and write it to the repo-local fallback file."""
    async with httpx.AsyncClient() as client:
        response = await client.get(COMMON_PASSWORDS_SOURCE_URL, timeout=20.0)
        response.raise_for_status()

    passwords = _normalize_passwords(response.text, target_count=target_count)
    await asyncio.to_thread(_write_passwords_file, output_path, passwords)
    logger.info("Updated %s with %d common passwords.", output_path, len(passwords))
    return 0


def main() -> None:
    """Run the common-password refresh."""
    raise SystemExit(asyncio.run(refresh_common_passwords()))


if __name__ == "__main__":
    main()
