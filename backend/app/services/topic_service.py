from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.topic_repository import TopicRepository
from app.schemas.topic import TopicResponse


class TopicService:
    def __init__(self, session: AsyncSession) -> None:
        self.topic_repository = TopicRepository(session)

    async def list_topics(self, faculty_id: int) -> list[TopicResponse]:
        topics = await self.topic_repository.list_by_faculty(faculty_id)
        return [
            TopicResponse(
                id=topic.id,
                name=topic.name,
                description=topic.description,
                section_id=topic.section_id,
                section_name=topic.section.name,
            )
            for topic in topics
        ]
