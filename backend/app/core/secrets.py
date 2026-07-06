"""Shared helpers for validating runtime secrets."""

from typing import TYPE_CHECKING

from pydantic import BaseModel, SecretStr

if TYPE_CHECKING:
    import logging

MIN_SECRET_BYTES = 32

# Deploy scaffolding (scripts/deploy_ops.sh) seeds secret files it cannot
# auto-generate (external OAuth/SMTP credentials) with this prefix so an
# unfilled secret is recognizable at runtime instead of failing silently.
SECRET_PLACEHOLDER_PREFIX = "replace-me-"  # noqa: S105  # placeholder prefix, not a credential


def validate_min_secret_bytes(value: SecretStr, env_name: str) -> SecretStr:
    """Validate that a secret meets the runtime byte-length floor."""
    if len(value.get_secret_value().encode("utf-8")) < MIN_SECRET_BYTES:
        msg = f"{env_name} must be at least {MIN_SECRET_BYTES} bytes."
        raise ValueError(msg)
    return value


def find_placeholder_secret_names(settings_obj: BaseModel) -> list[str]:
    """Return UPPER_SNAKE names of top-level SecretStr fields still set to a deploy placeholder."""
    return [
        field_name.upper()
        for field_name in type(settings_obj).model_fields
        if isinstance(value := getattr(settings_obj, field_name), SecretStr)
        and value.get_secret_value().startswith(SECRET_PLACEHOLDER_PREFIX)
    ]


def warn_on_placeholder_secrets(logger: logging.Logger, *settings_objects: BaseModel) -> list[str]:
    """Log a loud warning for any secret still holding a deploy placeholder; return their names."""
    offenders = [name for obj in settings_objects for name in find_placeholder_secret_names(obj)]
    if offenders:
        rule = "!" * 72
        logger.warning(
            "%s\n"
            "CONFIG WARNING: %d secret(s) still hold placeholder values. Any feature\n"
            "that uses them WILL fail at runtime until real values are set in\n"
            "secrets/<env>/ (then recreate the container):\n"
            "  - %s\n"
            "%s",
            rule,
            len(offenders),
            "\n  - ".join(offenders),
            rule,
        )
    return offenders
