"""Tests for the application logging configuration."""

import logging
from typing import TYPE_CHECKING

from app.core.config import Environment
from app.core.logging import InterceptHandler, configure_loguru_handlers

if TYPE_CHECKING:
    from pathlib import Path

    from pytest_mock import MockerFixture


def test_standard_logging_intercepted() -> None:
    """Verify that standard logging messages are captured by loguru."""
    assert any(isinstance(handler, InterceptHandler) for handler in logging.root.handlers)


def test_noisy_loggers_configured() -> None:
    """Verify that noisy loggers like uvicorn and sqlalchemy are propagated to root."""
    noisy_logger = logging.getLogger("sqlalchemy.engine")
    assert noisy_logger.propagate is True
    assert len(noisy_logger.handlers) == 0


def test_configure_loguru_handlers_dev_environment(mocker: MockerFixture, tmp_path: Path) -> None:
    """Verify that `enqueue` is False in the DEV environment."""
    mock_add = mocker.patch("loguru.logger.add")
    mocker.patch("app.core.logging.settings.environment", new=Environment.DEV)

    configure_loguru_handlers(tmp_path, "DEBUG")

    assert mock_add.call_count > 0
    for call in mock_add.call_args_list:
        assert call.kwargs.get("enqueue") is False


def test_configure_loguru_handlers_prod_environment(mocker: MockerFixture, tmp_path: Path) -> None:
    """Verify that `enqueue` is True in the PROD environment."""
    mock_add = mocker.patch("loguru.logger.add")
    mocker.patch("app.core.logging.settings.environment", new=Environment.PROD)

    configure_loguru_handlers(tmp_path, "INFO")

    assert mock_add.call_count > 0
    for call in mock_add.call_args_list:
        assert call.kwargs.get("enqueue") is True


def test_configure_loguru_handlers_staging_environment(mocker: MockerFixture, tmp_path: Path) -> None:
    """Verify that `enqueue` is True in the STAGING environment."""
    mock_add = mocker.patch("loguru.logger.add")
    mocker.patch("app.core.logging.settings.environment", new=Environment.STAGING)

    configure_loguru_handlers(tmp_path, "INFO")

    assert mock_add.call_count > 0
    for call in mock_add.call_args_list:
        assert call.kwargs.get("enqueue") is True
