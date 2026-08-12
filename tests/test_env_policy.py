"""Unit tests for the pure decision logic in scripts/env_policy.py."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

import env_policy
import pytest

if TYPE_CHECKING:
    from collections.abc import Callable

REAL_INVENTORY = env_policy.load_secret_inventory()


def write_toml(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "variables.toml"
    path.write_text(body, encoding="utf-8")
    return path


def inventory(required: set[str], optional: set[str]) -> dict[str, Any]:
    return {
        "runtime_secret_files": required | optional,
        "optional_secret_files": optional,
        "infisical_path_template": "/relab/{env}/{name}",
    }


# --- placeholder detection -------------------------------------------------


@pytest.mark.parametrize("prefix", ["replace-me-", "placeholder-"])
def test_required_placeholder_is_rejected_for_every_known_prefix(prefix: str) -> None:
    with pytest.raises(AssertionError, match="placeholder secret remains"):
        env_policy.assert_secret_value_is_usable(
            "prod", "auth_token_secret", f"{prefix}prod-auth_token_secret", is_optional=False
        )


def test_placeholder_from_another_env_is_still_rejected() -> None:
    # A staging placeholder copied into secrets/prod/ must not pass the prod check.
    with pytest.raises(AssertionError):
        env_policy.assert_secret_value_is_usable(
            "prod", "redis_password", "replace-me-staging-redis_password\n", is_optional=False
        )


def test_optional_placeholder_warns_instead_of_failing(capsys: pytest.CaptureFixture[str]) -> None:
    env_policy.assert_secret_value_is_usable("prod", "smtp_password", "replace-me-prod-smtp_password", is_optional=True)
    assert "optional secret smtp_password is an unfilled placeholder" in capsys.readouterr().out


def test_dev_placeholders_are_allowed() -> None:
    env_policy.assert_secret_value_is_usable(
        "dev", "auth_token_secret", "replace-me-dev-auth_token_secret", is_optional=False
    )


def test_real_value_that_merely_contains_the_marker_is_accepted() -> None:
    # Only a leading marker means "unfilled"; the prefix inside a random token is fine.
    env_policy.assert_secret_value_is_usable("prod", "auth_token_secret", "xreplace-me-token", is_optional=False)


# --- secret inventory parsing ----------------------------------------------


def test_inventory_splits_required_and_optional(tmp_path: Path) -> None:
    path = write_toml(
        tmp_path,
        """
