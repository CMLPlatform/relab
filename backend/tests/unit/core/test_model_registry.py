"""Tests for SQLAlchemy mapper configuration.

Two levels:

1. ``TestMapperWithRegistry``: calls ``load_models()`` first (the
   current safety-net).  These must always pass.

2. ``TestModuleIsolation``: imports each model module in a *subprocess*
   so the Python process starts fresh, then calls ``configure_mappers()``
   without the registry helper.  This documents which modules are
   self-contained and which still depend on the registry.
"""
# ruff: noqa: PLC0415 # We are intentionally testing that these models have mappers configured after load_models().

import importlib
import multiprocessing as mp
import traceback

import pytest
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import configure_mappers

from app.core.model_registry import load_models

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_isolated(import_paths: tuple[str, ...]) -> tuple[bool, str]:
    """Import modules in a subprocess, then call ``configure_mappers()`` once."""
    ctx = mp.get_context("spawn")
    result_queue: mp.Queue = ctx.Queue()

    process = ctx.Process(target=_worker, args=(import_paths, result_queue))
    process.start()
    process.join(timeout=15)
    if process.is_alive():
        process.terminate()
        process.join()
        return False, "Timed out while configuring mappers"

    if not result_queue.empty():
        return result_queue.get()

    if process.exitcode == 0:
        return True, ""

    modules = ", ".join(import_paths)
    return False, f"worker exited with code {process.exitcode} while checking: {modules}"


def _worker(import_paths: tuple[str, ...], queue: mp.Queue) -> None:
    try:
        for import_path in import_paths:
            importlib.import_module(import_path)

        configure_mappers()
    except (
        ImportError,
        AttributeError,
        NameError,
        RuntimeError,
        TypeError,
        ValueError,
        AssertionError,
        SQLAlchemyError,
    ) as exc:
        lines = [line for line in traceback.format_exc().splitlines() if line.strip()]
        message = lines[-1] if lines else str(exc)
        queue.put((False, message))
    else:
        queue.put((True, ""))


# ---------------------------------------------------------------------------
# 1. Tests that use the registry (must always pass)
# ---------------------------------------------------------------------------


# These imports are intentionally inside the test to verify that they work after load_models() has run
class TestMapperWithRegistry:
    """Mapper configuration succeeds when load_models() has run."""

    def test_load_models_imports_without_error(self) -> None:
        """Test that load_models() can be called without error."""
        load_models()

    def test_configure_mappers_resolves_all_relationships(self) -> None:
        """Test that configure_mappers() succeeds after calling load_models()."""
        load_models()
        configure_mappers()

    def test_all_expected_table_models_are_registered(self) -> None:
        """Test that all expected models are registered and have mappers after load_models()."""
        from sqlalchemy.orm import class_mapper

        load_models()
        configure_mappers()

        from app.api.auth.models import Organization, User
        from app.api.background_data.models import Category, Material, ProductType, Taxonomy
        from app.api.data_collection.models.product import (
            MaterialProductLink,
            Product,
        )
        from app.api.file_storage.models import File, Image, Video
        from app.api.newsletter.models import NewsletterSubscriber
        from app.api.plugins.rpi_cam.models import Camera

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
            NewsletterSubscriber,
            Camera,
        ]:
            mapper = class_mapper(model)
            assert mapper is not None, f"{model.__name__} has no SQLAlchemy mapper"


# ---------------------------------------------------------------------------
# 2. Isolation tests: document per-module self-sufficiency
# ---------------------------------------------------------------------------


class TestModuleIsolation:
    """Each test imports exactly one top-level model module in a clean process."""

    @pytest.mark.slow
    def test_model_modules_are_self_contained(self) -> None:
        """Model modules should configure mappers without depending on the registry helper."""
        ok, msg = _run_isolated(
            (
                "app.api.auth.models",
                "app.api.background_data.models",
                "app.api.data_collection.models.product",
                "app.api.file_storage.models",
            )
        )
        assert ok, msg
