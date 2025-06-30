"""Router for image capture and retrieval."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.api.dependencies.camera_management import CameraManagerDependency
from app.api.models.images import ImageCaptureResponse
from app.core.config import settings

router = APIRouter(prefix="/images", tags=["images"])


@router.post("", status_code=201)
async def capture_image(
    camera_manager: CameraManagerDependency,
) -> ImageCaptureResponse:
    """Capture image and return metadata with URL."""
    try:
        return await camera_manager.capture_jpeg()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{image_id}")
async def get_image(image_id: str) -> FileResponse:
    """Retrieve captured image by ID."""
    image_path = settings.image_path / f"{image_id}.jpg"
    if not image_path.exists():
        raise HTTPException(status_code=404, detail=f"Image with ID {image_id} not found")
    return FileResponse(image_path, media_type="image/jpeg")
