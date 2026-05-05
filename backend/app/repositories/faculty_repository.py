from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.faculty import Faculty
from app.repositories.base_repository import BaseRepository


class FacultyRepository(BaseRepository[Faculty]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Faculty)

    async def list_all(self) -> list[Faculty]:
        result = await self.session.execute(select(Faculty).order_by(Faculty.code))
        return list(result.scalars().all())

    async def get_by_code(self, code: str) -> Faculty | None:
        result = await self.session.execute(select(Faculty).where(Faculty.code == code))
        return result.scalar_one_or_none()
