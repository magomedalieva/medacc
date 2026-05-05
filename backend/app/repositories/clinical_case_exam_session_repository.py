from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clinical_case_exam_session import ClinicalCaseExamSession
from app.repositories.base_repository import BaseRepository


class ClinicalCaseExamSessionRepository(BaseRepository[ClinicalCaseExamSession]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, ClinicalCaseExamSession)

    async def get_by_user_and_id(self, user_id: int, session_id: UUID) -> ClinicalCaseExamSession | None:
        result = await self.session.execute(
            select(ClinicalCaseExamSession).where(
                ClinicalCaseExamSession.user_id == user_id,
                ClinicalCaseExamSession.id == session_id,
            )
        )
        return result.scalar_one_or_none()
