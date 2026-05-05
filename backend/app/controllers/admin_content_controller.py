from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.dependencies import DbSession, get_current_admin
from app.models.user import User
from app.schemas.admin_content import AdminContentCoverageResponse
from app.services.admin_content_service import AdminContentService


router = APIRouter(prefix="/admin/content", tags=["admin-content"])


@router.get("/coverage", response_model=AdminContentCoverageResponse)
async def get_content_coverage(
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminContentCoverageResponse:
    return await AdminContentService(session).get_coverage()
