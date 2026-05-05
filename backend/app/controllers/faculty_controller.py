from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.dependencies import DbSession, get_current_user
from app.models.user import User
from app.schemas.faculty import FacultyResponse
from app.services.faculty_service import FacultyService


router = APIRouter(prefix="/faculties", tags=["faculties"])


@router.get("", response_model=list[FacultyResponse])
async def list_faculties(
    session: DbSession,
    _: Annotated[User, Depends(get_current_user)],
) -> list[FacultyResponse]:
    return await FacultyService(session).list_faculties()
