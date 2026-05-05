from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.dependencies import DbSession, get_current_user
from app.models.user import User
from app.schemas.schedule import (
    PlanTaskRescheduleRequest,
    SchedulePreferencesUpdateRequest,
    SchedulePreferencesUpdateResponse,
    PlanTaskResponse,
    ScheduleResponse,
    ScheduleTodayResponse,
)
from app.services.schedule_service import ScheduleService


router = APIRouter(prefix="/schedule", tags=["schedule"])


@router.get("", response_model=ScheduleResponse)
async def get_schedule(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ScheduleResponse:
    return await ScheduleService(session).get_schedule(user)


@router.get("/today", response_model=ScheduleTodayResponse)
async def get_today_schedule(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ScheduleTodayResponse:
    return await ScheduleService(session).get_today(user)


@router.post("/regenerate", response_model=ScheduleResponse)
async def regenerate_schedule(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ScheduleResponse:
    return await ScheduleService(session).regenerate_plan_for_user(user)


@router.patch("/preferences", response_model=SchedulePreferencesUpdateResponse)
async def update_schedule_preferences(
    payload: SchedulePreferencesUpdateRequest,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> SchedulePreferencesUpdateResponse:
    return await ScheduleService(session).update_study_preferences(
        user,
        daily_study_minutes=payload.daily_study_minutes,
        study_intensity=payload.study_intensity,
        study_weekdays=payload.study_weekdays,
    )


@router.post("/tasks/{task_id}/skip", response_model=PlanTaskResponse)
async def skip_task(
    task_id: int,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> PlanTaskResponse:
    return await ScheduleService(session).skip_task(user, task_id)


@router.post("/tasks/{task_id}/postpone", response_model=PlanTaskResponse)
async def postpone_task(
    task_id: int,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> PlanTaskResponse:
    return await ScheduleService(session).postpone_task(user, task_id)


@router.post("/tasks/{task_id}/reschedule", response_model=ScheduleResponse)
async def reschedule_task(
    task_id: int,
    payload: PlanTaskRescheduleRequest,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ScheduleResponse:
    return await ScheduleService(session).reschedule_task(user, task_id, payload.target_date)
