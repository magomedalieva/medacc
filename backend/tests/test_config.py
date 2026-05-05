import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "_env_file": None,
        "DATABASE_URL": "postgresql+asyncpg://test:test@localhost:5432/test",
        "SECRET_KEY": "secret",
        "MEDIA_STORAGE_PATH": "C:/MedAccData/media",
        "IMPORT_SOURCE_PATH": "C:/MedAccData/imports",
    }
    values.update(overrides)
    return Settings(**values)


def test_settings_normalizes_comma_separated_lists_and_booleans() -> None:
    settings = _settings(
        CORS_ALLOWED_ORIGINS="http://localhost:5173, http://127.0.0.1:5173",
        ADMIN_ALLOWED_EMAILS="Admin@Example.com, second@example.com",
        debug="dev",
        ADMIN_BOOTSTRAP_ENABLED="yes",
    )

    assert settings.debug is True
    assert settings.admin_bootstrap_enabled is True
    assert settings.cors_allowed_origins == ["http://localhost:5173", "http://127.0.0.1:5173"]
    assert settings.admin_allowed_emails == ["admin@example.com", "second@example.com"]


def test_settings_rejects_invalid_cookie_samesite_value() -> None:
    with pytest.raises(ValidationError):
        _settings(SESSION_COOKIE_SAMESITE="invalid")


def test_is_admin_email_allowed_is_case_insensitive() -> None:
    settings = _settings(ADMIN_ALLOWED_EMAILS="Admin@Example.com")

    assert settings.is_admin_email_allowed(" admin@example.com ") is True
    assert settings.is_admin_email_allowed("student@example.com") is False
