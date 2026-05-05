from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_policy import ensure_admin_access_allowed, ensure_admin_bootstrap_allowed
from app.core.config import settings
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.user_repository import UserRepository


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class AdminAccessStatusEntry:
    email: str
    user_exists: bool
    role: str | None
    is_allowlisted: bool
    has_admin_access: bool
    onboarding_completed: bool | None


def build_admin_access_status_entries(users: list[User], allowlisted_emails: list[str]) -> list[AdminAccessStatusEntry]:
    normalized_allowlist = sorted({email.strip().lower() for email in allowlisted_emails if email.strip()})
    users_by_email = {user.email.strip().lower(): user for user in users}
    target_emails = sorted(set(normalized_allowlist) | set(users_by_email))

    entries: list[AdminAccessStatusEntry] = []

    for email in target_emails:
        user = users_by_email.get(email)
        role = user.role.value if user is not None else None
        is_allowlisted = email in normalized_allowlist
        has_admin_access = user is not None and user.role == UserRole.ADMIN and is_allowlisted
        onboarding_completed = user.onboarding_completed if user is not None else None

        entries.append(
            AdminAccessStatusEntry(
                email=email,
                user_exists=user is not None,
                role=role,
                is_allowlisted=is_allowlisted,
                has_admin_access=has_admin_access,
                onboarding_completed=onboarding_completed,
            )
        )

    return entries


class AdminAccessService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repository = UserRepository(session)

    async def create_admin_account(self, email: str, password: str, first_name: str, last_name: str) -> User:
        normalized_email = email.strip().lower()
        ensure_admin_bootstrap_allowed(normalized_email)
        existing_user = await self.user_repository.get_by_email(normalized_email)

        if existing_user is not None:
            raise ConflictError("Пользователь с такой почтой уже существует")

        admin = User(
            first_name=first_name.strip(),
            last_name=last_name.strip(),
            email=normalized_email,
            password_hash=hash_password(password),
            role=UserRole.ADMIN,
            onboarding_completed=True,
        )

        self.user_repository.add(admin)
        await self.session.commit()
        await self.session.refresh(admin)
        logger.info("Created administrator account for %s", normalized_email)
        return admin

    async def grant_admin_role(self, email: str) -> User:
        normalized_email = email.strip().lower()
        ensure_admin_bootstrap_allowed(normalized_email)
        user = await self.user_repository.get_by_email(normalized_email)

        if user is None:
            raise NotFoundError("Аккаунт пользователя не найден")

        user.role = UserRole.ADMIN
        await self.session.commit()
        await self.session.refresh(user)
        logger.info("Granted administrator access to %s", normalized_email)
        return user

    async def revoke_admin_role(self, email: str) -> User:
        normalized_email = email.strip().lower()
        user = await self.user_repository.get_by_email(normalized_email)

        if user is None:
            raise NotFoundError("Аккаунт пользователя не найден")

        user.role = UserRole.STUDENT
        await self.session.commit()
        await self.session.refresh(user)
        logger.info("Revoked administrator access for %s", normalized_email)
        return user

    async def reset_active_admin_password(self, email: str, password: str) -> User:
        normalized_email = email.strip().lower()
        user = await self.user_repository.get_by_email(normalized_email)

        if user is None:
            raise NotFoundError("Аккаунт пользователя не найден")

        ensure_admin_access_allowed(user)
        user.password_hash = hash_password(password)
        await self.session.commit()
        await self.session.refresh(user)
        logger.info("Reset administrator password for %s", normalized_email)
        return user

    async def revoke_disallowed_admin_roles(self) -> list[User]:
        users = await self.list_disallowed_admin_users()

        if not users:
            return []

        for user in users:
            user.role = UserRole.STUDENT

        await self.session.commit()
        logger.info("Revoked administrator access for %d disallowed users", len(users))
        return users

    async def list_disallowed_admin_users(self) -> list[User]:
        normalized_allowlist = [email.strip().lower() for email in settings.admin_allowed_emails if email.strip()]
        statement = select(User).where(User.role == UserRole.ADMIN)

        if normalized_allowlist:
            statement = statement.where(~User.email.in_(normalized_allowlist))

        return list((await self.session.scalars(statement.order_by(User.email))).all())

    async def list_admin_access_status(self) -> list[AdminAccessStatusEntry]:
        normalized_allowlist = [email.strip().lower() for email in settings.admin_allowed_emails if email.strip()]
        filters = [User.role == UserRole.ADMIN]

        if normalized_allowlist:
            filters.append(User.email.in_(normalized_allowlist))

        users = list((await self.session.scalars(select(User).where(or_(*filters)).order_by(User.email))).all())
        return build_admin_access_status_entries(users, normalized_allowlist)
