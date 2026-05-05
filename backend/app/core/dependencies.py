from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_policy import ensure_admin_access_allowed, ensure_admin_session_allowed
from app.core.config import settings
from app.core.database import get_db_session
from app.core.exceptions import UnauthorizedError
from app.core.security import build_password_token_fingerprint, decode_access_token
from app.models.user import User
from app.repositories.user_repository import UserRepository


oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/auth/login", auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db_session)]


async def get_current_user(
    request: Request,
    session: DbSession,
    token: Annotated[str | None, Depends(oauth2_scheme)],
) -> User:
    resolved_token = token or request.cookies.get(settings.session_cookie_name)

    if not resolved_token:
        raise UnauthorizedError("Требуется вход в аккаунт")

    payload = decode_access_token(resolved_token)
    subject = payload.get("sub")

    if subject is None or not subject.isdigit():
        raise UnauthorizedError("Некорректные данные токена")

    user = await UserRepository(session).get_by_id(int(subject))

    if user is None:
        raise UnauthorizedError("Пользователь не найден")

    token_password_fingerprint = payload.get("pwdv")

    if not isinstance(token_password_fingerprint, str):
        raise UnauthorizedError("Сессия устарела. Войдите в аккаунт заново")

    if token_password_fingerprint != build_password_token_fingerprint(user.password_hash):
        raise UnauthorizedError("Сессия устарела. Войдите в аккаунт заново")

    ensure_admin_session_allowed(user)

    return user


async def get_current_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    ensure_admin_access_allowed(user)
    return user
