"""Temporary file utilities."""

import asyncio
from datetime import UTC, datetime
from pathlib import Path

from fastapi_utils.tasks import repeat_every

from app.core.config import settings


async def setup_directory(path: Path) -> Path:
    """Set up directory."""
    try:
        await asyncio.to_thread(path.mkdir, parents=True, mode=0o775, exist_ok=True)
    except OSError as e:
        err_msg = f"Failed to create directory: {e}"
        raise RuntimeError(err_msg) from e
    return path


async def clear_directory(path: Path, *, time_to_live_s: int | None = None) -> None:
    """Clear expired files in directory."""
    if not path.exists():
        return

    now = datetime.now(UTC).timestamp()
    for file in path.glob("*"):
        if not file.is_file():
            continue

        if time_to_live_s and (now - file.stat().st_mtime) < time_to_live_s:
            continue

        await asyncio.to_thread(file.unlink)


@repeat_every(seconds=settings.cleanup_interval_s)
async def cleanup_images() -> None:
    """Repeating background task to cleanup expired images."""
    await clear_directory(settings.image_path, time_to_live_s=settings.image_ttl_s)
