"""Unit tests for the compile_email_templates script."""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest

from scripts.generate import compile_email_templates as compile_email_templates_script

if TYPE_CHECKING:
    from pathlib import Path

    from pytest_mock import MockerFixture


@pytest.mark.unit
class TestCompileEmailTemplatesScript:
    """Verify MJML template compilation behavior."""

    def test_compile_mjml_templates_compiles_each_template(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        mocker: MockerFixture,
    ) -> None:
        """MJML files in the source directory should be compiled into HTML files."""
        src_dir = tmp_path / "src"
        build_dir = tmp_path / "build"
        src_dir.mkdir()
        (src_dir / "welcome.mjml").write_text("<mjml>Welcome</mjml>")
        (src_dir / "goodbye.mjml").write_text("<mjml>Goodbye</mjml>")

        compile_mock = mocker.patch.object(
            compile_email_templates_script,
            "mjml_to_html",
            side_effect=[
                SimpleNamespace(html="<html>welcome</html>"),
                SimpleNamespace(html="<html>goodbye</html>"),
            ],
        )
        monkeypatch.setattr(compile_email_templates_script, "SRC_DIR", src_dir)
        monkeypatch.setattr(compile_email_templates_script, "BUILD_DIR", build_dir)

        compile_email_templates_script.compile_mjml_templates()

        assert compile_mock.call_count == 2
        assert (build_dir / "welcome.html").read_text() == "<html>welcome</html>"
        assert (build_dir / "goodbye.html").read_text() == "<html>goodbye</html>"

    def test_compile_mjml_templates_returns_early_when_source_dir_is_missing(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        mocker: MockerFixture,
    ) -> None:
        """A missing source directory should not attempt compilation."""
        error_mock = mocker.patch.object(compile_email_templates_script.logger, "error")
        compile_mock = mocker.patch.object(compile_email_templates_script, "mjml_to_html")

        monkeypatch.setattr(compile_email_templates_script, "SRC_DIR", tmp_path / "missing")
        monkeypatch.setattr(compile_email_templates_script, "BUILD_DIR", tmp_path / "build")

        compile_email_templates_script.compile_mjml_templates()

        error_mock.assert_called_once()
        compile_mock.assert_not_called()

    def test_main_delegates_to_compile_function(self, mocker: MockerFixture) -> None:
        """The CLI entrypoint should call the compilation function."""
        compile_mock = mocker.patch.object(compile_email_templates_script, "compile_mjml_templates")

        compile_email_templates_script.main()

        compile_mock.assert_called_once_with()
