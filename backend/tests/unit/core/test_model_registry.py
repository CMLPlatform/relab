"""Tests for SQLAlchemy mapper configuration.

Two levels:

1. ``TestMapperWithRegistry``: calls ``load_sqlmodel_models()`` first (the
   current safety-net).  These must always pass.

2. ``TestModuleIsolation``: imports each model module in a *subprocess*
   so the Python process starts fresh, then calls ``configure_mappers()``
   without the registry helper.  This documents which modules are
   self-contained and which still depend on the registry.
"""

import subprocess
import sys

import pytest
from sqlalchemy.orm import configure_mappers

from app.core.model_registry import load_sqlmodel_models

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_CONFIGURE_SNIPPET = """\
import sys
module = sys.argv[1]
__import__(module)
from sqlalchemy.orm import configure_mappers
configure_mappers()
print("OK")
"""


def _run_isolated(module: str) -> tuple[bool, str]:
    """Import *module* in a fresh subprocess and call configure_mappers().

    Returns (success, message).
    """
    result = subprocess.run(  # noqa: S603 # We control the input so it's safe to run this subprocess
        [sys.executable, "-c", _CONFIGURE_SNIPPET, module],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0:
        return True, "OK"
    # Extract the last meaningful line from stderr for a compact message.
    lines = [line for line in result.stderr.splitlines() if line.strip()]
    return False, lines[-1] if lines else result.stderr


# ---------------------------------------------------------------------------
# 1. Tests that use the registry (must always pass)
# ---------------------------------------------------------------------------


# ruff: noqa: PLC0415 # These imports are intentionally inside the test to verify that they work after load_sqlmodel_models() has run
@pytest.mark.unit
class TestMapperWithRegistry:
    """Mapper configuration succeeds when load_sqlmodel_models() has run."""

    def test_load_sqlmodel_models_imports_without_error(self) -> None:
        """Test that load_sqlmodel_models() can be called without error."""
        load_sqlmodel_models()

    def test_configure_mappers_resolves_all_relationships(self) -> None:
        """Test that configure_mappers() succeeds after calling load_sqlmodel_models()."""
        load_sqlmodel_models()
        configure_mappers()

    def test_all_expected_table_models_are_registered(self) -> None:
        """Test that all expected models are registered and have mappers after load_sqlmodel_models()."""
        from sqlalchemy.orm import class_mapper

        load_sqlmodel_models()
        configure_mappers()

        from app.api.auth.models import Organization, User
        from app.api.background_data.models import Category, Material, ProductType, Taxonomy
        from app.api.data_collection.models.product import (
            MaterialProductLink,
            Product,
        )
        from app.api.file_storage.models import File, Image, Video

        for model in [
            User,
            Organization,
            Taxonomy,
            Category,
            Material,
            ProductType,
            Product,
            MaterialProductLink,
            File,
            Image,
            Video,
        ]:
            mapper = class_mapper(model)
            assert mapper is not None, f"{model.__name__} has no SQLAlchemy mapper"


# ---------------------------------------------------------------------------
# 2. Isolation tests: document per-module self-sufficiency
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestModuleIsolation:
    """Each test imports exactly one top-level model module in a clean process."""

    def test_auth_models_self_contained(self) -> None:
        """Test that app.api.auth.models can be imported and have mappers configured without the registry."""
        ok, msg = _run_isolated("app.api.auth.models")
        assert ok, msg

    @pytest.mark.skip(reason="background_data has cross-module string relationships to file_storage; requires full registry")
    def test_background_data_models_self_contained(self) -> None:
        """Test that app.api.background_data.models can be imported and have mappers configured without the registry."""
        ok, msg = _run_isolated("app.api.background_data.models")
        assert ok, msg

    def test_data_collection_models_self_contained(self) -> None:
        """Test that app.api.data_collection.models can be imported and have mappers configured without the registry."""
        ok, msg = _run_isolated("app.api.data_collection.models")
        assert ok, msg

    def test_file_storage_models_self_contained(self) -> None:
        """Test that app.api.file_storage.models can be imported and have mappers configured without the registry."""
        ok, msg = _run_isolated("app.api.file_storage.models")
        assert ok, msg

    def test_newsletter_models_self_contained(self) -> None:
        """Test that app.api.newsletter.models can be imported and have mappers configured without the registry."""
        ok, msg = _run_isolated("app.api.newsletter.models")
        assert ok, msg

    def test_rpi_cam_models_self_contained(self) -> None:
        """Test that app.api.plugins.rpi_cam.models can be imported and have mappers configured without the registry."""
        ok, msg = _run_isolated("app.api.plugins.rpi_cam.models")
        assert ok, msg
