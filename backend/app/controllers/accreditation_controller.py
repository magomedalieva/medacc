from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.dependencies import DbSession, get_current_user
from app.models.user import User
from app.schemas.accreditation import ExamSimulationCreateRequest, ExamSimulationResponse
from app.schemas.analytics import ExamReadinessProtocolResponse
from app.services.accreditation_service import AccreditationService


router = APIRouter(prefix="/accreditation", tags=["accreditation"])


@router.get("/simulations", response_model=list[ExamSimulationResponse])
async def list_simulations(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[ExamSimulationResponse]:
    return await AccreditationService(session).list_simulations(user)


@router.post("/simulations", response_model=ExamSimulationResponse, status_code=status.HTTP_201_CREATED)
async def create_simulation(
    payload: ExamSimulationCreateRequest,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ExamSimulationResponse:
    return await AccreditationService(session).create_simulation(
        user,
        simulation_type=payload.simulation_type,
    )


@router.get("/protocol", response_model=ExamReadinessProtocolResponse)
async def get_protocol(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ExamReadinessProtocolResponse:
    return await AccreditationService(session).get_exam_protocol(user)
