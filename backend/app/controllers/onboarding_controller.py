from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.dependencies import DbSession, get_current_user
from app.models.user import User
from app.schemas.onboarding import OnboardingCompleteRequest, OnboardingCompleteResponse
from app.services.onboarding_service import OnboardingService


router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("/complete", response_model=OnboardingCompleteResponse)
async def complete_onboarding(
    payload: OnboardingCompleteRequest,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> OnboardingCompleteResponse:
    return await OnboardingService(session).complete(user, payload)
