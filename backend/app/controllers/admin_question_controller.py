from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import DbSession, get_current_admin
from app.models.user import User
from app.schemas.admin_question import (
    AdminQuestionCreateRequest,
    AdminQuestionDeleteResponse,
    AdminQuestionDetailsResponse,
    AdminQuestionListResponse,
    AdminQuestionUpdateRequest,
)
from app.services.admin_question_service import AdminQuestionService


router = APIRouter(prefix="/admin/questions", tags=["admin-questions"])


@router.get("", response_model=AdminQuestionListResponse)
async def list_questions(
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
    faculty_id: int | None = Query(default=None, gt=0),
    section_id: int | None = Query(default=None, gt=0),
    topic_id: int | None = Query(default=None, gt=0),
    search: str | None = Query(default=None, min_length=1, max_length=255),
    is_active: bool | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> AdminQuestionListResponse:
    return await AdminQuestionService(session).list_questions(
        faculty_id=faculty_id,
        section_id=section_id,
        topic_id=topic_id,
        search=search,
        is_active=is_active,
        limit=limit,
        offset=offset,
    )


@router.get("/{question_id}", response_model=AdminQuestionDetailsResponse)
async def get_question(
    question_id: int,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminQuestionDetailsResponse:
    return await AdminQuestionService(session).get_question(question_id)


@router.post("", response_model=AdminQuestionDetailsResponse, status_code=status.HTTP_201_CREATED)
async def create_question(
    payload: AdminQuestionCreateRequest,
    session: DbSession,
    admin: Annotated[User, Depends(get_current_admin)],
) -> AdminQuestionDetailsResponse:
    return await AdminQuestionService(session).create_question(admin, payload)


@router.put("/{question_id}", response_model=AdminQuestionDetailsResponse)
async def update_question(
    question_id: int,
    payload: AdminQuestionUpdateRequest,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminQuestionDetailsResponse:
    return await AdminQuestionService(session).update_question(question_id, payload)


@router.post("/{question_id}/deactivate", response_model=AdminQuestionDetailsResponse)
async def deactivate_question(
    question_id: int,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminQuestionDetailsResponse:
    return await AdminQuestionService(session).deactivate_question(question_id)


@router.post("/{question_id}/activate", response_model=AdminQuestionDetailsResponse)
async def activate_question(
    question_id: int,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminQuestionDetailsResponse:
    return await AdminQuestionService(session).activate_question(question_id)


@router.delete("/{question_id}", response_model=AdminQuestionDeleteResponse)
async def delete_question(
    question_id: int,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminQuestionDeleteResponse:
    return await AdminQuestionService(session).delete_question(question_id)
