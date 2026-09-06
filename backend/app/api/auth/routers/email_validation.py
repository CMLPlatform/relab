"""Registration email validation route."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr

from app.api.auth.exceptions import UNDELIVERABLE_EMAIL_MESSAGE
from app.api.auth.runtime_dependencies import get_email_checker
from app.api.auth.services.email_checker import EmailChecker
from app.api.auth.services.email_identity import has_deliverable_domain
from app.api.common.rate_limiting import limiter

router = APIRouter()

# Same shape as the sibling registration-flow limits (register.py, password_reset.py): a
# small per-minute cap on an unauthenticated, pre-account endpoint.
VALIDATE_EMAIL_RATE_LIMIT = "20/minute"


class EmailValidationRequest(BaseModel):
    """Body for the pre-registration email validation check."""

    email: EmailStr


@router.post("/validate-email", dependencies=[limiter.dependency(VALIDATE_EMAIL_RATE_LIMIT)])
async def validate_email(
    body: EmailValidationRequest,
    email_checker: Annotated[EmailChecker | None, Depends(get_email_checker)],
) -> dict[str, bool | str | None]:
    """Validate email address for registration.

    Takes the email in a POST body (not a query param) so it doesn't land in
    proxy/uvicorn access logs, matching the pairing endpoints' approach.
    """
    if email_checker and await email_checker.is_disposable(body.email):
        return {"isValid": False, "reason": "Please use a permanent email address"}

    if not await has_deliverable_domain(body.email):
        return {"isValid": False, "reason": UNDELIVERABLE_EMAIL_MESSAGE}

    return {"isValid": True, "reason": None}
