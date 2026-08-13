"""Tests for authentication request and response schemas."""

import uuid

import pytest
from pydantic import ValidationError

from app.api.auth.schemas import RefreshTokenRequest, UserCreate, UserRead, UserRegister, UserUpdate

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


type PublicUserSchema = type[UserCreate | UserRegister | UserUpdate]


@pytest.mark.parametrize("schema_cls", [UserCreate, UserRegister, UserUpdate])
@pytest.mark.parametrize("field_name", ["is_superuser", "is_active", "is_verified"])
def test_public_user_schemas_reject_privileged_fields(schema_cls: PublicUserSchema, field_name: str) -> None:
    """Public user payloads must not expose FastAPI-Users control fields."""
    payload = {
        "email": "test@example.com",
        "password": VALID_PASSWORD,
        "username": "public_user",
        field_name: True,
    }

    with pytest.raises(ValidationError, match=field_name):
        schema_cls.model_validate(payload)


def test_credit_in_releases_defaults_to_no_consent() -> None:
    """Being named in a published dataset release is opt-in, never assumed."""
    user = UserRead(id=uuid.uuid4(), email="test@example.com", is_active=True, is_superuser=False, is_verified=False)

    assert user.credit_in_releases is False


def test_credit_in_releases_reaches_the_user_model_on_update() -> None:
    """The consent flag has to survive create_update_dict to be persisted at all."""
    update = UserUpdate(credit_in_releases=True)

    assert update.create_update_dict()["credit_in_releases"] is True


def test_credit_in_releases_is_untouched_when_absent_from_a_patch() -> None:
    """A patch about something else must not silently rewrite the consent flag."""
    update = UserUpdate(username="alice")

    assert "credit_in_releases" not in update.create_update_dict()


@pytest.mark.parametrize("field_name", ["terms_accepted_version", "terms_accepted_at"])
def test_terms_acceptance_is_not_client_settable(field_name: str) -> None:
    """A user must not be able to PATCH themselves into having accepted the terms.

    Acceptance is the evidence behind the contributor licence grant, so it is recorded by
    the server at registration and nowhere else. Forging it through a profile update would
    manufacture exactly the proof the field exists to provide.
    """
    with pytest.raises(ValidationError, match=field_name):
        UserUpdate.model_validate({field_name: "2026-08-13T00:00:00Z" if field_name.endswith("at") else 99})


def test_terms_acceptance_is_readable_and_defaults_to_never_accepted() -> None:
    """Accounts predating acceptance tracking report null rather than a fabricated version."""
    user = UserRead(id=uuid.uuid4(), email="test@example.com", is_active=True, is_superuser=False, is_verified=False)

    assert user.terms_accepted_version is None
    assert user.terms_accepted_at is None


def test_refresh_token_request_rejects_unknown_fields() -> None:
    """Refresh-token requests should not silently accept extra client-controlled fields."""
    with pytest.raises(ValidationError, match="is_superuser"):
        RefreshTokenRequest.model_validate({"refresh_token": "token", "is_superuser": True})
