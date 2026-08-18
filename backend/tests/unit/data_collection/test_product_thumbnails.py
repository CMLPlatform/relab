"""Thumbnail derivation for product and component read schemas.

Regression: summary reads (product lists, component lists) previously returned
``thumbnail_url: null`` because the model property was hardcoded to ``None`` and
only the detail schemas repopulated it from the ``images`` relationship.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4

from app.api.data_collection.product_schemas import ProductRead
from app.api.data_collection.schemas import ComponentRead, ProductReadWithRelationships
from app.api.file_storage.models import MediaParentType
from app.core.config import settings
from app.core.images.thumbnails import thumbnail_path_for
from tests.factories.models import ProductFactory

if TYPE_CHECKING:
    import pytest


@dataclass(frozen=True)
class FakeStoredImage:
    """Typed stand-in for StorageImage — exposes only the attribute helpers read."""

    path: str


def _stage_image(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    with_thumbnail: bool,
    widths: tuple[int, ...] = (200,),
) -> FakeStoredImage:
    storage_root = tmp_path / "images"
    monkeypatch.setattr(settings, "image_storage_path", storage_root)
    stored_dir = storage_root / "products"
    stored_dir.mkdir(parents=True, exist_ok=True)
    original = stored_dir / "front.jpg"
    original.write_bytes(b"jpeg-bytes")
    if with_thumbnail:
        for width in widths:
            thumbnail = thumbnail_path_for(original, width)
            thumbnail.parent.mkdir(parents=True, exist_ok=True)
            thumbnail.write_bytes(b"webp-bytes")
    return FakeStoredImage(path=str(original))


def test_summary_read_carries_a_thumbnail_without_loading_images(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """ProductRead (the list schema, no `images` field) must still expose a thumbnail."""
    stored = _stage_image(tmp_path, monkeypatch, with_thumbnail=True)
    product = ProductFactory.build(id=1, owner_id=uuid4())
    object.__setattr__(product, "first_image_file", stored)

    read_model = ProductRead.model_validate(product)

    assert read_model.thumbnail_url is not None
    assert read_model.thumbnail_url.startswith("/uploads/images/")


def test_summary_read_prefers_the_generated_thumbnail_over_the_original(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The 200px WebP must win over the full-size original when it exists."""
    stored = _stage_image(tmp_path, monkeypatch, with_thumbnail=True)
    product = ProductFactory.build(id=1, owner_id=uuid4())
    object.__setattr__(product, "first_image_file", stored)

    expected = thumbnail_path_for(Path(stored.path), 200).name
    thumbnail_url = ProductRead.model_validate(product).thumbnail_url

    assert thumbnail_url is not None
    assert thumbnail_url.endswith(expected)
    assert not thumbnail_url.endswith("front.jpg")


def test_summary_read_falls_back_to_the_original_when_no_thumbnail_exists(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """With no generated thumbnail on disk, serve the original rather than null."""
    stored = _stage_image(tmp_path, monkeypatch, with_thumbnail=False)
    product = ProductFactory.build(id=1, owner_id=uuid4())
    object.__setattr__(product, "first_image_file", stored)

    thumbnail_url = ProductRead.model_validate(product).thumbnail_url

    assert thumbnail_url is not None
    assert thumbnail_url.endswith("front.jpg")


def test_component_read_carries_a_thumbnail_too(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """ComponentRead is the schema used by component lists and the subtree endpoint."""
    stored = _stage_image(tmp_path, monkeypatch, with_thumbnail=True)
    component = ProductFactory.build(id=2, owner_id=uuid4(), parent_id=1, amount_in_parent=1)
    object.__setattr__(component, "first_image_file", stored)

    assert ComponentRead.model_validate(component).thumbnail_url is not None


def test_missing_file_on_disk_yields_no_thumbnail(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A DB row pointing at a deleted file must not produce a broken URL."""
    monkeypatch.setattr(settings, "image_storage_path", tmp_path / "images")
    product = ProductFactory.build(id=1, owner_id=uuid4())
    object.__setattr__(product, "first_image_file", FakeStoredImage(path=str(tmp_path / "gone.jpg")))

    assert ProductRead.model_validate(product).thumbnail_url is None


def test_summary_read_publishes_every_derivative_that_exists(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The wider derivatives are written at upload time; reads must expose them.

    Without this a caller rendering a large image only ever sees the 200px
    list thumbnail and has to upscale it.
    """
    stored = _stage_image(tmp_path, monkeypatch, with_thumbnail=True, widths=(200, 800, 1600))
    product = ProductFactory.build(id=1, owner_id=uuid4())
    object.__setattr__(product, "first_image_file", stored)

    urls = ProductRead.model_validate(product).thumbnail_urls

    assert sorted(urls) == [200, 800, 1600]
    assert urls[800].endswith(thumbnail_path_for(Path(stored.path), 800).name)


def test_summary_read_omits_widths_with_no_file_on_disk(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """generate_thumbnails skips widths at or above the original, so the map is sparse."""
    stored = _stage_image(tmp_path, monkeypatch, with_thumbnail=True, widths=(200,))
    product = ProductFactory.build(id=1, owner_id=uuid4())
    object.__setattr__(product, "first_image_file", stored)

    assert sorted(ProductRead.model_validate(product).thumbnail_urls) == [200]


def test_component_read_publishes_derivatives_for_the_parts_grid(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The component tree feeds the landing hero's parts grid, which renders above 200px."""
    stored = _stage_image(tmp_path, monkeypatch, with_thumbnail=True, widths=(200, 800))
    component = ProductFactory.build(id=2, owner_id=uuid4(), parent_id=1, amount_in_parent=1)
    object.__setattr__(component, "first_image_file", stored)

    assert sorted(ComponentRead.model_validate(component).thumbnail_urls) == [200, 800]


def test_missing_file_on_disk_yields_no_derivatives(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A DB row pointing at a deleted file must not produce broken derivative URLs."""
    monkeypatch.setattr(settings, "image_storage_path", tmp_path / "images")
    product = ProductFactory.build(id=1, owner_id=uuid4())
    object.__setattr__(product, "first_image_file", FakeStoredImage(path=str(tmp_path / "gone.jpg")))

    assert ProductRead.model_validate(product).thumbnail_urls == {}


def test_detail_read_fallback_prefers_the_generated_thumbnail() -> None:
    """Regression: the images fallback used to serve the full-size original."""
    image = {
        "id": uuid4(),
        "filename": "front.jpg",
        "image_url": "/uploads/images/front.jpg",
        "thumbnail_url": "/uploads/images/front_thumb_200.webp",
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "parent_id": 1,
        "parent_type": MediaParentType.PRODUCT,
    }
    product = ProductReadWithRelationships.model_validate(
        {
            "id": 1,
            "name": "Drill",
            "owner_id": uuid4(),
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "images": [image],
        }
    )

    assert product.thumbnail_url == "/uploads/images/front_thumb_200.webp"
