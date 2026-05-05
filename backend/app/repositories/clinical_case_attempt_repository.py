from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clinical_case_attempt import ClinicalCaseAttempt
from app.repositories.base_repository import BaseRepository


class ClinicalCaseAttemptRepository(BaseRepository[ClinicalCaseAttempt]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, ClinicalCaseAttempt)

    async def list_by_user(self, user_id: int) -> list[ClinicalCaseAttempt]:
        result = await self.session.execute(
            select(ClinicalCaseAttempt)
            .where(ClinicalCaseAttempt.user_id == user_id)
            .order_by(ClinicalCaseAttempt.submitted_at.desc(), ClinicalCaseAttempt.id.desc())
        )
        return list(result.scalars().all())

    async def get_by_user_and_id(self, user_id: int, attempt_id: UUID) -> ClinicalCaseAttempt | None:
        result = await self.session.execute(
            select(ClinicalCaseAttempt).where(
                ClinicalCaseAttempt.user_id == user_id,
                ClinicalCaseAttempt.id == attempt_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_by_session_signature(
        self,
        *,
        user_id: int,
        case_slug: str,
        submitted_at: datetime,
    ) -> ClinicalCaseAttempt | None:
        result = await self.session.execute(
            select(ClinicalCaseAttempt).where(
                ClinicalCaseAttempt.user_id == user_id,
                ClinicalCaseAttempt.case_slug == case_slug,
                ClinicalCaseAttempt.submitted_at == submitted_at,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_simulation(self, simulation_id: UUID) -> list[ClinicalCaseAttempt]:
        result = await self.session.execute(
            select(ClinicalCaseAttempt)
            .where(ClinicalCaseAttempt.simulation_id == simulation_id)
            .order_by(ClinicalCaseAttempt.submitted_at.desc(), ClinicalCaseAttempt.id.desc())
        )
        return list(result.scalars().all())
