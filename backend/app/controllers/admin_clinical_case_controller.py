from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.dependencies import DbSession, get_current_admin
from app.models.user import User
from app.schemas.admin_clinical_case import (
    AdminClinicalCaseDeleteResponse,
    AdminClinicalCaseDetailsResponse,
    AdminClinicalCaseListItemResponse,
    AdminClinicalCaseWriteRequest,
)
from app.services.admin_clinical_case_service import AdminClinicalCaseService


router = APIRouter(prefix="/admin/cases", tags=["admin-cases"])


@router.get("", response_model=list[AdminClinicalCaseListItemResponse])
async def list_cases(
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> list[AdminClinicalCaseListItemResponse]:
    return await AdminClinicalCaseService(session).list_cases()


@router.get("/{slug}", response_model=AdminClinicalCaseDetailsResponse)
async def get_case(
    slug: str,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminClinicalCaseDetailsResponse:
    return await AdminClinicalCaseService(session).get_case(slug)


@router.post("", response_model=AdminClinicalCaseDetailsResponse, status_code=status.HTTP_201_CREATED)
async def create_case(
    payload: AdminClinicalCaseWriteRequest,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminClinicalCaseDetailsResponse:
    return await AdminClinicalCaseService(session).create_case(payload)


@router.put("/{slug}", response_model=AdminClinicalCaseDetailsResponse)
async def update_case(
    slug: str,
    payload: AdminClinicalCaseWriteRequest,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminClinicalCaseDetailsResponse:
    return await AdminClinicalCaseService(session).update_case(slug, payload)


@router.delete("/{slug}", response_model=AdminClinicalCaseDeleteResponse)
async def delete_case(
    slug: str,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminClinicalCaseDeleteResponse:
    return await AdminClinicalCaseService(session).delete_case(slug)
