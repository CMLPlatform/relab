"""Registration, login, logout, and auth rate-limit tests."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import status
from fastapi_users.exceptions import UserAlreadyExists
from sqlalchemy import select

from app.api.auth.exceptions import DisposableEmailError, UserNameAlreadyExistsError
from app.api.auth.models import User
from app.api.auth.schemas import UserCreate
from app.api.auth.services import mfa_service
from app.api.auth.services.auth_backends import AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME
from app.api.auth.services.user_database import UserDatabaseAsync
from app.api.common.audit import AuditAction

from .shared import (
    COOKIE_EMAIL,
    COOKIE_USERNAME,
    DIFFERENT_EMAIL,
    DISPOSABLE_EMAIL,
    DUPLICATE_EMAIL,
    EXISTING_USERNAME,
    INVALID_EMAIL,
    INVALID_PASSWORD,
    TEST_EMAIL,
    TEST_PASSWORD,
    TEST_USERNAME,
    UNIQUE_USERNAME,
    WEAK_PASSWORD,
    hash_test_password,
    login_session,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncSession


pytestmark = pytest.mark.api


async def create_active_user(
    db_session: AsyncSession,
    *,
    email: str,
    username: str,
    password: str = TEST_PASSWORD,
    **overrides: object,
) -> User:
    """Create an active verified user for auth integration tests."""
    user = User(
        email=email,
        username=username,
        hashed_password=hash_test_password(password),
        is_active=True,
        is_verified=True,
        **overrides,
    )
    db_session.add(user)
    await db_session.commit()
    return user


async def login_bearer_and_authorize(
    api_client: AsyncClient,
    *,
    email: str,
    password: str = TEST_PASSWORD,
) -> dict[str, object]:
    """Log in with bearer auth and attach the access token to the client."""
    response = await api_client.post(
        "/v1/auth/bearer/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    data = dict(response.json())
    api_client.headers["Authorization"] = f"Bearer {data['access_token']}"
    return data


async def start_totp_setup(api_client: AsyncClient) -> dict[str, str]:
    """Start TOTP setup and return the response payload."""
    response = await api_client.post("/v1/auth/mfa/totp/setup")
    assert response.status_code == status.HTTP_200_OK, response.text
    return dict(response.json())


class TestRegistrationEndpoint:
    """Tests for the /auth/register endpoint."""

    async def test_register_success(self, api_client: AsyncClient) -> None:
        """Test successful user registration."""
        user_data = {"email": TEST_EMAIL, "password": TEST_PASSWORD, "username": TEST_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["email"] == user_data["email"]
        assert data["username"] == user_data["username"]
        assert "password" not in data
        assert "hashed_password" not in data

    async def test_register_requires_username(self, api_client: AsyncClient) -> None:
        """Password registration requires an explicit username."""
        user_data = {"email": "missing-username@example.com", "password": TEST_PASSWORD}

        response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        assert "username" in response.text

    async def test_register_duplicate_email(self, api_client: AsyncClient) -> None:
        """Test registering with a duplicate email."""
        user_data = {"email": DUPLICATE_EMAIL, "password": TEST_PASSWORD, "username": UNIQUE_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await api_client.post("/v1/auth/register", json=user_data)

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )

            with patch("app.api.auth.dependencies.get_user_manager") as mock_get_manager:
                mock_manager = AsyncMock()
                mock_manager.create.side_effect = UserAlreadyExists()

                async def get_manager() -> AsyncGenerator[AsyncMock]:
                    yield mock_manager

                mock_get_manager.return_value = get_manager()
                response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already exists" in response.json()["detail"].lower()

    async def test_register_duplicate_canonical_email(self, api_client: AsyncClient) -> None:
        """Canonical-equivalent email registrations should collide."""
        first_user = {"email": "CaseSensitive@Example.com", "password": TEST_PASSWORD, "username": "case_first"}
        second_user = {"email": "casesensitive@example.com", "password": TEST_PASSWORD, "username": "case_second"}

        first_response = await api_client.post("/v1/auth/register", json=first_user)
        second_response = await api_client.post("/v1/auth/register", json=second_user)

        assert first_response.status_code == status.HTTP_201_CREATED
        assert second_response.status_code == status.HTTP_409_CONFLICT

    async def test_register_duplicate_username(self, api_client: AsyncClient) -> None:
        """Test registering with a duplicate username."""
        user_data = {"email": DIFFERENT_EMAIL, "password": TEST_PASSWORD, "username": EXISTING_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.side_effect = UserNameAlreadyExistsError(user_data["username"])
            response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "username" in response.json()["detail"].lower()

    async def test_register_disposable_email(self, api_client: AsyncClient) -> None:
        """Test registering with a disposable email."""
        user_data = {"email": DISPOSABLE_EMAIL, "password": TEST_PASSWORD, "username": "tempuser"}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.side_effect = DisposableEmailError(user_data["email"])
            response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "disposable" in response.json()["detail"].lower()
        assert user_data["email"] not in response.json()["detail"]

    async def test_register_weak_password(self, api_client: AsyncClient) -> None:
        """Test registering with a weak password."""
        user_data = {"email": "user@example.com", "password": WEAK_PASSWORD, "username": "user"}
        response = await api_client.post("/v1/auth/register", json=user_data)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    async def test_register_uses_injected_request_session(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Registration should use the FastAPI-injected test session for user lookups."""
        user_data = {
            "email": "session-register@example.com",
            "password": TEST_PASSWORD,
            "username": "session_register",
        }

        original_get_by_email = UserDatabaseAsync.get_by_email

        async def asserted_get_by_email(self: UserDatabaseAsync, email: str) -> object | None:
            assert self.session is db_session
            return await original_get_by_email(self, email)

        monkeypatch.setattr(UserDatabaseAsync, "get_by_email", asserted_get_by_email)

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_201_CREATED

    @pytest.mark.parametrize("field_name", ["is_superuser", "is_active", "is_verified"])
    async def test_register_rejects_privileged_fields(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
        field_name: str,
    ) -> None:
        """Registration must reject user-control fields instead of relying on safe-mode filtering."""
        email = f"{field_name.replace('_', '-')}@example.com"
        response = await api_client.post(
            "/v1/auth/register",
            json={
                "email": email,
                "password": TEST_PASSWORD,
                "username": f"mass_assignment_{field_name}",
                field_name: True,
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        assert field_name in response.text
        user = await db_session.scalar(select(User).where(User.email == email))
        assert user is None


class TestLoginEndpoint:
    """Tests for FastAPI-Users login endpoints."""

    async def test_bearer_login_without_totp_returns_tokens(self, api_client: AsyncClient) -> None:
        """Bearer login should return tokens when the account has not enabled MFA."""
        user_data = {
            "email": "bearer-path@example.com",
            "password": TEST_PASSWORD,
            "username": "bearer_path_user",
        }
        await api_client.post("/v1/auth/register", json=user_data)

        response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user_data["email"], "password": user_data["password"]},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["token_type"] == "bearer"
        assert data["access_token"]
        assert data["refresh_token"]
        assert "mfa_token" not in data
        assert "refresh_token" not in response.cookies

    async def test_bearer_login_without_totp_emits_success_event(self, api_client: AsyncClient) -> None:
        """Successful bearer login should emit a structured auth event."""
        user_data = {
            "email": "bearer-event@example.com",
            "password": TEST_PASSWORD,
            "username": "bearer_event_user",
        }
        await api_client.post("/v1/auth/register", json=user_data)

        with patch("app.api.auth.routers.auth.audit_event") as log_event:
            response = await api_client.post(
                "/v1/auth/bearer/login",
                data={"username": user_data["email"], "password": user_data["password"]},
            )

        assert response.status_code == status.HTTP_200_OK
        assert any(call.args[1] == AuditAction.LOGIN_SUCCESS for call in log_event.call_args_list)

    async def test_authenticated_totp_setup_enables_mfa(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """An authenticated user should be able to opt in to TOTP MFA."""
        user = await create_active_user(
            db_session,
            email="totp-opt-in@example.com",
            username="totp_opt_in_user",
        )
        await login_bearer_and_authorize(api_client, email=user.email)

        setup_data = await start_totp_setup(api_client)
        code = mfa_service.generate_totp_code(setup_data["secret"])

        confirm_response = await api_client.post(
            "/v1/auth/mfa/totp/confirm",
            json={"setup_token": setup_data["setup_token"], "code": code},
        )

        assert confirm_response.status_code == status.HTTP_204_NO_CONTENT

    async def test_totp_setup_confirm_requires_authentication(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
        mock_redis_dependency: Redis,
    ) -> None:
        """A valid setup token should not be confirmable without an authenticated user."""
        user = await create_active_user(
            db_session,
            email="totp-confirm-auth@example.com",
            username="totp_confirm_auth",
        )
        setup_token = await mfa_service.create_totp_setup(
            mock_redis_dependency,
            user_id=user.id,
            secret=mfa_service.generate_totp_secret(),
        )
        setup = await mfa_service.get_totp_setup(mock_redis_dependency, setup_token)

        confirm_response = await api_client.post(
            "/v1/auth/mfa/totp/confirm",
            json={
                "setup_token": setup_token,
                "code": mfa_service.generate_totp_code(setup.secret),
            },
        )

        assert confirm_response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_totp_setup_confirm_rejects_another_users_setup_token(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """A signed-in user should not be able to confirm another user's setup token."""
        first_user = await create_active_user(
            db_session,
            email="totp-owner@example.com",
            username="totp_owner",
        )
        second_user = await create_active_user(
            db_session,
            email="totp-other@example.com",
            username="totp_other",
        )

        await login_bearer_and_authorize(api_client, email=first_user.email)
        first_setup = await start_totp_setup(api_client)

        await login_bearer_and_authorize(api_client, email=second_user.email)

        confirm_response = await api_client.post(
            "/v1/auth/mfa/totp/confirm",
            json={
                "setup_token": first_setup["setup_token"],
                "code": mfa_service.generate_totp_code(first_setup["secret"]),
            },
        )

        assert confirm_response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_totp_setup_retry_allows_valid_code_after_invalid_code(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """An invalid setup code should not consume the setup token."""
        user = await create_active_user(
            db_session,
            email="totp-retry@example.com",
            username="totp_retry_user",
        )
        await login_bearer_and_authorize(api_client, email=user.email)
        setup_data = await start_totp_setup(api_client)
        valid_code = mfa_service.generate_totp_code(setup_data["secret"])
        invalid_code = "000000" if valid_code != "000000" else "000001"

        invalid_response = await api_client.post(
            "/v1/auth/mfa/totp/confirm",
            json={"setup_token": setup_data["setup_token"], "code": invalid_code},
        )
        valid_response = await api_client.post(
            "/v1/auth/mfa/totp/confirm",
            json={
                "setup_token": setup_data["setup_token"],
                "code": valid_code,
            },
        )

        assert invalid_response.status_code == status.HTTP_401_UNAUTHORIZED
        assert valid_response.status_code == status.HTTP_204_NO_CONTENT

    async def test_totp_setup_start_can_be_retried_before_confirmation(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """Starting setup twice should not consume the first-factor MFA token."""
        user = await create_active_user(
            db_session,
            email="remount@example.com",
            username="remount_user",
        )
        await login_bearer_and_authorize(api_client, email=user.email)

        first_setup = await api_client.post("/v1/auth/mfa/totp/setup")
        second_setup = await api_client.post("/v1/auth/mfa/totp/setup")

        assert first_setup.status_code == status.HTTP_200_OK
        assert second_setup.status_code == status.HTTP_200_OK
        assert first_setup.json()["setup_token"]
        assert second_setup.json()["setup_token"]

    async def test_stale_setup_token_cannot_overwrite_confirmed_totp(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """Older setup tokens from repeated setup starts must not overwrite a confirmed enrollment."""
        user = await create_active_user(
            db_session,
            email="stale-setup@example.com",
            username="stale_setup_user",
        )
        await login_bearer_and_authorize(api_client, email=user.email)
        first_setup = await start_totp_setup(api_client)
        second_setup = await start_totp_setup(api_client)
        second_confirm = await api_client.post(
            "/v1/auth/mfa/totp/confirm",
            json={
                "setup_token": second_setup["setup_token"],
                "code": mfa_service.generate_totp_code(second_setup["secret"]),
            },
        )

        stale_confirm = await api_client.post(
            "/v1/auth/mfa/totp/confirm",
            json={
                "setup_token": first_setup["setup_token"],
                "code": mfa_service.generate_totp_code(first_setup["secret"]),
            },
        )

        assert second_confirm.status_code == status.HTTP_204_NO_CONTENT
        assert stale_confirm.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_bearer_login_with_enabled_totp_requires_challenge(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """Users with enabled TOTP must complete an MFA challenge before tokens are issued."""
        secret = mfa_service.generate_totp_secret()
        user = await create_active_user(
            db_session,
            email="mfa-enabled@example.com",
            username="mfa_enabled",
            mfa_enabled=True,
            mfa_totp_secret=secret,
        )

        response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user.email, "password": TEST_PASSWORD},
        )

        assert response.status_code == status.HTTP_202_ACCEPTED
        data = response.json()
        assert data["mfa_required"] is True
        assert "setup_required" not in data
        code = mfa_service.generate_totp_code(secret)

        challenge_response = await api_client.post(
            "/v1/auth/mfa/challenge",
            json={"mfa_token": data["mfa_token"], "code": code},
        )

        assert challenge_response.status_code == status.HTTP_200_OK
        token_data = challenge_response.json()
        assert token_data["token_type"] == "bearer"
        assert token_data["access_token"]
        assert token_data["refresh_token"]

    async def test_mfa_challenge_emits_failure_and_success_events(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """MFA challenge attempts should be visible in structured auth events."""
        secret = mfa_service.generate_totp_secret()
        user = await create_active_user(
            db_session,
            email="mfa-event@example.com",
            username="mfa_event",
            mfa_enabled=True,
            mfa_totp_secret=secret,
        )
        login_response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user.email, "password": TEST_PASSWORD},
        )
        mfa_token = login_response.json()["mfa_token"]
        valid_code = mfa_service.generate_totp_code(secret)
        invalid_code = "000000" if valid_code != "000000" else "000001"

        with patch("app.api.auth.routers.mfa.audit_event") as log_event:
            invalid_response = await api_client.post(
                "/v1/auth/mfa/challenge",
                json={"mfa_token": mfa_token, "code": invalid_code},
            )
            valid_response = await api_client.post(
                "/v1/auth/mfa/challenge",
                json={"mfa_token": mfa_token, "code": valid_code},
            )

        assert invalid_response.status_code == status.HTTP_401_UNAUTHORIZED
        assert valid_response.status_code == status.HTTP_200_OK
        actions = [call.args[1] for call in log_event.call_args_list]
        assert AuditAction.MFA_FAILURE in actions
        assert AuditAction.MFA_SUCCESS in actions

    async def test_invalid_totp_challenge_does_not_consume_login_token(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """A mistyped TOTP challenge should allow retrying with the same login challenge."""
        secret = mfa_service.generate_totp_secret()
        user = await create_active_user(
            db_session,
            email="mfa-retry@example.com",
            username="mfa_retry",
            mfa_enabled=True,
            mfa_totp_secret=secret,
        )
        login_response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user.email, "password": TEST_PASSWORD},
        )
        mfa_token = login_response.json()["mfa_token"]
        valid_code = mfa_service.generate_totp_code(secret)
        invalid_code = "000000" if valid_code != "000000" else "000001"

        invalid_response = await api_client.post(
            "/v1/auth/mfa/challenge",
            json={"mfa_token": mfa_token, "code": invalid_code},
        )
        valid_response = await api_client.post(
            "/v1/auth/mfa/challenge",
            json={"mfa_token": mfa_token, "code": valid_code},
        )

        assert invalid_response.status_code == status.HTTP_401_UNAUTHORIZED
        assert valid_response.status_code == status.HTTP_200_OK

    async def test_enabled_totp_user_cannot_start_new_setup(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """Users with enabled TOTP must not be able to create fresh setup material."""
        user = await create_active_user(
            db_session,
            email="mfa-setup-blocked@example.com",
            username="mfa_setup_blocked",
        )

        await login_bearer_and_authorize(api_client, email=user.email)
        user.mfa_enabled = True
        user.mfa_totp_secret = mfa_service.generate_totp_secret()
        db_session.add(user)
        await db_session.commit()

        setup_response = await api_client.post("/v1/auth/mfa/totp/setup")

        assert setup_response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_login_with_email_alias(self, api_client: AsyncClient) -> None:
        """Test logging in through the canonical v1 login route."""
        user_data = {"email": "alias@example.com", "password": TEST_PASSWORD, "username": "alias_user"}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await api_client.post("/v1/auth/register", json=user_data)

        response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user_data["email"], "password": user_data["password"]},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["access_token"]

    async def test_login_with_canonical_email_equivalent(self, api_client: AsyncClient) -> None:
        """Login should compare emails through the shared canonical policy."""
        user_data = {"email": "Login.Case@Example.com", "password": TEST_PASSWORD, "username": "login_case"}

        response = await api_client.post("/v1/auth/register", json=user_data)
        assert response.status_code == status.HTTP_201_CREATED

        login_response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": "login.case@example.com", "password": user_data["password"]},
        )

        assert login_response.status_code == status.HTTP_200_OK
        assert login_response.json()["access_token"]

    async def test_bearer_login_invalid_credentials(self, api_client: AsyncClient) -> None:
        """Test logging in with invalid credentials."""
        with patch("app.api.auth.routers.auth.audit_event") as log_event:
            response = await api_client.post(
                "/v1/auth/bearer/login",
                data={"username": INVALID_EMAIL, "password": INVALID_PASSWORD},
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        log_event.assert_any_call(
            None,
            AuditAction.LOGIN_FAILURE,
            "auth",
            "credentials",
            outcome="denied",
            transport="bearer",
            reason="bad_credentials",
        )

    async def test_session_cookie_login(self, api_client: AsyncClient) -> None:
        """Test logging in with email and password to get session cookies."""
        user_data = {"email": COOKIE_EMAIL, "password": TEST_PASSWORD, "username": COOKIE_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await api_client.post("/v1/auth/register", json=user_data)

        with patch("app.api.auth.routers.auth.audit_event") as log_event:
            await login_session(api_client, email=user_data["email"], password=user_data["password"])

        assert api_client.cookies
        assert any(call.args[1] == AuditAction.LOGIN_SUCCESS for call in log_event.call_args_list)

    async def test_session_logout_clears_browser_storage(self, api_client: AsyncClient) -> None:
        """Session logout should clear cookies and browser-side cached session data."""
        user_data = {
            "email": "session-logout-cleanup@example.com",
            "password": TEST_PASSWORD,
            "username": "session_logout_cleanup",
        }
        await api_client.post("/v1/auth/register", json=user_data)
        await login_session(api_client, email=user_data["email"], password=user_data["password"])

        response = await api_client.post("/v1/auth/session/logout")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert response.headers["clear-site-data"] == '"cache", "cookies", "storage"'
        set_cookie_headers = response.headers.get_list("set-cookie")
        assert any(header.startswith(f"{AUTH_COOKIE_NAME}=") for header in set_cookie_headers)
        assert any(header.startswith(f"{REFRESH_COOKIE_NAME}=") for header in set_cookie_headers)

    async def test_session_logout_emits_logout_event(self, api_client: AsyncClient) -> None:
        """Session logout should emit a structured logout event."""
        user_data = {
            "email": "session-logout-event@example.com",
            "password": TEST_PASSWORD,
            "username": "session_logout_event",
        }
        await api_client.post("/v1/auth/register", json=user_data)
        await login_session(api_client, email=user_data["email"], password=user_data["password"])

        with patch("app.api.auth.routers.refresh.audit_event") as log_event:
            response = await api_client.post("/v1/auth/session/logout")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert any(call.args[1] == AuditAction.LOGOUT for call in log_event.call_args_list)

    async def test_revoke_all_sessions_emits_structured_event(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """Revoking all sessions should emit a structured auth event."""
        user = await create_active_user(
            db_session,
            email="revoke-all-event@example.com",
            username="revoke_all_event",
        )
        await login_bearer_and_authorize(api_client, email=user.email)

        with patch("app.api.auth.routers.refresh.audit_event") as log_event:
            response = await api_client.post("/v1/auth/sessions/revoke-all")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert any(call.args[1] == AuditAction.SESSIONS_REVOKED for call in log_event.call_args_list)


class TestLogoutEndpoint:
    """Tests for FastAPI-Users logout endpoints."""

    async def test_logout_unauthenticated(self, api_client: AsyncClient) -> None:
        """Test logging out without credentials."""
        response = await api_client.post("/v1/auth/bearer/logout")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_session_logout(self, api_client: AsyncClient) -> None:
        """Test logging out of session auth."""
        response = await api_client.post("/v1/auth/session/logout")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestRateLimiting:
    """Tests for rate limiting on auth endpoints."""

    async def test_login_rate_limit_disabled_in_tests(self, api_client: AsyncClient) -> None:
        """Test that the login endpoint does not enforce rate limits in the test environment."""
        responses = []
        for _ in range(10):
            response = await api_client.post(
                "/v1/auth/bearer/login",
                data={"username": INVALID_EMAIL, "password": "WrongPassword"},
            )
            responses.append(response.status_code)

        assert status.HTTP_429_TOO_MANY_REQUESTS not in responses, f"Rate limiting not disabled: {responses}"
