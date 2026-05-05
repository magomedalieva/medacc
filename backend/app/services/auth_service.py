from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_policy import ensure_admin_email_allowlisted, ensure_admin_login_allowed, ensure_public_registration_allowed
from app.core.clock import utc_now
from app.core.exceptions import BadRequestError, ConflictError, UnauthorizedError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    PasswordChangeRequest,
    PasswordChangeResponse,
    ProfileUpdateRequest,
    RegisterRequest,
    UserResponse,
)


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repository = UserRepository(session)

    async def register(self, payload: RegisterRequest) -> tuple[AuthResponse, str]:
        normalized_email = payload.email.strip().lower()
        ensure_public_registration_allowed(normalized_email)
        existing_user = await self.user_repository.get_by_email(normalized_email)

        if existing_user is not None:
            raise ConflictError("Пользователь с такой почтой уже существует")

        user = User(
            first_name=payload.first_name.strip(),
            last_name=payload.last_name.strip(),
            email=normalized_email,
            password_hash=hash_password(payload.password),
        )

        self.user_repository.add(user)
        await self.session.commit()
        await self.session.refresh(user)

        return self._build_auth_response(user)

    async def login(self, payload: LoginRequest) -> tuple[AuthResponse, str]:
        user = await self.user_repository.get_by_email(payload.email.strip().lower())

        if user is None or not verify_password(payload.password, user.password_hash):
            raise UnauthorizedError("Неверная почта или пароль")

        if user.role == UserRole.ADMIN:
            ensure_admin_login_allowed(user)

        user.last_login_at = utc_now()
        await self.session.commit()

        return self._build_auth_response(user)

    async def update_profile(self, user: User, payload: ProfileUpdateRequest) -> UserResponse:
        first_name = payload.first_name.strip()
        last_name = payload.last_name.strip()
        normalized_email = payload.email.strip().lower()

        if not first_name or not last_name:
            raise BadRequestError("Имя и фамилия не должны быть пустыми")

        if user.role == UserRole.ADMIN:
            ensure_admin_email_allowlisted(normalized_email)
        else:
            ensure_public_registration_allowed(normalized_email)

        if normalized_email != user.email:
            existing_user = await self.user_repository.get_by_email(normalized_email)

            if existing_user is not None and existing_user.id != user.id:
                raise ConflictError("Пользователь с такой почтой уже существует")

        user.first_name = first_name
        user.last_name = last_name
        user.email = normalized_email

        await self.session.commit()
        await self.session.refresh(user)

        return UserResponse.model_validate(user)

    async def change_password(self, user: User, payload: PasswordChangeRequest) -> tuple[PasswordChangeResponse, str]:
        if not verify_password(payload.current_password, user.password_hash):
            raise BadRequestError("Текущий пароль указан неверно")

        if payload.current_password == payload.new_password:
            raise BadRequestError("Новый пароль должен отличаться от текущего")

        user.password_hash = hash_password(payload.new_password)
        await self.session.commit()

        return PasswordChangeResponse(), self._build_access_token(user)

    def _build_auth_response(self, user: User) -> tuple[AuthResponse, str]:
        access_token = self._build_access_token(user)
        return AuthResponse(user=UserResponse.model_validate(user)), access_token

    def _build_access_token(self, user: User) -> str:
        return create_access_token(
            subject=str(user.id),
            role=user.role.value,
            password_hash=user.password_hash,
        )
