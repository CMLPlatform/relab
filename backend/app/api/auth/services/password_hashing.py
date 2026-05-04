"""Application-owned password hashing policy."""

from fastapi_users.password import PasswordHelper
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from pwdlib.hashers.argon2 import Argon2Hasher

PASSWORD_HASH_MEMORY_COST = 19456
PASSWORD_HASH_TIME_COST = 2
PASSWORD_HASH_PARALLELISM = 1


class _ApplicationPasswordHelper(PasswordHelper):
    """Password helper that rejects unsupported hash schemes without enabling them."""

    def verify_and_update(self, plain_password: str, hashed_password: str) -> tuple[bool, str | None]:
        """Verify supported hashes and fail closed for unknown hash formats."""
        try:
            return super().verify_and_update(plain_password, hashed_password)
        except UnknownHashError:
            return False, None


def build_password_helper() -> PasswordHelper:
    """Build the FastAPI-Users password helper with the repo-owned Argon2id profile."""
    return _ApplicationPasswordHelper(
        PasswordHash(
            (
                Argon2Hasher(
                    memory_cost=PASSWORD_HASH_MEMORY_COST,
                    time_cost=PASSWORD_HASH_TIME_COST,
                    parallelism=PASSWORD_HASH_PARALLELISM,
                ),
            )
        )
    )
