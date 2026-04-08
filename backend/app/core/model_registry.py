"""Utilities to ensure all ORM models are registered before use."""

from functools import lru_cache


# ruff: noqa: F401, PLC0415 # We import all model modules here to ensure they're registered with SQLAlchemy before any ORM use.
@lru_cache(maxsize=1)
def load_models() -> None:
    """Import all model modules once so SQLAlchemy can resolve string relationships.

    Models that use string-based relationship targets (e.g. ``"User"``) rely on
    those classes being imported into the declarative registry before mapper
    configuration runs.
    """
    # data_collection is the hub: importing it pulls in auth, background_data,
    # and file_storage transitively, registering all cross-module models.
    from app.api.data_collection.models import product as _data_collection_models

    # rpi_cam and newsletter are self-contained; they only import auth and
    # common.models which are already loaded via data_collection above.
    from app.api.newsletter import models as _newsletter_models
    from app.api.plugins.rpi_cam import models as _rpi_cam_models


# Backward compat alias — remove after all call sites are updated.
load_sqlmodel_models = load_models
