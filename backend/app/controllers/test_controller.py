from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import DbSession, get_current_user
from app.models.user import User
from app.schemas.test import (
    TestSessionAnswerRequest,
    TestSessionAnswerResponse,
    TestSessionCreateRequest,
    TestSessionFinishRequest,
    TestSessionFinishResponse,
    TestSessionResponse,
)
from app.services.test_service import TestService


router = APIRouter(prefix="/tests", tags=["tests"])


@router.post("/sessions", response_model=TestSessionResponse, status_code=status.HTTP_201_CREATED)
async def start_session(
    payload: TestSessionCreateRequest,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> TestSessionResponse:
    return await TestService(session).start_session(user, payload)


@router.get("/sessions/{session_id}", response_model=TestSessionResponse)
async def get_session(
    session_id: UUID,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> TestSessionResponse:
    return await TestService(session).get_session(user, session_id)


@router.post("/sessions/{session_id}/answers", response_model=TestSessionAnswerResponse)
async def submit_answer(
    session_id: UUID,
    payload: TestSessionAnswerRequest,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> TestSessionAnswerResponse:
    return await TestService(session).submit_answer(user, session_id, payload)


@router.post("/sessions/{session_id}/finish", response_model=TestSessionFinishResponse)
async def finish_session(
    session_id: UUID,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
    payload: TestSessionFinishRequest | None = None,
) -> TestSessionFinishResponse:
    return await TestService(session).finish_session(
        user,
        session_id,
        planned_task_id=payload.planned_task_id if payload is not None else None,
    )
