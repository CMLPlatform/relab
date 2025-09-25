"""Configuration settings for the FastAPI app."""

from functools import cached_property
from pathlib import Path

from pydantic import EmailStr, HttpUrl, PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Set the project base directory and .env file
BASE_DIR: Path = (Path(__file__).parents[2]).resolve()


class CoreSettings(BaseSettings):
    """Settings class to store all the configurations for the app."""

    # Database settings from .env file
    database_host: str = "localhost"
    database_port: int = 5432
    postgres_user: str = "postgres"
    postgres_password: str = ""
    postgres_db: str = "fastapi_db"
    postgres_test_db: str = "fastapi_test_db"

    # Debug settings
    debug: bool = False

    # Superuser settings
    superuser_email: EmailStr = "your-email@example.com"
    superuser_password: str = ""

    # Network settings
    frontend_url: HttpUrl = HttpUrl("http://127.0.0.1:8000")
    allowed_origins: list[str] = [str(frontend_url)]

    # Initialize the settings configuration from the environment (Docker) or .env file (local)
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    # Construct directory paths
    uploads_path: Path = BASE_DIR / "data" / "uploads"
    file_storage_path: Path = uploads_path / "files"
    image_storage_path: Path = uploads_path / "images"
    static_files_path: Path = BASE_DIR / "app" / "static"
    templates_path: Path = BASE_DIR / "app" / "templates"
    log_path: Path = BASE_DIR / "logs"
    docs_path: Path = BASE_DIR / "docs" / "site"  # Mkdocs site directory

    # Construct database URLs
    def _build_database_url(self, driver: str, database: str) -> str:
        """Build and validate PostgreSQL database URL."""
        url = (
            f"postgresql+{driver}://{self.postgres_user}:{self.postgres_password}"
            f"@{self.database_host}:{self.database_port}/{database}"
        )
        PostgresDsn(url)  # Validate URL format
        return url

    @computed_field
    @cached_property
    def async_database_url(self) -> str:
        """Get async database URL."""
        return self._build_database_url("asyncpg", self.postgres_db)

    @computed_field
    @cached_property
    def sync_database_url(self) -> str:
        """Get sync database URL."""
        return self._build_database_url("psycopg", self.postgres_db)

    @computed_field
    @cached_property
    def async_test_database_url(self) -> str:
        """Get test database URL."""
        return self._build_database_url("asyncpg", self.postgres_test_db)

    @computed_field
    @cached_property
    def sync_test_database_url(self) -> str:
        """Get test database URL."""
        return self._build_database_url("psycopg", self.postgres_test_db)


# Create a settings instance that can be imported throughout the app
settings = CoreSettings()
