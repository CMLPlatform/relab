"""Tests for authentication request and response schemas."""
# spell-checker: ignore álîcé

import pytest
from pydantic import ValidationError

from app.api.auth.schemas import UserCreate, UserUpdate

VALID_PASSWORD = "correct-horse-battery-staple-v42"


@pytest.mark.parametrize("schema_cls", [UserCreate, UserUpdate])
def test_username_is_stripped_and_lowercased(schema_cls: type[UserCreate | UserUpdate]) -> None:
    """Username input should normalize before validation."""
    schema = schema_cls(email="test@example.com", password=VALID_PASSWORD, username="  Alice_123  ")

    assert schema.username == "alice_123"


@pytest.mark.parametrize("username", ["alice.smith", "alice-smith", "alice smith", "álîcé"])
def test_user_create_rejects_non_slug_usernames(username: str) -> None:
    """Usernames should stay URL-safe and ASCII-only."""
    with pytest.raises(ValidationError):
        UserCreate(email="test@example.com", password=VALID_PASSWORD, username=username)


def test_reserved_usernames_are_rejected_after_normalization() -> None:
    """Reserved usernames should be checked after case and whitespace normalization."""
    with pytest.raises(ValidationError, match="reserved username"):
        UserCreate(email="test@example.com", password=VALID_PASSWORD, username="  Admin  ")


@pytest.mark.parametrize("field_name", ["organization_id", "organization"])
def test_user_create_rejects_removed_organization_fields(field_name: str) -> None:
    """Organization signup fields are no longer part of the user creation schema."""
    with pytest.raises(ValidationError, match=field_name):
        UserCreate(email="test@example.com", password=VALID_PASSWORD, **{field_name: "removed"})


def test_user_update_rejects_removed_organization_id() -> None:
    """User updates can no longer change organization membership."""
    with pytest.raises(ValidationError, match="organization_id"):
        UserUpdate(organization_id="1fa85f64-5717-4562-b3fc-2c963f66afa6")
