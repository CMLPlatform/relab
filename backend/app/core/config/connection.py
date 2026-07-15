"""Database and Redis connection settings."""

import ssl
from functools import cached_property
from pathlib import Path  # noqa: TC003
from typing import Annotated
from urllib.parse import quote

from pydantic import AliasChoices, Field, PostgresDsn, RedisDsn, SecretStr
from pydantic_settings import SettingsConfigDict
from sqlalchemy.engine import URL

from app.core.env import RelabBaseSettings

DATABASE_DRIVER_PSYCOPG = "psycopg"
DATABASE_DRIVER_ASYNCPG = "asyncpg"
DATABASE_SSLMODE_DISABLE = "disable"
DATABASE_SSLMODE_VERIFY_FULL = "verify-full"


class DatabaseSettings(RelabBaseSettings):
    """Connection settings and URL builders for PostgreSQL."""

    model_config = SettingsConfigDict(env_prefix="DATABASE_")

    host: str = "localhost"
    port: int = Field(default=5432, ge=1, le=65535)
    tls: bool = False
    tls_ca_file: Path | None = None
    app_user: str = "relab_app"
    app_password: SecretStr = SecretStr("")
    migration_user: str = "relab_migrator"
    migration_password: SecretStr = SecretStr("")
    backup_user: str = "relab_backup"
    backup_password: SecretStr = SecretStr("")

    # ── Bootstrap/admin Postgres credentials (POSTGRES_* env vars) ───────────
    # env_prefix="DATABASE_" would produce DATABASE_POSTGRES_USER etc., so we
    # use AliasChoices to read the historic POSTGRES_* names directly.
    postgres_user: Annotated[str, Field(validation_alias=AliasChoices("POSTGRES_USER", "postgres_user"))] = "postgres"
    postgres_password: Annotated[
        SecretStr, Field(validation_alias=AliasChoices("POSTGRES_PASSWORD", "postgres_password"))
    ] = SecretStr("")
    postgres_db: Annotated[str, Field(validation_alias=AliasChoices("POSTGRES_DB", "postgres_db"))] = "relab_db"

    def build_database_url(
        self,
        driver: str,
        database: str,
        *,
        username: str | None = None,
        password: SecretStr | None = None,
    ) -> str:
        """Build and validate a PostgreSQL connection URL."""
        query: dict[str, str] = {}
        if driver == DATABASE_DRIVER_PSYCOPG:
            query = {"sslmode": DATABASE_SSLMODE_VERIFY_FULL if self.tls else DATABASE_SSLMODE_DISABLE}
            if self.tls and self.tls_ca_file is not None:
                query["sslrootcert"] = str(self.tls_ca_file)

        url = URL.create(
            f"postgresql+{driver}",
            username=username or self.app_user,
            password=(password or self.app_password).get_secret_value(),
            host=self.host,
            port=self.port,
            database=database,
            query=query,
        )
        rendered = url.render_as_string(hide_password=False)
        PostgresDsn(rendered)
        return rendered

    @cached_property
    def async_url(self) -> str:
        """Async (asyncpg) database URL for the application role."""
        return self.build_database_url(DATABASE_DRIVER_ASYNCPG, self.postgres_db)

    @cached_property
    def sync_url(self) -> str:
        """Sync (psycopg) database URL for the application role."""
        return self.build_database_url(DATABASE_DRIVER_PSYCOPG, self.postgres_db)

    @cached_property
    def sync_migration_url(self) -> str:
        """Sync database URL for the migration role."""
        return self.build_database_url(
            DATABASE_DRIVER_PSYCOPG,
            self.postgres_db,
            username=self.migration_user,
            password=self.migration_password,
        )

    @cached_property
    def sync_backup_url(self) -> str:
        """Sync database URL for the backup role."""
        return self.build_database_url(
            DATABASE_DRIVER_PSYCOPG,
            self.postgres_db,
            username=self.backup_user,
            password=self.backup_password,
        )

    @cached_property
    def async_connect_args(self) -> dict[str, bool | ssl.SSLContext]:
        """Async engine connect_args.

        Explicit about SSL so asyncpg does not inherit PostgreSQL* environment
        variables from the container when talking to the internal Docker
        Postgres service.
        """
        if not self.tls:
            return {"ssl": False}
        cafile = str(self.tls_ca_file) if self.tls_ca_file is not None else None
        return {"ssl": ssl.create_default_context(cafile=cafile)}

    def role_security_errors(self) -> list[str]:
        """Collect least-privilege database role validation errors."""
        errors: list[str] = []

        role_passwords = {
            "DATABASE_APP_PASSWORD": self.app_password,
            "DATABASE_MIGRATION_PASSWORD": self.migration_password,
            "DATABASE_BACKUP_PASSWORD": self.backup_password,
        }
        for name, value in role_passwords.items():
            if not value.get_secret_value():
                errors.append(f"{name} must not be empty in production")

        bootstrap_user = self.postgres_user.casefold()
        role_users = {
            "DATABASE_APP_USER": self.app_user,
            "DATABASE_MIGRATION_USER": self.migration_user,
            "DATABASE_BACKUP_USER": self.backup_user,
        }
        for name, value in role_users.items():
            if value.casefold() == bootstrap_user:
                errors.append(f"{name} must not use the bootstrap/admin role")

        if len({value.casefold() for value in role_users.values()}) != len(role_users):
            errors.append("Database app, migration, and backup users must be distinct")

        return errors


class RedisSettings(RelabBaseSettings):
    """Connection settings and URL builder for Redis."""

    model_config = SettingsConfigDict(env_prefix="REDIS_")

    host: str = "localhost"
    port: int = Field(default=6379, ge=1, le=65535)
    db: int = Field(default=0, ge=0, le=15)
    password: SecretStr = SecretStr("")
    tls: bool = False
    tls_ca_file: Path | None = None

    @cached_property
    def cache_url(self) -> str:
        """Redis URL for cache and rate-limiter storage."""
        password = quote(self.password.get_secret_value(), safe="")
        scheme = "rediss" if self.tls else "redis"
        rendered = f"{scheme}://:{password}@{self.host}:{self.port}/{self.db}"
        RedisDsn(rendered)
        return rendered
