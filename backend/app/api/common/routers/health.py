"""Health check and readiness probe endpoints."""

import asyncio
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import async_engine
from app.core.redis import ping_redis

HEALTHY_STATUS = "healthy"
UNHEALTHY_STATUS = "unhealthy"

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


def healthy_check() -> dict[str, str]:
    """Return a healthy check payload."""
    return {"status": HEALTHY_STATUS}


def unhealthy_check(error: str) -> dict[str, str]:
    """Return an unhealthy check payload with error details."""
    return {"status": UNHEALTHY_STATUS, "error": error}


async def check_database() -> dict[str, str]:
    """Check PostgreSQL database connectivity."""
    try:
        async with async_engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            if result.scalar_one() != 1:
                return unhealthy_check("Database SELECT 1 returned unexpected result")
        return healthy_check()
    except (SQLAlchemyError, OSError, RuntimeError) as e:
        logger.exception("Database health check failed")
        return unhealthy_check(str(e))


async def check_redis(request: Request) -> dict[str, str]:
    """Check Redis cache connectivity."""
    redis_client = request.app.state.redis if hasattr(request.app.state, "redis") else None

    if redis_client is None:
        return unhealthy_check("Redis client not initialized")

    try:
        ping = await ping_redis(redis_client)
        if ping:
            return healthy_check()
        return unhealthy_check("Redis ping returned False")
    except (OSError, RuntimeError, TimeoutError) as e:
        logger.exception("Redis health check failed")
        return unhealthy_check(str(e))


async def perform_health_checks(request: Request) -> dict[str, dict[str, str]]:
    """Perform parallel health checks for all service dependencies."""
    database_check, redis_check = await asyncio.gather(check_database(), check_redis(request), return_exceptions=False)

    return {
        "database": database_check,
        "redis": redis_check,
    }


@router.get("/live", include_in_schema=False)
async def liveness_probe() -> JSONResponse:
    """Liveness probe: signals the container is running."""
    return JSONResponse(content={"status": "alive"}, status_code=200)


@router.get("/health", include_in_schema=False)
async def readiness_probe(request: Request) -> JSONResponse:
    """Readiness probe: signals the application is ready to serve requests.

    Performs health checks on all dependencies (database, Redis).
    Returns HTTP 200 only if all dependencies are healthy.
    Returns HTTP 503 if any dependency is unhealthy.
    """
    checks = await perform_health_checks(request)

    # Determine overall status
    all_healthy = all(check.get("status") == HEALTHY_STATUS for check in checks.values())
    overall_status = HEALTHY_STATUS if all_healthy else UNHEALTHY_STATUS
    status_code = 200 if all_healthy else 503

    response_data = {
        "status": overall_status,
        "checks": checks,
    }

    return JSONResponse(content=response_data, status_code=status_code)
