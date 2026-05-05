from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.osce_exam_session import OsceExamSession
from app.repositories.base_repository import BaseRepository


class OsceExamSessionRepository(BaseRepository[OsceExamSession]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, OsceExamSession)

    async def get_by_user_and_id(self, user_id: int, session_id: UUID) -> OsceExamSession | None:
        result = await self.session.execute(
            select(OsceExamSession).where(
                OsceExamSession.user_id == user_id,
                OsceExamSession.id == session_id,
            )
        )
        return result.scalar_one_or_none()
