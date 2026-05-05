from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.dependencies import DbSession, get_current_admin
from app.models.user import User
from app.schemas.import_job import (
    ImportFileResponse,
    QuestionImportRequest,
    QuestionImportResponse,
    QuestionImportValidationResponse,
)
from app.services.question_import_service import QuestionImportService


router = APIRouter(prefix="/admin/imports", tags=["admin-imports"])


@router.get("/files", response_model=list[ImportFileResponse])
async def list_import_files(
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> list[ImportFileResponse]:
    return await QuestionImportService(session).list_available_files()


@router.post("/questions", response_model=QuestionImportResponse)
async def import_questions(
    payload: QuestionImportRequest,
    session: DbSession,
    admin: Annotated[User, Depends(get_current_admin)],
) -> QuestionImportResponse:
    return await QuestionImportService(session).import_questions(admin, payload)


@router.post("/questions/validate", response_model=QuestionImportValidationResponse)
async def validate_questions_import(
    payload: QuestionImportRequest,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> QuestionImportValidationResponse:
    return await QuestionImportService(session).validate_questions(payload)
