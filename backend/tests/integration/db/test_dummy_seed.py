"""Tests for the dummy-data seeder's component tree and its photographs.

The seeded XPS 13 is what dev and CI render as a real teardown: www's hero picks
its layout from whether components carry photographs, and builds a ``srcset``
from the derivative widths below. Both only exist if seeding walks the tree.
"""

from typing import TYPE_CHECKING

from sqlalchemy import select

from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Image, MediaParentType
from app.core.config import settings
from app.core.images import THUMBNAIL_WIDTHS
from app.core.images.urls import build_thumbnail_urls_by_width
from scripts.seed.dummy_seed.runner import run_seed_steps

if TYPE_CHECKING:
    from pathlib import Path

    import pytest
    from sqlalchemy.ext.asyncio import AsyncSession

SEEDED_PARTS = {
    "Display assembly",
    "Bottom cover",
    "Keyboard",
    "Motherboard assembly",
    "Keyboard frame assembly",
    "SSD",
}


async def test_seeding_builds_a_photographed_component_tree(
    db_session: AsyncSession,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Seeding should give the XPS 13 a nested, photographed teardown tree."""
    uploads_path = tmp_path / "uploads"
    monkeypatch.setattr(settings, "uploads_path", uploads_path)
    monkeypatch.setattr(settings, "file_storage_path", uploads_path / "files")
    monkeypatch.setattr(settings, "image_storage_path", uploads_path / "images")

    await run_seed_steps(db_session)

    laptop = (await db_session.execute(select(Product).where(Product.name == "Dell XPS 13"))).scalar_one()
    parts = dict(
        (await db_session.execute(select(Product.name, Product.id).where(Product.parent_id == laptop.id))).all()
    )
    assert set(parts) == SEEDED_PARTS

    # One nested level too: the display's panel and lid are the disclosure the
    # hero opens, and they are only reachable if the seeder recurses.
    display_children = (
        (await db_session.execute(select(Product.name).where(Product.parent_id == parts["Display assembly"])))
        .scalars()
        .all()
    )
    assert set(display_children) == {"LCD panel", "Lid and hinges"}

    # Every photograph names a component, not just the assembled product, so the
    # schedule is a wall of prints rather than a single hero image.
    photographed = (
        (
            await db_session.execute(
                select(Product.name)
                .join(Image, Image.parent_id == Product.id)
                .where(Image.parent_type == MediaParentType.PRODUCT, Product.name.in_(SEEDED_PARTS))
            )
        )
        .scalars()
        .all()
    )
    assert set(photographed) == SEEDED_PARTS


async def test_seeded_photographs_carry_more_than_one_derivative_width(
    db_session: AsyncSession,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Seed images should be wide enough to generate a choice of derivatives.

    ``generate_thumbnails`` skips any width at or above the original's, so an
    800px seed photograph would yield the 200px derivative alone — a one-entry
    map, which www renders without a ``srcset`` at all. That would leave the
    responsive path untested precisely where it is meant to be exercised.
    """
    uploads_path = tmp_path / "uploads"
    monkeypatch.setattr(settings, "uploads_path", uploads_path)
    monkeypatch.setattr(settings, "file_storage_path", uploads_path / "files")
    monkeypatch.setattr(settings, "image_storage_path", uploads_path / "images")

    await run_seed_steps(db_session)

    ssd = (await db_session.execute(select(Product).where(Product.name == "SSD"))).scalar_one()
    image = (
        await db_session.execute(
            select(Image).where(Image.parent_id == ssd.id, Image.parent_type == MediaParentType.PRODUCT)
        )
    ).scalar_one()

    widths = build_thumbnail_urls_by_width(str(image.file.path), settings.image_storage_path)
    assert set(widths) == {width for width in THUMBNAIL_WIDTHS if width < 960}
    assert len(widths) > 1