[env_policy]
required_secret_files = ["auth_token_secret"]
optional_secret_files = ["smtp_password"]
""",
    )
    loaded = env_policy.load_secret_inventory(path)
    assert loaded["runtime_secret_files"] == {"auth_token_secret", "smtp_password"}
    assert loaded["optional_secret_files"] == {"smtp_password"}
    assert loaded["infisical_path_template"] == "/relab/{env}/{name}"


@pytest.mark.parametrize(
    ("body", "match"),
    [
        ('[env_policy]\nrequired_secret_files = ["a"]\noptional_secret_files = ["a"]\n', "both required and optional"),
        ("[env_policy]\nrequired_secret_files = 3\n", "must be a list of strings"),
        ("[env_policy]\nrequired_secret_files = [3]\n", "must be a list of strings"),
        ("required_secret_files = []\n", "missing .env_policy. table"),
    ],
)
def test_malformed_inventory_is_rejected(tmp_path: Path, body: str, match: str) -> None:
    with pytest.raises(TypeError, match=match):
        env_policy.load_secret_inventory(write_toml(tmp_path, body))


def test_committed_inventory_classifies_secrets() -> None:
    # The committed contract is what every other check reads; guard its shape.
    assert "auth_token_secret" in REAL_INVENTORY["runtime_secret_files"]
    assert "auth_token_secret" not in REAL_INVENTORY["optional_secret_files"]
    assert REAL_INVENTORY["optional_secret_files"] <= REAL_INVENTORY["runtime_secret_files"]
    assert {"rclone.conf", "smtp_password"} <= REAL_INVENTORY["optional_secret_files"]


# --- existing secret files -------------------------------------------------


@pytest.fixture
def secret_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Callable[[str, str], None]:
    monkeypatch.setattr(env_policy, "ROOT", tmp_path)

    def write(name: str, value: str) -> None:
        path = tmp_path / "secrets" / "prod" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")

    return write


@pytest.mark.usefixtures("secret_file")
def test_missing_secret_files_are_skipped() -> None:
    # CI has no secrets/ tree at all; the check must stay silent there.
    env_policy.assert_existing_secret_files_do_not_use_placeholders(inventory({"auth_token_secret"}, {"smtp_password"}))


def test_required_secret_file_with_placeholder_fails(secret_file: Callable[[str, str], None]) -> None:
    secret_file("auth_token_secret", "replace-me-prod-auth_token_secret\n")
    with pytest.raises(AssertionError, match="placeholder secret remains in secrets/prod/auth_token_secret"):
        env_policy.assert_existing_secret_files_do_not_use_placeholders(inventory({"auth_token_secret"}, set()))


def test_required_secret_file_that_is_empty_fails(secret_file: Callable[[str, str], None]) -> None:
    secret_file("auth_token_secret", "\n  \n")
    with pytest.raises(AssertionError, match="required secret secrets/prod/auth_token_secret is empty"):
        env_policy.assert_existing_secret_files_do_not_use_placeholders(inventory({"auth_token_secret"}, set()))


def test_optional_secret_file_may_be_empty_or_placeholder(secret_file: Callable[[str, str], None]) -> None:
    secret_file("smtp_password", "")
    secret_file("google_oauth_client_secret", "replace-me-prod-google_oauth_client_secret")
    env_policy.assert_existing_secret_files_do_not_use_placeholders(
        inventory(set(), {"smtp_password", "google_oauth_client_secret"})
    )


# --- rendered compose secrets ----------------------------------------------


def test_secret_files_compare_after_resolving_both_sides(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(env_policy, "ROOT", tmp_path)
    monkeypatch.chdir(tmp_path)
    # An unnormalized but equivalent path (the shape `docker compose config` emits
    # for a relative file:) must compare equal to secrets/<env>/<name>.
    config = {"secrets": {"redis_password": {"file": "deploy/../secrets/prod/redis_password"}}}
    env_policy.assert_secret_files("prod", config)


def test_secret_file_outside_the_env_directory_fails(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(env_policy, "ROOT", tmp_path)
    config = {"secrets": {"redis_password": {"file": str(tmp_path / "secrets" / "staging" / "redis_password")}}}
    with pytest.raises(AssertionError, match="must use"):
        env_policy.assert_secret_files("prod", config)


def test_rendered_secret_outside_the_inventory_fails() -> None:
    config = {"secrets": {"auth_token_secret": {}, "surprise_secret": {}}}
    with pytest.raises(AssertionError, match="surprise_secret"):
        env_policy.assert_rendered_secrets_are_in_inventory(config, inventory({"auth_token_secret"}, set()))
    assert env_policy.compose_secret_names(config) == ["auth_token_secret", "surprise_secret"]


# --- small parsers ---------------------------------------------------------


def test_env_assignments_ignores_comments_and_keeps_values_with_equals(tmp_path: Path) -> None:
    path = tmp_path / ".env"
    path.write_text(
        "# comment\n\n  ENVIRONMENT = prod \nEMAIL_FROM=Relab <a@b.test>\n"
        "DSN=postgres://u:p@h/db?x=1\nnot an assignment\n",
        encoding="utf-8",
    )
    assert env_policy.env_assignments(path) == {
        "ENVIRONMENT": "prod",
        "EMAIL_FROM": "Relab <a@b.test>",
        "DSN": "postgres://u:p@h/db?x=1",
    }


def test_parse_labeled_paths() -> None:
    assert env_policy.parse_labeled_paths(["prod=/srv/prod.json"]) == {"prod": Path("/srv/prod.json")}
    with pytest.raises(SystemExit, match="Expected LABEL=PATH"):
        env_policy.parse_labeled_paths(["/srv/prod.json"])


def test_secret_env_name_is_the_uppercased_file_name() -> None:
    assert env_policy.secret_env_name("auth_token_secret") == "AUTH_TOKEN_SECRET"
