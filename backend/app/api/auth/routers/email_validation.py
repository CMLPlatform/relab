"""Registration email validation route."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import EmailStr

from app.api.auth.runtime_dependencies import get_email_checker
from app.api.auth.services.email_checker import EmailChecker

router = APIRouter()


@router.get("/validate-email")
async def validate_email(
    email: EmailStr,
    email_checker: Annotated[EmailChecker | None, Depends(get_email_checker)],
) -> dict[str, bool | str | None]:
    """Validate email address for registration."""
    is_disposable = False
    if email_checker:
        is_disposable = await email_checker.is_disposable(email)

    return {"isValid": not is_disposable, "reason": "Please use a permanent email address" if is_disposable else None}
