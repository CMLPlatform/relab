"""Tests for centralized API exception exports."""

from __future__ import annotations

import inspect
from typing import TYPE_CHECKING

import pytest

import app.api.exceptions as api_exceptions
from app.api.auth import exceptions as auth_exceptions
from app.api.common import exceptions as common_exceptions
from app.api.common.crud import exceptions as common_crud_exceptions
from app.api.data_collection import exceptions as data_collection_exceptions
from app.api.file_storage import exceptions as file_storage_exceptions
from app.api.newsletter import exceptions as newsletter_exceptions
from app.api.plugins.rpi_cam import exceptions as rpi_cam_exceptions

if TYPE_CHECKING:
    from types import ModuleType


def _defined_exception_classes(module: ModuleType) -> dict[str, type[Exception]]:
    """Return locally-defined exception classes for a module."""
    return {
        name: obj
        for name, obj in vars(module).items()
        if inspect.isclass(obj) and obj.__module__ == module.__name__ and issubclass(obj, Exception)
    }


@pytest.mark.unit
def test_api_exception_module_reexports_all_local_exception_classes() -> None:
    """Every exception class defined in an API exception module is available centrally."""
    source_modules = (
        auth_exceptions,
        common_exceptions,
        common_crud_exceptions,
        data_collection_exceptions,
        file_storage_exceptions,
        newsletter_exceptions,
        rpi_cam_exceptions,
    )

    expected = {}
    for module in source_modules:
        expected.update(_defined_exception_classes(module))

    exported_names = set(api_exceptions.__all__)

    assert len(api_exceptions.__all__) == len(exported_names)
    assert exported_names == set(expected)

    for name, exception_class in expected.items():
        assert getattr(api_exceptions, name) is exception_class
