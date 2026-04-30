"""Unit tests for password validation helpers."""
# spell-checker: ignore alicewonder, blocklisted, elevenchars, hibp

from __future__ import annotations

import hashlib
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi_users import InvalidPasswordException
from httpx import HTTPError
from pydantic import SecretStr

from app.api.auth.services.password_validator import (
    check_pwned_password,
    validate_password,
)


async def test_check_pwned_password_uses_hibp_range_prefix_and_matches_suffix() -> None:
    """The HIBP breach lookup should use the SHA-1 range API and parse the matching suffix."""
    http_client = AsyncMock()
    response = Mock()
    response.text = "1E4C9B93F3F0682250B6CF8331B7EE68FD8:42\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1"
    response.raise_for_status = Mock()
    http_client.get.return_value = response

    breach_count = await check_pwned_password("password", http_client)

    assert breach_count == 42
    http_client.get.assert_awaited_once_with(
        "https://api.pwnedpasswords.com/range/5BAA6",
        headers={"Add-Padding": "true"},
        timeout=5.0,
    )


async def test_check_pwned_password_returns_zero_when_not_found() -> None:
    """A suffix not present in the range response means not breached."""
    http_client = AsyncMock()
    response = Mock()
    response.text = "0000000000000000000000000000000000A:1\n0000000000000000000000000000000000B:2"
    response.raise_for_status = Mock()
    http_client.get.return_value = response

    assert await check_pwned_password("password", http_client) == 0


async def test_check_pwned_password_fails_open_on_http_error() -> None:
    """If HIBP is unreachable we must not block registrations (fail-open policy)."""
    http_client = AsyncMock()
    http_client.get.side_effect = HTTPError("unreachable")

    assert await check_pwned_password("password", http_client) == 0


# ── validate_password ────────────────────────────────────────────────────────


_STRONG = "correct-horse-battery-staple-v42"  # test fixture, not a real secret


async def test_validate_password_accepts_strong() -> None:
    """A long passphrase that meets all criteria should be accepted without exception."""
    await validate_password(_STRONG, email="alice@example.com", skip_breach_check=True)


async def test_validate_password_accepts_secretstr() -> None:
    """validate_password should accept SecretStr and unwrap it for validation."""
    await validate_password(SecretStr(_STRONG), email="alice@example.com", skip_breach_check=True)


async def test_validate_password_rejects_short() -> None:
    """The password must be at least 12 characters long."""
    with pytest.raises(InvalidPasswordException) as exc:
        await validate_password("elevenchars", email="a@b.c", skip_breach_check=True)
    assert "12 characters" in exc.value.reason


async def test_validate_password_rejects_email_in_password() -> None:
    """The password must not contain the e-mail address as a substring."""
    with pytest.raises(InvalidPasswordException) as exc:
        await validate_password(
            "prefix-alice@example.com-suffix",
            email="alice@example.com",
            skip_breach_check=True,
        )
    assert "e-mail" in exc.value.reason


async def test_validate_password_rejects_email_local_part_case_insensitively() -> None:
    """The password must not contain the e-mail local-part."""
    with pytest.raises(InvalidPasswordException) as exc:
        await validate_password(
            "prefix-ALICEWONDER-suffix",
            email="alicewonder@example.com",
            skip_breach_check=True,
        )
    assert "e-mail" in exc.value.reason


async def test_validate_password_rejects_username_in_password() -> None:
    """The password must not contain the username as a substring."""
    with pytest.raises(InvalidPasswordException) as exc:
        await validate_password(
            "xxxx-alicewonder-xxxx",
            email="a@b.c",
            username="alicewonder",
            skip_breach_check=True,
        )
    assert "username" in exc.value.reason


async def test_validate_password_rejects_username_case_insensitively() -> None:
    """The username comparison should not be bypassed with case differences."""
    with pytest.raises(InvalidPasswordException) as exc:
        await validate_password(
            "prefix-ALICEWONDER-suffix",
            email="a@b.c",
            username="alicewonder",
            skip_breach_check=True,
        )
    assert "username" in exc.value.reason


async def test_validate_password_rejects_blocklisted_passwords() -> None:
    """Common and project-specific blocklisted passwords should be rejected."""
    for password in ("password12345", "relab-password"):
        with pytest.raises(InvalidPasswordException) as exc:
            await validate_password(password, email="a@b.c", skip_breach_check=True)
        assert "too common" in exc.value.reason


async def test_validate_password_normalizes_unicode_before_checks() -> None:
    """NFC-equivalent values should be compared consistently."""
    decomposed_username = "cafe\u0301"
    with pytest.raises(InvalidPasswordException) as exc:
        await validate_password(
            "prefix-caf\u00e9-suffix",
            email="a@b.c",
            username=decomposed_username,
            skip_breach_check=True,
        )
    assert "username" in exc.value.reason


async def test_validate_password_rejects_weak_password_with_clear_reason() -> None:
    """A well-known weak password must be rejected with a local blocklist reason."""
    with pytest.raises(InvalidPasswordException) as exc:
        await validate_password("password12345", email="a@b.c", skip_breach_check=True)
    assert "too common" in exc.value.reason


async def test_validate_password_rejects_breached() -> None:
    """When HIBP reports the password as breached the call must raise."""
    http_client = AsyncMock()
    response = Mock()
    # Craft a response that echoes back the test password's SHA-1 suffix so the
    # range-match path fires.
    pwd = "correct-horse-battery-staple-pwnd-42"
    sha1 = hashlib.sha1(pwd.encode(), usedforsecurity=False).hexdigest().upper()
    response.text = f"{sha1[5:]}:9999"
    response.raise_for_status = Mock()
    http_client.get.return_value = response

    with pytest.raises(InvalidPasswordException) as exc:
        await validate_password(pwd, email="alice@example.com", http_client=http_client, skip_breach_check=False)
    assert "data breach" in exc.value.reason


async def test_validate_password_skips_breach_check_when_disabled() -> None:
    """skip_breach_check=True must not invoke the http client."""
    http_client = AsyncMock()
    await validate_password(_STRONG, email="a@b.c", http_client=http_client, skip_breach_check=True)
    http_client.get.assert_not_called()
