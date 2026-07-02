"""Unit tests for application password hashing policy."""

from pwdlib.hashers.bcrypt import BcryptHasher

from app.api.auth.services.password_hashing import (
    PASSWORD_HASH_MEMORY_COST,
    PASSWORD_HASH_PARALLELISM,
    PASSWORD_HASH_TIME_COST,
    build_password_helper,
)

TEST_PASSWORD = "correct-horse-battery-staple-v42"


def test_hashes_new_passwords_with_owasp_argon2id_parameters() -> None:
    """New password hashes should use the explicit OWASP-aligned Argon2id profile."""
    password_helper = build_password_helper()

    hashed_password = password_helper.hash(TEST_PASSWORD)

    assert hashed_password.startswith("$argon2id$")
    assert f"m={PASSWORD_HASH_MEMORY_COST},t={PASSWORD_HASH_TIME_COST},p={PASSWORD_HASH_PARALLELISM}" in hashed_password


def test_verifies_matching_password() -> None:
    """The production helper should verify hashes it created."""
    password_helper = build_password_helper()
    hashed_password = password_helper.hash(TEST_PASSWORD)

    is_valid, updated_hash = password_helper.verify_and_update(TEST_PASSWORD, hashed_password)

    assert is_valid is True
    assert updated_hash is None


def test_rejects_wrong_password() -> None:
    """Incorrect passwords should not verify."""
    password_helper = build_password_helper()
    hashed_password = password_helper.hash(TEST_PASSWORD)

    is_valid, updated_hash = password_helper.verify_and_update("wrong-password", hashed_password)

    assert is_valid is False
    assert updated_hash is None


def test_rejects_bcrypt_hashes() -> None:
    """Bcrypt is legacy-only and should not be accepted by the production helper."""
    password_helper = build_password_helper()
    bcrypt_hash = BcryptHasher().hash(TEST_PASSWORD)

    is_valid, updated_hash = password_helper.verify_and_update(TEST_PASSWORD, bcrypt_hash)

    assert is_valid is False
    assert updated_hash is None
