"""Router surface tests for the RPi camera plugin."""

from fastapi.routing import APIRoute

from app.api.plugins.rpi_cam.routers.camera_interaction import router


def test_camera_interaction_router_does_not_expose_open_close_routes() -> None:
    """Legacy open/close proxy routes should no longer be exposed."""
    paths = {route.path for route in router.routes if isinstance(route, APIRoute)}
    assert "/v1/plugins/rpi-cam/cameras/{camera_id}/open" not in paths
    assert "/v1/plugins/rpi-cam/cameras/{camera_id}/close" not in paths
    assert "/v1/plugins/rpi-cam/cameras/{camera_id}/snapshot" not in paths
