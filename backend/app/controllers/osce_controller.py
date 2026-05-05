from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.dependencies import DbSession, get_current_user
from app.models.user import User
from app.schemas.osce import (
    OsceAttemptStartRequest,
    OsceAttemptStartResponse,
    OsceAttemptSubmitRequest,
    OsceAttemptSubmitResponse,
    OsceStationDetailResponse,
    OsceStationListItemResponse,
)
from app.services.osce_service import OsceService


router = APIRouter(prefix="/osce/stations", tags=["osce"])


@router.get("", response_model=list[OsceStationListItemResponse])
async def list_stations(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[OsceStationListItemResponse]:
    return await OsceService(session).list_stations(user)


@router.get("/{slug}", response_model=OsceStationDetailResponse)
async def get_station(
    slug: str,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> OsceStationDetailResponse:
    return await OsceService(session).get_station(user, slug)


@router.post("/{slug}/attempts/start", response_model=OsceAttemptStartResponse, status_code=status.HTTP_201_CREATED)
async def start_attempt(
    slug: str,
    payload: OsceAttemptStartRequest,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> OsceAttemptStartResponse:
    return await OsceService(session).start_attempt(user, slug, payload)


@router.post("/{slug}/attempts", response_model=OsceAttemptSubmitResponse, status_code=status.HTTP_201_CREATED)
async def submit_attempt(
    slug: str,
    payload: OsceAttemptSubmitRequest,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> OsceAttemptSubmitResponse:
    return await OsceService(session).submit_attempt(user, slug, payload)
