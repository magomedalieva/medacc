from types import SimpleNamespace

import pytest

from app.core import admin_policy
from app.core.exceptions import BadRequestError, ForbiddenError, UnauthorizedError
from app.models.enums import UserRole


def _user(email: str, role: UserRole) -> SimpleNamespace:
    return SimpleNamespace(email=email, role=role)


def _settings(*, allowed: set[str], bootstrap_enabled: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        admin_bootstrap_enabled=bootstrap_enabled,
        is_admin_email_allowed=lambda email: email.strip().lower() in allowed,
    )


def test_admin_email_allowlist_accepts_normalized_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(admin_policy, "settings", _settings(allowed={"admin@example.com"}))

    admin_policy.ensure_admin_email_allowlisted("  ADMIN@example.com  ")


def test_admin_email_allowlist_rejects_unknown_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(admin_policy, "settings", _settings(allowed={"admin@example.com"}))

    with pytest.raises(BadRequestError):
        admin_policy.ensure_admin_email_allowlisted("student@example.com")


def test_public_registration_blocks_allowlisted_admin_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(admin_policy, "settings", _settings(allowed={"admin@example.com"}))

    with pytest.raises(ForbiddenError):
        admin_policy.ensure_public_registration_allowed("admin@example.com")


def test_admin_access_requires_admin_role_and_allowlisted_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(admin_policy, "settings", _settings(allowed={"admin@example.com"}))

    admin_policy.ensure_admin_access_allowed(_user("admin@example.com", UserRole.ADMIN))

    with pytest.raises(ForbiddenError):
        admin_policy.ensure_admin_access_allowed(_user("admin@example.com", UserRole.STUDENT))

    with pytest.raises(ForbiddenError):
        admin_policy.ensure_admin_access_allowed(_user("other@example.com", UserRole.ADMIN))


def test_admin_login_rejects_admin_removed_from_allowlist(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(admin_policy, "settings", _settings(allowed=set()))

    with pytest.raises(UnauthorizedError):
        admin_policy.ensure_admin_login_allowed(_user("admin@example.com", UserRole.ADMIN))


def test_admin_bootstrap_requires_enabled_flag_and_allowlisted_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        admin_policy,
        "settings",
        _settings(allowed={"admin@example.com"}, bootstrap_enabled=True),
    )
    admin_policy.ensure_admin_bootstrap_allowed("admin@example.com")

    monkeypatch.setattr(
        admin_policy,
        "settings",
        _settings(allowed={"admin@example.com"}, bootstrap_enabled=False),
    )
    with pytest.raises(BadRequestError):
        admin_policy.ensure_admin_bootstrap_allowed("admin@example.com")
