from typing import Annotated
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "MedAcc Backend"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    debug: bool = False
    database_url: str = Field(alias="DATABASE_URL")
    secret_key: str = Field(alias="SECRET_KEY")
    algorithm: str = Field(default="HS256", alias="ALGORITHM")
    access_token_expire_minutes: int = Field(default=60, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"],
        alias="CORS_ALLOWED_ORIGINS",
    )
    session_cookie_name: str = Field(default="medacc_session", alias="SESSION_COOKIE_NAME")
    session_cookie_secure: bool = Field(default=False, alias="SESSION_COOKIE_SECURE")
    session_cookie_samesite: str = Field(default="lax", alias="SESSION_COOKIE_SAMESITE")
    admin_allowed_emails: Annotated[list[str], NoDecode] = Field(default_factory=list, alias="ADMIN_ALLOWED_EMAILS")
    admin_bootstrap_enabled: bool = Field(default=False, alias="ADMIN_BOOTSTRAP_ENABLED")
    system_timezone: str = Field(default="Europe/Moscow", alias="SYSTEM_TIMEZONE")
    content_storage_mode: str = Field(default="database", alias="CONTENT_STORAGE_MODE")
    media_storage_path: str = Field(alias="MEDIA_STORAGE_PATH")
    import_source_path: str = Field(alias="IMPORT_SOURCE_PATH")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("debug", mode="before")
    @classmethod
    def normalize_debug(cls, value: bool | str) -> bool | str:
        if isinstance(value, str):
            normalized_value = value.strip().lower()

            if normalized_value in {"1", "true", "yes", "on", "debug", "development", "dev"}:
                return True

            if normalized_value in {"0", "false", "no", "off", "release", "production", "prod"}:
                return False

        return value

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def normalize_cors_allowed_origins(cls, value: list[str] | str) -> list[str] | str:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]

        return value

    @field_validator("admin_bootstrap_enabled", mode="before")
    @classmethod
    def normalize_admin_bootstrap_enabled(cls, value: bool | str) -> bool | str:
        if isinstance(value, str):
            normalized_value = value.strip().lower()

            if normalized_value in {"1", "true", "yes", "on"}:
                return True

            if normalized_value in {"0", "false", "no", "off"}:
                return False

        return value

    @field_validator("session_cookie_samesite", mode="before")
    @classmethod
    def normalize_session_cookie_samesite(cls, value: str) -> str:
        normalized = value.strip().lower()

        if normalized not in {"lax", "strict", "none"}:
            raise ValueError("SESSION_COOKIE_SAMESITE должен быть одним из значений: lax, strict, none")

        return normalized

    @field_validator("admin_allowed_emails", mode="before")
    @classmethod
    def normalize_admin_allowed_emails(cls, value: list[str] | str) -> list[str] | str:
        if isinstance(value, str):
            return [item.strip().lower() for item in value.split(",") if item.strip()]

        if isinstance(value, list):
            return [item.strip().lower() for item in value if item.strip()]

        return value

    def is_admin_email_allowed(self, email: str) -> bool:
        return email.strip().lower() in self.admin_allowed_emails


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
