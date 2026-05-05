from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import DbSession, get_current_admin
from app.models.user import User
from app.schemas.admin_student import AdminStudentListResponse
from app.services.admin_student_service import AdminStudentService


router = APIRouter(prefix="/admin/users", tags=["admin-users"])


@router.get("/students", response_model=AdminStudentListResponse)
async def list_students(
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
    faculty_id: int | None = Query(default=None, gt=0),
    search: str | None = Query(default=None, min_length=1, max_length=255),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> AdminStudentListResponse:
    return await AdminStudentService(session).list_students(
        faculty_id=faculty_id,
        search=search,
        limit=limit,
        offset=offset,
    )
