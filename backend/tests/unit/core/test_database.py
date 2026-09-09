"""Tests for the shared async engine's logging posture."""

from app.core.config import settings
from app.core.database import async_engine


def test_engine_hides_bound_parameters_outside_development() -> None:
    """A DB failure renders its bound parameters into ``str(exc)``.

    Every handler that logs such a failure with a traceback would then write the
    statement's values (a registration address, a password hash) into the deployed
    JSON logs, so the engine must hide them everywhere `debug` is off.
    """
    assert settings.debug is False
    assert async_engine.sync_engine.hide_parameters is True
