from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.section import Section
from app.repositories.base_repository import BaseRepository


class SectionRepository(BaseRepository[Section]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Section)

    async def get_by_faculty_and_name(self, faculty_id: int, name: str) -> Section | None:
        result = await self.session.execute(
            select(Section).where(Section.faculty_id == faculty_id, Section.name == name)
        )
        return result.scalar_one_or_none()
