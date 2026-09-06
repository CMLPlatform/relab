"""Database models related to platform users."""

import uuid  # noqa: TC003 # Used at runtime for ORM mapped annotations
from datetime import datetime  # noqa: TC003 # Used at runtime for ORM mapped annotations
from typing import Any  # noqa: TC003 # Used at runtime for ORM mapped annotations

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.api.auth.roles import (
    DEFAULT_USER_ROLE,
    UserRole,
    upload_quota_bytes_for_role,
    upload_quota_files_for_role,
)
from app.api.auth.services.user_database import BaseOAuthAccountDB, BaseUserDB
from app.api.auth.terms import terms_acceptance_required
from app.api.common.models.base import TimeStampMixinBare
from app.core.crypto.sqlalchemy import EncryptedString

USER_ROLE_CHECK_CONSTRAINT_NAME = "ck_user_role_valid"
_ROLE_VALUES_SQL = ", ".join(f"'{role.value}'" for role in UserRole)


class User(BaseUserDB, TimeStampMixinBare):
    """Database model for platform users."""

    __tablename__ = "user"
    __table_args__ = (
        CheckConstraint(f"role IN ({_ROLE_VALUES_SQL})", name=USER_ROLE_CHECK_CONSTRAINT_NAME),
        CheckConstraint("upload_file_count >= 0", name="ck_user_upload_file_count_non_negative"),
        CheckConstraint("upload_total_bytes >= 0", name="ck_user_upload_total_bytes_non_negative"),
        # The admin user list does an unanchored ILIKE on email OR username; both need a
        # trigram index or Postgres seq-scans the whole OR.
        Index("user_email_trgm_idx", "email", postgresql_using="gin", postgresql_ops={"email": "gin_trgm_ops"}),
        Index(
            "user_username_trgm_idx", "username", postgresql_using="gin", postgresql_ops={"username": "gin_trgm_ops"}
        ),
    )

    username: Mapped[str | None] = mapped_column(String(50), index=True, unique=True, default=None)

    # False for the random password fastapi-users assigns to OAuth-created accounts.
    # Gates step-up re-auth so an OAuth-only user is never asked for a password they never set.
    has_usable_password: Mapped[bool] = mapped_column(nullable=False, server_default="true", default=True)

    # Login tracking without retaining network identifiers.
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    mfa_totp_secret: Mapped[str | None] = mapped_column(EncryptedString(), default=None)
    mfa_enabled: Mapped[bool] = mapped_column(default=False, nullable=False)
    mfa_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # SHA-256 hashes of single-use recovery codes (high-entropy, so a fast hash is fine).
    mfa_recovery_codes: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]", default=list)

    # Evidence of the contributor-terms licence grant the dataset releases rest on. Not a
    # `preferences` key: load_user_preferences() silently defaults invalid values, and a
    # defaulted licence grant is unenforceable. NULL means nothing accepted.
    terms_accepted_version: Mapped[int | None] = mapped_column(default=None)
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    preferences: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}", default=dict)

    # Pre-computed public-profile statistics snapshot.
    profile_stats: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}", default=dict)
    profile_stats_computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    # Contributor tier. Absent from UserUpdate so no self-service PATCH can reach it;
    # only the admin role route sets it. VARCHAR + CHECK: a Postgres enum can never drop a value.
    role: Mapped[UserRole] = mapped_column(
        String(20), nullable=False, server_default=DEFAULT_USER_ROLE.value, default=DEFAULT_USER_ROLE
    )

    # Authoritative upload quota ledger for product-owned files and images.
    upload_file_count: Mapped[int] = mapped_column(nullable=False, server_default="0", default=0)
    upload_total_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0", default=0)

    @property
    def terms_acceptance_required(self) -> bool:
        """Return whether this account should still be asked to accept the terms."""
        return terms_acceptance_required(self.terms_accepted_version)

    @property
    def upload_quota_files(self) -> int:
        """Return the file-count quota this account's role grants."""
        return upload_quota_files_for_role(self.role)

    @property
    def upload_quota_bytes(self) -> int:
        """Return the byte quota this account's role grants."""
        return upload_quota_bytes_for_role(self.role)

    oauth_accounts: Mapped[list[OAuthAccount]] = relationship(
        back_populates="user",
        lazy="joined",  # Required because of FastAPI-Users OAuth implementation
        foreign_keys="[OAuthAccount.user_id]",
        # user_id is NOT NULL, so the default cascade would null it out and fail the delete.
        cascade="all, delete-orphan",
    )

    def __str__(self) -> str:
        return f"{self.email}"


class OAuthAccount(BaseOAuthAccountDB, TimeStampMixinBare):
    """Database model for OAuth accounts."""

    __tablename__ = "oauthaccount"

    # Redefine user_id to ensure the ForeignKey survives mixin inheritance.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False)

    user: Mapped[User] = relationship(
        back_populates="oauth_accounts",
        foreign_keys="[OAuthAccount.user_id]",
    )

    __table_args__ = (
        UniqueConstraint("oauth_name", "account_id", name="uq_oauth_account_identity"),
        # Redefining user_id above drops the mixin's index=True; restate it.
        Index("ix_oauthaccount_user_id", "user_id"),
    )
