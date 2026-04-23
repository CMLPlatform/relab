"""Shared dummy seed data loading."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from app.core.env import BACKEND_DIR

if TYPE_CHECKING:
    from typing import Any

data_file = BACKEND_DIR / "data" / "seed" / "dummy_data.json"
with data_file.open("r") as f:
    _seed_data = json.load(f)

user_data: list[dict[str, Any]] = _seed_data["user_data"]
taxonomy_data: list[dict[str, Any]] = _seed_data["taxonomy_data"]
category_data: list[dict[str, Any]] = _seed_data["category_data"]
material_data: list[dict[str, Any]] = _seed_data["material_data"]
product_type_data: list[dict[str, Any]] = _seed_data["product_type_data"]
product_data: list[dict[str, Any]] = _seed_data["product_data"]
image_data: list[dict[str, Any]] = _seed_data["image_data"]
