from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import DbSession, get_current_user
from app.core.exceptions import ForbiddenError
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.topic import TopicResponse
from app.services.topic_service import TopicService


router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("", response_model=list[TopicResponse])
async def list_topics(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
    faculty_id: int | None = Query(default=None, gt=0),
) -> list[TopicResponse]:
    resolved_faculty_id = faculty_id if faculty_id is not None else user.faculty_id

    if user.role == UserRole.STUDENT and faculty_id is not None and faculty_id != user.faculty_id:
        raise ForbiddenError("Нет доступа к материалам другого факультета")

    if resolved_faculty_id is None:
        return []

    return await TopicService(session).list_topics(resolved_faculty_id)
