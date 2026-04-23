"""Public unit router for background data."""

from app.api.common.models.enums import Unit

from .public_support import BackgroundDataAPIRouter

router = BackgroundDataAPIRouter(prefix="/units", tags=["units"], include_in_schema=True)


@router.get("")
async def get_units() -> list[str]:
    """Get a list of available units."""
    return [unit.value for unit in Unit]
