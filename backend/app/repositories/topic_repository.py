from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.section import Section
from app.models.topic import Topic
from app.repositories.base_repository import BaseRepository


class TopicRepository(BaseRepository[Topic]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Topic)

    async def list_by_faculty(self, faculty_id: int) -> list[Topic]:
        result = await self.session.execute(
            select(Topic)
            .join(Topic.section)
            .options(selectinload(Topic.section))
            .where(Section.faculty_id == faculty_id)
            .order_by(Section.order_index, Topic.order_index, Topic.name)
        )
        return list(result.scalars().all())

    async def get_by_section_and_name(self, section_id: int, name: str) -> Topic | None:
        result = await self.session.execute(
            select(Topic).where(Topic.section_id == section_id, Topic.name == name)
        )
        return result.scalar_one_or_none()

    async def get_with_section(self, topic_id: int) -> Topic | None:
        result = await self.session.execute(
            select(Topic)
            .options(selectinload(Topic.section).selectinload(Section.faculty))
            .where(Topic.id == topic_id)
        )
        return result.scalar_one_or_none()
