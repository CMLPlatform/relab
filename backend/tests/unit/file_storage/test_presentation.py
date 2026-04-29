"""Unit tests for file storage read-model and path helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import uuid4

from app.api.file_storage.crud.support_paths import storage_item_exists
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.schemas import FileReadWithinParent, ImageRead, ImageReadWithinParent
from app.core.config import settings

if TYPE_CHECKING:
    from pathlib import Path

    import pytest


@dataclass(frozen=True)
class FakeStoredFile:
    """Typed stand-in for StorageFile/StorageImage — exposes only what helpers read."""

    path: str


def test_file_read_within_parent_model_validate_returns_public_url(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """File read schema should build a public URL when the file exists."""
    storage_root = tmp_path / "files"
    monkeypatch.setattr(settings, "file_storage_path", storage_root)
    stored_dir = storage_root / "tests"
    stored_dir.mkdir(parents=True, exist_ok=True)
    stored_file = stored_dir / "example.txt"
    stored_file.write_bytes(b"hello")

    file = File(
        id=uuid4(),
        filename="example.txt",
        file=FakeStoredFile(path=str(stored_file)),
        parent_type=MediaParentType.PRODUCT,
        parent_id=1,
    )

    read_model = FileReadWithinParent.model_validate(file)

    assert storage_item_exists(file) is True
    assert read_model.file_url == f"/uploads/files/{stored_file.relative_to(storage_root)}"


def test_image_read_within_parent_model_validate_returns_urls(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Image read schema should build image and thumbnail URLs."""
    storage_root = tmp_path / "images"
    monkeypatch.setattr(settings, "image_storage_path", storage_root)
    stored_dir = storage_root / "tests"
    stored_dir.mkdir(parents=True, exist_ok=True)
    stored_file = stored_dir / "example.png"
    stored_file.write_bytes(b"hello")
    thumbnail_file = stored_dir / "example_thumb_200.webp"
    thumbnail_file.write_bytes(b"thumb")

    image = Image(
        id=uuid4(),
        filename="example.png",
        file=FakeStoredFile(path=str(stored_file)),
        parent_type=MediaParentType.PRODUCT,
        parent_id=1,
    )

    read_model = ImageReadWithinParent.model_validate(image)

    assert read_model.image_url == f"/uploads/images/{stored_file.relative_to(storage_root)}"
    assert read_model.thumbnail_url == f"/uploads/images/{thumbnail_file.relative_to(storage_root)}"


def test_image_read_model_validate_from_orm(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Image read schemas should validate raw ORM rows with derived URLs."""
    storage_root = tmp_path / "images"
    monkeypatch.setattr(settings, "image_storage_path", storage_root)
    stored_dir = storage_root / "tests"
    stored_dir.mkdir(parents=True, exist_ok=True)
    stored_file = stored_dir / "example.png"
    stored_file.write_bytes(b"hello")

    image = Image(
        id=uuid4(),
        filename="example.png",
        file=FakeStoredFile(path=str(stored_file)),
        parent_type=MediaParentType.PRODUCT,
        parent_id=1,
    )

    read_model = ImageRead.model_validate(image)

    assert read_model.image_url == f"/uploads/images/{stored_file.relative_to(storage_root)}"
    assert read_model.thumbnail_url == f"/uploads/images/{stored_file.relative_to(storage_root)}"
    assert read_model.parent_id == 1
    assert read_model.parent_type == MediaParentType.PRODUCT


def test_missing_storage_file_returns_no_urls(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Read schema should omit URLs when the backing file is missing."""
    storage_root = tmp_path / "files"
    monkeypatch.setattr(settings, "file_storage_path", storage_root)
    missing_path = storage_root / "missing" / "ghost.txt"
    file = File(
        id=uuid4(),
        filename="ghost.txt",
        file=FakeStoredFile(path=str(missing_path)),
        parent_type=MediaParentType.PRODUCT,
        parent_id=1,
    )

    assert storage_item_exists(file) is False
    assert FileReadWithinParent.model_validate(file).file_url is None
