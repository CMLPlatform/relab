"""Privacy and redaction utilities for the platform."""

from sqlalchemy import inspect
from sqlalchemy.exc import NoInspectionAvailable
from sqlalchemy.orm.base import ATTR_EMPTY

from app.api.auth.models import User
from app.api.data_collection.models.product import Product

VISIBILITY_PUBLIC = "public"
VISIBILITY_COMMUNITY = "community"
VISIBILITY_PRIVATE = "private"


def should_redact_owner(owner: User, viewer: User | None) -> bool:
    """Return True when the owner's identity should be hidden from the viewer.

    Rules:
    - Admins always see everything.
    - public  → never redact.
    - community → redact only for unauthenticated guests.
    - private   → redact for everyone except the owner themselves.
    """
    if viewer and viewer.is_superuser:
        return False

    preferences: dict = owner.preferences or {}
    visibility: str = preferences.get("profile_visibility", VISIBILITY_PUBLIC)

    if visibility == VISIBILITY_PRIVATE:
        return not viewer or viewer.id != owner.id
    if visibility == VISIBILITY_COMMUNITY:
        return viewer is None
    return False  # public


def redact_product_owner(product: Product, viewer: User | None) -> None:
    """Null out the owner relationship on *product* when privacy rules require it.

    Operates in-place on the ORM model **before** Pydantic serialisation so
    that ``owner_username`` (a @property that reads ``owner.username``) and
    ``owner_id`` both become ``None`` naturally when the schema is built.
    """
    try:
        product_state = inspect(product)
    except NoInspectionAvailable:
        return

    owner = product_state.attrs[Product.owner.key].loaded_value
    if owner is ATTR_EMPTY:
        return
    if owner and should_redact_owner(owner, viewer):
        product.owner = None
        product.owner_id = None
