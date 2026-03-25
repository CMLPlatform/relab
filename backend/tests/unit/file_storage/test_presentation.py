"""Unit tests for file storage presentation helpers."""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING, cast
from uuid import uuid4

from app.api.file_storage.models.models import File, Image, MediaParentType
from app.api.file_storage.models.storage import FileType, ImageType
from app.api.file_storage.presentation import (
    build_file_url,
    build_image_url,
    build_thumbnail_url,
    serialize_file_read,
    serialize_image_read,
    storage_item_exists,
)
from app.api.file_storage.schemas import ImageRead
from app.core.config import settings

if TYPE_CHECKING:
    from pathlib import Path

    import pytest


def test_serialize_file_read_returns_public_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """File presentation should build a public URL when the file exists."""
    storage_root = tmp_path / "files"
    monkeypatch.setattr(settings, "file_storage_path", storage_root)
    stored_dir = storage_root / "tests"
    stored_dir.mkdir(parents=True, exist_ok=True)
    stored_file = stored_dir / "example.txt"
    stored_file.write_bytes(b"hello")

    file = File(
        id=uuid4(),
        filename="example.txt",
        file=cast("FileType", SimpleNamespace(path=str(stored_file))),
        parent_type=MediaParentType.PRODUCT,
        product_id=1,
    )

    read_model = serialize_file_read(file)

    assert storage_item_exists(file) is True
    assert build_file_url(file) == f"/uploads/files/{stored_file.relative_to(storage_root)}"
    assert read_model.file_url == f"/uploads/files/{stored_file.relative_to(storage_root)}"


def test_serialize_image_read_returns_urls(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Image presentation should build image and thumbnail URLs."""
    storage_root = tmp_path / "images"
    monkeypatch.setattr(settings, "image_storage_path", storage_root)
    stored_dir = storage_root / "tests"
    stored_dir.mkdir(parents=True, exist_ok=True)
    stored_file = stored_dir / "example.png"
    stored_file.write_bytes(b"hello")
    image_id = uuid4()

    image = Image(
        id=image_id,
        filename="example.png",
        file=cast("ImageType", SimpleNamespace(path=str(stored_file))),
        parent_type=MediaParentType.PRODUCT,
        product_id=1,
    )

    read_model = serialize_image_read(image)

    assert build_image_url(image) == f"/uploads/images/{stored_file.relative_to(storage_root)}"
    assert build_thumbnail_url(image) == f"/images/{image_id}/resized?width=200"
    assert read_model.image_url == f"/uploads/images/{stored_file.relative_to(storage_root)}"
    assert read_model.thumbnail_url == f"/images/{image_id}/resized?width=200"


def test_image_read_model_validate_from_orm(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Image read schemas should validate raw ORM rows with derived URLs."""
    storage_root = tmp_path / "images"
    monkeypatch.setattr(settings, "image_storage_path", storage_root)
    stored_dir = storage_root / "tests"
    stored_dir.mkdir(parents=True, exist_ok=True)
    stored_file = stored_dir / "example.png"
    stored_file.write_bytes(b"hello")
    image_id = uuid4()

    image = Image(
        id=image_id,
        filename="example.png",
        file=cast("ImageType", SimpleNamespace(path=str(stored_file))),
        parent_type=MediaParentType.PRODUCT,
        product_id=1,
    )

    read_model = ImageRead.model_validate(image)

    assert read_model.image_url == f"/uploads/images/{stored_file.relative_to(storage_root)}"
    assert read_model.thumbnail_url == f"/images/{image_id}/resized?width=200"
    assert read_model.parent_id == 1
    assert read_model.parent_type == MediaParentType.PRODUCT


def test_missing_storage_file_returns_no_urls(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Presentation should omit URLs when the backing file is missing."""
    storage_root = tmp_path / "files"
    monkeypatch.setattr(settings, "file_storage_path", storage_root)
    missing_path = storage_root / "missing" / "ghost.txt"
    file = File(
        id=uuid4(),
        filename="ghost.txt",
        file=cast("FileType", SimpleNamespace(path=str(missing_path))),
        parent_type=MediaParentType.PRODUCT,
        product_id=1,
    )

    assert storage_item_exists(file) is False
    assert build_file_url(file) is None
    assert serialize_file_read(file).file_url is None
