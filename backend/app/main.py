"""Main application module for the Reverse Engineering Lab - Data collection API.

This module initializes the FastAPI application, sets up the API routes,
mounts static and upload directories, and initializes the admin interface.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi_pagination import add_pagination

from app.api.admin.main import init_admin
from app.api.common.routers.exceptions import register_exception_handlers
from app.api.common.routers.main import router
from app.api.common.routers.openapi import init_openapi_docs
from app.core.config import settings
from app.core.database import async_engine
from app.core.utils.custom_logging import setup_logging

# Initialize logging
setup_logging()

# Initialize FastAPI application
app = FastAPI(
    openapi_url=None,
    docs_url=None,
    redoc_url=None,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Content-Language",
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-CSRF-Token",
    ],
)

# Include main API routes
app.include_router(router)

# Initialize OpenAPI documentation
init_openapi_docs(app)

# Initialize admin interface
admin = init_admin(app, async_engine)

# Mount local file storage
app.mount("/uploads", StaticFiles(directory=settings.uploads_path), name="uploads")
app.mount("/static", StaticFiles(directory=settings.static_files_path), name="static")

# Initialize exception handling
register_exception_handlers(app)

# Add pagination
add_pagination(app)
