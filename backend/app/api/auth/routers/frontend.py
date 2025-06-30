"""Frontend routers for the landing page, and user login, registration, and verification."""

from typing import Annotated

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.api.admin.config import settings as admin_settings
from app.api.auth.dependencies import OptionalCurrentActiveUserDep
from app.core.config import settings as core_settings

# Include Jinja templates
templates = Jinja2Templates(directory=core_settings.templates_path)

# Initialize the landing page router
router = APIRouter(include_in_schema=False)


@router.get("/", response_class=HTMLResponse)
async def index(
    request: Request,
    user: OptionalCurrentActiveUserDep,
) -> HTMLResponse:
    """Render the landing page."""
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "user": user,
            "show_full_docs": user.is_superuser if user else False,
            "frontend_url": core_settings.frontend_url,
            "admin_path": admin_settings.admin_base_url,
        },
    )


@router.get(
    "/login",
    response_class=HTMLResponse,
    responses={200: {"description": "Login page"}, 302: {"description": "Redirect to home if already logged in"}},
    response_model=None,
)
async def login_page(
    request: Request,
    user: OptionalCurrentActiveUserDep,
    *,
    next_page: Annotated[str | None, Query(description="Redirect URL after login", alias="next")] = None,
) -> Response:
    """Render the login page."""
    if user:
        return RedirectResponse(url=(next_page or router.url_path_for("index")), status_code=302)

    return templates.TemplateResponse("login.html", {"request": request, "next": next_page})
