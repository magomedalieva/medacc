from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.faculty_repository import FacultyRepository
from app.schemas.faculty import FacultyResponse


class FacultyService:
    def __init__(self, session: AsyncSession) -> None:
        self.faculty_repository = FacultyRepository(session)

    async def list_faculties(self) -> list[FacultyResponse]:
        faculties = await self.faculty_repository.list_all()
        return [FacultyResponse.model_validate(faculty) for faculty in faculties]
