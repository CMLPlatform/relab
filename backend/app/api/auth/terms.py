"""Version of the contributor terms of service that accounts accept at signup.

Bump ``CURRENT_TERMS_VERSION`` whenever the terms text changes materially. The text
itself lives in ``www/src/copy/terms-content.ts`` — the two are kept in step by hand,
so a revision there is only half the change until this number moves with it.

Monotonically increasing, because that is the question the release tooling asks:
"which records belong to owners who accepted version >= N".
"""

CURRENT_TERMS_VERSION = 1

# The version that first granted a publication licence; the dataset release and the
# acceptance prompt both key on it. Not CURRENT_TERMS_VERSION: that would drop every
# record and re-prompt every contributor on a typo fix. Moves only when the grant changes.
MINIMUM_RELEASE_TERMS_VERSION = 1


def terms_acceptance_required(accepted_version: int | None) -> bool:
    """Return whether this account should be asked to accept the contributor terms.

    ``None`` means the account accepted nothing — true of every account created
    before acceptance was tracked, and of accounts created programmatically
    (seeding, CLI), which have no signup screen and therefore no acceptance to
    record.
    """
    return accepted_version is None or accepted_version < MINIMUM_RELEASE_TERMS_VERSION
