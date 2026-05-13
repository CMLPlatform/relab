"""Unit tests for the common-password fallback refresh script."""
# spell-checker: ignore sec passphrase
# ruff: noqa: SLF001 # Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from scripts.maintenance import refresh_common_passwords as refresh_script

if TYPE_CHECKING:
    from pathlib import Path

    from pytest_mock import MockerFixture


class TestRefreshCommonPasswordsScript:
    """Verify common-password refresh behavior."""

    def test_normalize_passwords_filters_policy_length_and_deduplicates_in_order(self) -> None:
        """Normalization should preserve source rank while keeping only policy-sized entries."""
        raw_text = "\n".join(
            [
                "short",
                "Password12345",
                "password12345",
                "correct horse battery staple",
                "x" * 129,
                "# comment",
            ]
        )

        passwords = refresh_script._normalize_passwords(raw_text, target_count=2)

        assert passwords == ["password12345", "correct horse battery staple"]

    def test_normalize_passwords_fails_when_source_has_too_few_entries(self) -> None:
        """A refreshed file below the ASVS target count should fail fast."""
        with pytest.raises(ValueError, match="fewer than"):
            refresh_script._normalize_passwords("only-one-long-password", target_count=2)

    async def test_refresh_common_passwords_writes_rendered_file(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mocker: MockerFixture
    ) -> None:
        """Refreshing should download, filter, and write a provenance-bearing fallback file."""
        output_path = tmp_path / "auth" / "common_passwords_3000.txt"
        mock_response = mocker.Mock()
        mock_response.text = "too-short\nPassword12345\nCorrect Horse Passphrase\nanother-long-one"
        mock_response.raise_for_status.return_value = None

        client_mock = mocker.AsyncMock()
        client_mock.get.return_value = mock_response
        client_mock.__aenter__.return_value = client_mock
        client_mock.__aexit__.return_value = None

        monkeypatch.setattr(refresh_script.httpx, "AsyncClient", mocker.Mock(return_value=client_mock))
        to_thread_mock = mocker.patch.object(
            refresh_script.asyncio,
            "to_thread",
            side_effect=lambda func, *args, **kwargs: func(*args, **kwargs),
        )

        exit_code = await refresh_script.refresh_common_passwords(output_path, target_count=3)

        assert exit_code == 0
        to_thread_mock.assert_awaited_once()
        assert output_path.read_text(encoding="utf-8") == (
            "# Curated local fallback for ASVS 5.0 V6.2.4 common-password validation.\n"
            f"# Source: {refresh_script.COMMON_PASSWORDS_SOURCE_URL}\n"
            "# Filter: NFC + casefold + first 3 unique entries with length 12..128.\n"
            "# Count: 3\n"
            "# Refresh from upstream with: `just refresh-common-passwords`\n"
            "password12345\n"
            "correct horse passphrase\n"
            "another-long-one\n"
        )
        client_mock.get.assert_awaited_once_with(refresh_script.COMMON_PASSWORDS_SOURCE_URL, timeout=20.0)
