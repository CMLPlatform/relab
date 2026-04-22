"""Unit tests for password validation helpers."""
# spell-checker: ignore hibp

from __future__ import annotations

from unittest.mock import AsyncMock, Mock

from app.api.auth.services.password_validator import check_pwned_password


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
