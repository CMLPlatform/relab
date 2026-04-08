"""CRUD operations for video models."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.persistence import commit_and_refresh, delete_and_commit, update_and_commit
from app.api.common.crud.utils import get_model_or_404
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Video
from app.api.file_storage.schemas import VideoCreate, VideoCreateWithinProduct, VideoUpdate, VideoUpdateWithinProduct


async def create_video(
    db: AsyncSession,
    video: VideoCreate | VideoCreateWithinProduct,
    product_id: int | None = None,
    *,
    commit: bool = True,
) -> Video:
    """Create a new video in the database."""
    if isinstance(video, VideoCreate):
        product_id = video.product_id
    if product_id is None:
        err_msg = "Product ID is required."
        raise ValueError(err_msg)
    await get_model_or_404(db, Product, product_id)

    db_video = Video(
        **video.model_dump(exclude={"product_id"}),
        product_id=product_id,
    )
    db.add(db_video)

    if commit:
        return await commit_and_refresh(db, db_video, add_before_commit=False)
    await db.flush()
    return db_video


async def update_video(db: AsyncSession, video_id: int, video: VideoUpdate | VideoUpdateWithinProduct) -> Video:
    """Update an existing video in the database."""
    db_video = await get_model_or_404(db, Video, video_id)
    return await update_and_commit(db, db_video, video)


async def delete_video(db: AsyncSession, video_id: int) -> None:
    """Delete a video from the database."""
    db_video = await get_model_or_404(db, Video, video_id)
    await delete_and_commit(db, db_video)
