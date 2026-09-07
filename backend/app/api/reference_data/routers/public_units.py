"""Public unit router for reference data."""

from app.api.common.models.enums import Unit

from .public_support import ReferenceDataAPIRouter

router = ReferenceDataAPIRouter(prefix="/units", tags=["units"], include_in_schema=True)


@router.get("")
async def get_units() -> list[str]:
    """Get a list of available units."""
    return [unit.value for unit in Unit]
