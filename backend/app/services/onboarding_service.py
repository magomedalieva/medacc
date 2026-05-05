from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import today
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.user import User
from app.repositories.faculty_repository import FacultyRepository
from app.schemas.auth import UserResponse
from app.schemas.onboarding import OnboardingCompleteRequest, OnboardingCompleteResponse
from app.services.schedule_service import ScheduleService


class OnboardingService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.faculty_repository = FacultyRepository(session)

    async def complete(self, user: User, payload: OnboardingCompleteRequest) -> OnboardingCompleteResponse:
        if user.onboarding_completed:
            raise BadRequestError("Онбординг уже завершен. Изменяйте параметры подготовки через настройки плана")

        if payload.accreditation_date <= today():
            raise BadRequestError("Дата аккредитации должна быть в будущем")

        faculty = await self.faculty_repository.get_by_id(payload.faculty_id)

        if faculty is None:
            raise NotFoundError("Факультет не найден")

        user.faculty_id = payload.faculty_id
        user.accreditation_date = payload.accreditation_date
        user.daily_study_minutes = payload.daily_study_minutes
        user.study_intensity = payload.study_intensity
        user.study_weekdays = payload.study_weekdays
        user.onboarding_completed = True

        await ScheduleService(self.session).regenerate_plan_for_user(user, commit=False)
        await self.session.commit()
        await self.session.refresh(user)

        return OnboardingCompleteResponse(user=UserResponse.model_validate(user))
