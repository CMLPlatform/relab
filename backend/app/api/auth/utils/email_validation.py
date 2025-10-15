# backend/app/api/auth/utils/email_validation.py
from datetime import UTC, datetime, timedelta
from pathlib import Path

import anyio
import httpx
from fastapi import HTTPException

DISPOSABLE_DOMAINS_URL = "https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt"
BASE_DIR: Path = (Path(__file__).parents[4]).resolve()

CACHE_FILE = BASE_DIR / "data" / "cache" / "disposable_domains_cache.txt"
CACHE_DURATION = timedelta(days=1)


async def get_disposable_domains() -> set[str]:
    """Get disposable email domains, using cache if fresh."""
    # Check if cache exists and is fresh
    if CACHE_FILE.exists():
        cache_age = datetime.now(tz=UTC) - datetime.fromtimestamp(CACHE_FILE.stat().st_mtime, tz=UTC)
        if cache_age < CACHE_DURATION:
            async with await anyio.open_file(CACHE_FILE, "r") as f:
                content = await f.read()  # Read the entire file first
                return {line.strip().lower() for line in content.splitlines() if line.strip()}

    # Fetch fresh list
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(DISPOSABLE_DOMAINS_URL, timeout=10.0)
            response.raise_for_status()
            domains = {line.strip().lower() for line in response.text.splitlines() if line.strip()}

            # Ensure cache directory exists
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)

            # Update cache
            async with await anyio.open_file(CACHE_FILE, "w") as f:
                await f.write("\n".join(sorted(domains)))

            return domains
    except Exception as e:
        # If fetch fails and cache exists, use stale cache
        if CACHE_FILE.exists():
            async with await anyio.open_file(CACHE_FILE, "r") as f:
                content = await f.read()  # Read the entire file first
                return {line.strip().lower() for line in content.splitlines() if line.strip()}
        raise HTTPException(status_code=503, detail="Email validation service unavailable") from e


async def is_disposable_email(email: str) -> bool:
    """Check if email domain is disposable."""
    domain = email.split("@")[-1].lower()
    disposable_domains = await get_disposable_domains()
    return domain in disposable_domains
