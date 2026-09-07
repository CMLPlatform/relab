"""Tests for the application logging configuration."""

import logging
from typing import TYPE_CHECKING

import pytest
from pythonjsonlogger.json import JsonFormatter

from app.core.config import Environment
from app.core.logging import configure_logging_handlers

if TYPE_CHECKING:
    from pytest_mock import MockerFixture


def test_configure_logging_handlers_dev_environment(mocker: MockerFixture) -> None:
    """Verify that DEV keeps a human-readable console handler."""
    mock_handler_cls = mocker.patch("app.core.logging.logging.StreamHandler")
    mocker.patch("app.core.logging.settings.environment", new=Environment.DEV)

    configure_logging_handlers("DEBUG")

    handler = mock_handler_cls.return_value
    handler.setLevel.assert_called_once_with(logging.DEBUG)
    formatter = handler.setFormatter.call_args.args[0]
    assert not isinstance(formatter, JsonFormatter)


@pytest.mark.parametrize("environment", [Environment.PROD, Environment.STAGING], ids=["prod", "staging"])
def test_configure_logging_handlers_json_environments(mocker: MockerFixture, environment: Environment) -> None:
    """Verify that PROD and STAGING both enable a JSON console formatter."""
    mock_handler_cls = mocker.patch("app.core.logging.logging.StreamHandler")
    mocker.patch("app.core.logging.settings.environment", new=environment)

    configure_logging_handlers("INFO")

    handler = mock_handler_cls.return_value
    handler.setLevel.assert_called_once_with(logging.INFO)
    formatter = handler.setFormatter.call_args.args[0]
    assert isinstance(formatter, JsonFormatter)
