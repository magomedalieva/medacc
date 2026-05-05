from app.core.config import settings
from app.core.exceptions import BadRequestError, ForbiddenError, UnauthorizedError
from app.models.enums import UserRole
from app.models.user import User


def ensure_admin_email_allowlisted(email: str) -> None:
    normalized_email = email.strip().lower()

    if not settings.is_admin_email_allowed(normalized_email):
        raise BadRequestError("Email администратора должен быть явно указан в ADMIN_ALLOWED_EMAILS")


def ensure_public_registration_allowed(email: str) -> None:
    if settings.is_admin_email_allowed(email):
        raise ForbiddenError("Этот email нельзя зарегистрировать через публичную форму")


def ensure_admin_login_allowed(user: User) -> None:
    if user.role == UserRole.ADMIN and not settings.is_admin_email_allowed(user.email):
        raise UnauthorizedError("Неверная почта или пароль")


def ensure_admin_session_allowed(user: User) -> None:
    if user.role == UserRole.ADMIN and not settings.is_admin_email_allowed(user.email):
        raise UnauthorizedError("Требуется вход в аккаунт")


def ensure_admin_access_allowed(user: User) -> None:
    if user.role != UserRole.ADMIN or not settings.is_admin_email_allowed(user.email):
        raise ForbiddenError("Требуется доступ администратора")


def ensure_admin_bootstrap_allowed(email: str) -> None:
    normalized_email = email.strip().lower()

    if not settings.admin_bootstrap_enabled:
        raise BadRequestError("Первичное создание администратора отключено")

    ensure_admin_email_allowlisted(normalized_email)
