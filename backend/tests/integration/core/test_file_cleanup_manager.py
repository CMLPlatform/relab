"""Integration tests for the scheduled file cleanup manager."""

from __future__ import annotations

import os
import time
import uuid
from typing import TYPE_CHECKING, Any, cast

from sqlalchemy import text

from app.api.file_storage.models import MediaParentType
from app.api.file_storage.services.manager import FileCleanupManager
from app.core.config import settings
from app.core.images import thumbnail_path_for
from tests.factories.models import ProductFactory, ProductTypeFactory

if TYPE_CHECKING:
    from pathlib import Path

    import pytest
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User


class TestFileCleanupManager:
    """Scheduled cleanup manager behavior."""

    async def test_run_once_preserves_referenced_image_thumbnails(
        self,
        db_session: AsyncSession,
        db_superuser: User,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """run_once keeps thumbnails for referenced images while deleting orphaned files."""
        file_storage = tmp_path / "files"
        image_storage = tmp_path / "images"
        file_storage.mkdir()
        image_storage.mkdir()

        referenced_image = image_storage / "kept.jpg"
        referenced_image.write_bytes(b"image")
        referenced_thumbnail = thumbnail_path_for(referenced_image, 200)
        referenced_thumbnail.write_bytes(b"thumb")
        orphan_thumbnail = image_storage / "orphan_thumb_200.webp"
        orphan_thumbnail.write_bytes(b"orphan")

        old_mtime = time.time() - 7200
        for path in (referenced_image, referenced_thumbnail, orphan_thumbnail):
            os.utime(path, (old_mtime, old_mtime))

        monkeypatch.setattr(settings, "file_storage_path", file_storage)
        monkeypatch.setattr(settings, "image_storage_path", image_storage)
        monkeypatch.setattr(settings, "file_cleanup_min_file_age_minutes", 30)
        monkeypatch.setattr(settings, "file_cleanup_dry_run", False)

        product_type = await ProductTypeFactory.create_async(session=db_session)
        product = await ProductFactory.create_async(
            session=db_session,
            owner_id=db_superuser.id,
            product_type_id=product_type.id,
        )

        await db_session.execute(
            cast(
                "Any",
                text(
                    """
                    INSERT INTO image (id, filename, file, parent_type, parent_id)
                    VALUES (:id, :filename, :file, :parent_type, :parent_id)
                    """
                ),
            ),
            params={
                "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
                "filename": "kept.jpg",
                "file": "kept.jpg",
                "parent_type": MediaParentType.PRODUCT.name,
                "parent_id": product.id,
            },
        )
        await db_session.commit()

        def session_factory() -> AsyncSession:
            return db_session

        manager = FileCleanupManager(session_factory)
        await manager.run_once()

        assert referenced_image.exists()
        assert referenced_thumbnail.exists()
        assert not orphan_thumbnail.exists()
