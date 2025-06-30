"""Configuration for the admin module."""

from pydantic_settings import BaseSettings


class AdminSettings(BaseSettings):
    """Settings class to store settings related to admin components."""

    admin_base_url: str = "/admin/dashboard"  # The base url of the SQLadmin interface


# Create a settings instance that can be imported throughout the app
settings = AdminSettings()
