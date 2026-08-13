"""Database models related to platform users."""

import uuid  # noqa: TC003 # Used at runtime for ORM mapped annotations
from datetime import datetime  # noqa: TC003 # Used at runtime for ORM mapped annotations
from typing import Any  # noqa: TC003 # Used at runtime for ORM mapped annotations

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.api.auth.services.user_database import BaseOAuthAccountDB, BaseUserDB
from app.api.common.models.base import TimeStampMixinBare
from app.core.crypto.sqlalchemy import EncryptedString


class User(BaseUserDB, TimeStampMixinBare):
    """Database model for platform users."""

    # Override __tablename__ from base (both set "user", this is explicit)
    __tablename__ = "user"
    __table_args__ = (
        CheckConstraint("upload_file_count >= 0", name="ck_user_upload_file_count_non_negative"),
        CheckConstraint("upload_total_bytes >= 0", name="ck_user_upload_total_bytes_non_negative"),
    )

    username: Mapped[str | None] = mapped_column(String(50), index=True, unique=True, default=None)

    # Whether the account has a user-set (usable) password, as opposed to the random
    # password fastapi-users assigns to OAuth-created accounts. Gates step-up re-auth
    # on sensitive changes (e.g. unlinking a social login) so an OAuth-only user is
    # never asked for a password they never set.
    has_usable_password: Mapped[bool] = mapped_column(nullable=False, server_default="true", default=True)

    # Login tracking without retaining network identifiers.
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    mfa_totp_secret: Mapped[str | None] = mapped_column(EncryptedString(), default=None)
    mfa_enabled: Mapped[bool] = mapped_column(default=False, nullable=False)
    mfa_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # SHA-256 hashes of single-use recovery codes (high-entropy, so a fast hash is fine).
    mfa_recovery_codes: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]", default=list)

    # Consent to be named as a contributor in published dataset releases. Deliberately a
    # column and not a `preferences` key: preferences are revocable UI settings, this is a
    # consent record the release build reads, and a published release cannot be unpublished.
    credit_in_releases: Mapped[bool] = mapped_column(nullable=False, server_default="false", default=False)

    # Evidence that this account accepted the contributor terms, which carry the licence
    # grant the dataset releases rest on. Columns rather than `preferences` keys for the
    # same reason as above, but harder: load_user_preferences() deliberately fails soft,
    # silently substituting a default for any value it cannot validate. An evidence field
    # must never do that — a quietly defaulted licence grant is an unenforceable one.
    #
    # An integer version, not the terms' date: the release tooling asks "whose owner
    # accepted version >= N", which is an integer comparison rather than a string parse,
    # and it still distinguishes two revisions published on the same day. NULL means the
    # account accepted nothing — true of every account predating this column.
    terms_accepted_version: Mapped[int | None] = mapped_column(default=None)
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    # Flexible user preferences (UI settings, feature toggles, etc.)
    preferences: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}", default=dict)

    # Pre-computed public-profile statistics stored as a flexible JSONB snapshot.
    profile_stats: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}", default=dict)
    profile_stats_computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    # Authoritative upload quota ledger for product-owned files and images.
    upload_file_count: Mapped[int] = mapped_column(nullable=False, server_default="0", default=0)
    upload_total_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0", default=0)

    # One-to-many relationship with OAuthAccount
    oauth_accounts: Mapped[list[OAuthAccount]] = relationship(
        back_populates="user",
        lazy="joined",  # Required because of FastAPI-Users OAuth implementation
        foreign_keys="[OAuthAccount.user_id]",
        # An OAuth link cannot outlive its user: user_id is NOT NULL, so the default
        # save-update cascade would try to null it out and fail the delete.
        cascade="all, delete-orphan",
    )

    def __str__(self) -> str:
        return f"{self.email}"


### OAuthAccount Model ###
class OAuthAccount(BaseOAuthAccountDB, TimeStampMixinBare):
    """Database model for OAuth accounts."""

    __tablename__ = "oauthaccount"

    # Redefine user_id to ensure the ForeignKey survives mixin inheritance.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False)

    # Many-to-one relationship with User
    user: Mapped[User] = relationship(
        back_populates="oauth_accounts",
        foreign_keys="[OAuthAccount.user_id]",
    )

    __table_args__ = (
        UniqueConstraint("oauth_name", "account_id", name="uq_oauth_account_identity"),
        # Redefining user_id above drops the index=True carried by the mixin,
        # so the FK backing the joined oauth_accounts load needs it restated.
        Index("ix_oauthaccount_user_id", "user_id"),
    )
