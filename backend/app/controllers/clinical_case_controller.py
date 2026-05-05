from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.dependencies import DbSession, get_current_user
from app.models.user import User
from app.schemas.clinical_case import (
    ClinicalCaseAttemptStartRequest,
    ClinicalCaseAttemptStartResponse,
    ClinicalCaseCompletionRequest,
    ClinicalCaseCompletionResponse,
    ClinicalCaseDetailResponse,
    ClinicalCaseListItemResponse,
)
from app.services.clinical_case_service import ClinicalCaseService


router = APIRouter(prefix="/cases", tags=["cases"])


@router.get("", response_model=list[ClinicalCaseListItemResponse])
async def list_cases(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[ClinicalCaseListItemResponse]:
    return await ClinicalCaseService(session).list_cases(user)


@router.get("/{slug}", response_model=ClinicalCaseDetailResponse)
async def get_case(
    slug: str,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ClinicalCaseDetailResponse:
    return await ClinicalCaseService(session).get_case(user, slug)


@router.post("/{slug}/attempts", response_model=ClinicalCaseAttemptStartResponse, status_code=status.HTTP_201_CREATED)
async def start_case_attempt(
    slug: str,
    payload: ClinicalCaseAttemptStartRequest,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ClinicalCaseAttemptStartResponse:
    return await ClinicalCaseService(session).start_case_attempt(user, slug, payload)


@router.post("/completions", response_model=ClinicalCaseCompletionResponse)
async def complete_case(
    payload: ClinicalCaseCompletionRequest,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ClinicalCaseCompletionResponse:
    return await ClinicalCaseService(session).complete_case(user, payload)
