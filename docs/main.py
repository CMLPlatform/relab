"""FastAPI server for serving static documentation."""

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Documentation Server")

# Path to the built documentation
SITE_DIR = Path(__file__).parent / "site"


@app.get("/health")
def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.exception_handler(404)
async def custom_404_handler(_: Request, __: Exception) -> FileResponse:
    """Custom 404 handler that serves the 404.html page."""
    return FileResponse(SITE_DIR / "404.html", status_code=404)


# Serve the 'site' directory as static files
app.mount("/", StaticFiles(directory=SITE_DIR, html=True), name="static")
