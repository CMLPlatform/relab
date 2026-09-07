"""Tests for contributor-terms versioning and the acceptance rule."""

import pytest

from app.api.auth.terms import (
    CURRENT_TERMS_VERSION,
    MINIMUM_RELEASE_TERMS_VERSION,
    terms_acceptance_required,
)


def test_never_accepted_needs_acceptance() -> None:
    """An account predating acceptance tracking must be asked."""
    assert terms_acceptance_required(None) is True


def test_acceptance_below_the_release_threshold_is_asked_again() -> None:
    """A grant older than the one a release needs is not a grant for that release."""
    assert terms_acceptance_required(MINIMUM_RELEASE_TERMS_VERSION - 1) is True


@pytest.mark.parametrize("offset", [0, 1, 5])
def test_acceptance_at_or_above_the_threshold_is_enough(offset: int) -> None:
    """Accepting the granting version, or any later one, settles it."""
    assert terms_acceptance_required(MINIMUM_RELEASE_TERMS_VERSION + offset) is False


def test_the_rule_keys_on_the_release_threshold_not_the_current_version() -> None:
    """A wording bump must not re-ask anyone.

    The prompt exists to serve the dataset release, so it must ask exactly the
    accounts the release would exclude. Keying on CURRENT_TERMS_VERSION would
    nag every contributor for a typo fix the release never cared about.
    """
    current_only = CURRENT_TERMS_VERSION + 10
    assert terms_acceptance_required(MINIMUM_RELEASE_TERMS_VERSION) is False
    assert terms_acceptance_required(current_only) is False


def test_the_release_threshold_cannot_exceed_the_current_version() -> None:
    """An unreachable threshold would ask everyone forever and satisfy no one."""
    assert MINIMUM_RELEASE_TERMS_VERSION <= CURRENT_TERMS_VERSION
