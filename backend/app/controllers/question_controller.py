from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import DbSession, get_current_user
from app.models.user import User
from app.schemas.question import QuestionListResponse
from app.services.question_service import QuestionService


router = APIRouter(prefix="/questions", tags=["questions"])


@router.get("", response_model=QuestionListResponse)
async def list_questions(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
    faculty_id: int | None = Query(default=None),
    topic_id: int | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=255),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> QuestionListResponse:
    return await QuestionService(session).list_questions(
        user=user,
        faculty_id=faculty_id,
        topic_id=topic_id,
        search=search,
        limit=limit,
        offset=offset,
    )
