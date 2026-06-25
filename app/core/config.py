from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Project K"
    app_env: str = "local"
    app_version: str = "0.1.0"
    log_level: str = "info"
    database_url: str = "sqlite:///./.data/local.db"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
