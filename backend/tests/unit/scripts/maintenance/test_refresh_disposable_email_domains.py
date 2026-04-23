"""Unit tests for the disposable-email fallback refresh script."""
# spell-checker: ignore mailinator, nmailinator
# ruff: noqa: SLF001 # Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from scripts.maintenance import refresh_disposable_email_domains as refresh_script

if TYPE_CHECKING:
    from pathlib import Path

    from pytest_mock import MockerFixture


class TestRefreshDisposableEmailDomainsScript:
    """Verify disposable-domain refresh behavior."""

    def test_normalize_domains_deduplicates_and_sorts(self) -> None:
        """Normalization should strip, lowercase, deduplicate, and sort entries."""
        raw_text = "Temp-Mail.org\nmailinator.com\n# comment\nTEMP-mail.org\n\n"

        domains = refresh_script._normalize_domains(raw_text)

        assert domains == ["mailinator.com", "temp-mail.org"]

    def test_validate_rendered_size_warns_before_hard_limit(self, mocker: MockerFixture) -> None:
        """Large but allowed files should emit a warning."""
        warning_mock = mocker.patch.object(refresh_script.logger, "warning")
        content = "a" * (refresh_script._WARN_FILE_SIZE_BYTES + 1)

        refresh_script._validate_rendered_size(content)

        warning_mock.assert_called_once()

    def test_validate_rendered_size_raises_above_hard_limit(self) -> None:
        """Oversized files should fail fast."""
        content = "a" * (refresh_script._MAX_FILE_SIZE_BYTES + 1)

        with pytest.raises(ValueError, match="hard limit"):
            refresh_script._validate_rendered_size(content)

    async def test_refresh_disposable_domains_writes_rendered_file(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mocker: MockerFixture
    ) -> None:
        """Refreshing should download, normalize, and write the fallback file."""
        output_path = tmp_path / "auth" / "domains.txt"
        mock_response = mocker.Mock()
        mock_response.text = "Temp-Mail.org\nmailinator.com\nTEMP-mail.org\n"
        mock_response.raise_for_status.return_value = None

        client_mock = mocker.AsyncMock()
        client_mock.get.return_value = mock_response
        client_mock.__aenter__.return_value = client_mock
        client_mock.__aexit__.return_value = None

        monkeypatch.setattr(refresh_script.httpx, "AsyncClient", mocker.Mock(return_value=client_mock))

        exit_code = await refresh_script.refresh_disposable_domains(output_path)

        assert exit_code == 0
        assert output_path.exists()
        assert output_path.read_text(encoding="utf-8") == (
            "# Curated local fallback for disposable email validation.\n"
            "# Refresh from upstream with: `just refresh-disposable-email-domains`\n"
            "mailinator.com\n"
            "temp-mail.org\n"
        )
        client_mock.get.assert_awaited_once_with(refresh_script.DISPOSABLE_DOMAINS_URL, timeout=20.0)
