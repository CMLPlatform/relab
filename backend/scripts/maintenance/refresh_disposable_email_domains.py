"""Refresh the committed disposable email fallback list from the upstream source."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

import anyio
import httpx

from app.api.auth.utils.email_validation import DISPOSABLE_DOMAINS_FALLBACK_PATH, DISPOSABLE_DOMAINS_URL

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger(__name__)

_WARN_FILE_SIZE_BYTES = 2 * 1024 * 1024
_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024


def _normalize_domains(raw_text: str) -> list[str]:
    """Normalize raw domain text into a sorted, unique list."""
    return sorted({line.strip().lower() for line in raw_text.splitlines() if line.strip() and not line.startswith("#")})


def _render_domains_file(domains: list[str]) -> str:
    """Render the fallback file contents."""
    header = [
        "# Curated local fallback for disposable email validation.",
        "# Refresh from upstream with: `just refresh-disposable-email-domains`",
    ]
    return "\n".join([*header, *domains, ""])


def _validate_rendered_size(content: str) -> None:
    """Warn or fail if the refreshed fallback file becomes unexpectedly large."""
    size_bytes = len(content.encode("utf-8"))
    if size_bytes > _MAX_FILE_SIZE_BYTES:
        msg = (
            f"Disposable-email fallback file would be {size_bytes} bytes, "
            f"which exceeds the hard limit of {_MAX_FILE_SIZE_BYTES} bytes"
        )
        raise ValueError(msg)
    if size_bytes > _WARN_FILE_SIZE_BYTES:
        logger.warning(
            "Disposable-email fallback file is %d bytes, above the warning threshold of %d bytes.",
            size_bytes,
            _WARN_FILE_SIZE_BYTES,
        )


async def refresh_disposable_domains(output_path: Path = DISPOSABLE_DOMAINS_FALLBACK_PATH) -> int:
    """Download the current domain list and write it to the repo-local fallback file."""
    async with httpx.AsyncClient() as client:
        response = await client.get(DISPOSABLE_DOMAINS_URL, timeout=20.0)
        response.raise_for_status()

    domains = _normalize_domains(response.text)
    rendered = _render_domains_file(domains)
    _validate_rendered_size(rendered)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    await anyio.Path(output_path).write_text(rendered, encoding="utf-8")
    logger.info("Updated %s with %d disposable domains.", output_path, len(domains))
    return 0


def main() -> None:
    """Run the disposable domain refresh."""
    raise SystemExit(asyncio.run(refresh_disposable_domains()))


if __name__ == "__main__":
    main()
