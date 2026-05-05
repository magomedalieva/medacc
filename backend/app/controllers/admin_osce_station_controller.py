from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.dependencies import DbSession, get_current_admin
from app.models.user import User
from app.schemas.admin_osce_station import (
    AdminOsceStationDeleteResponse,
    AdminOsceStationDetailsResponse,
    AdminOsceStationListItemResponse,
    AdminOsceStationWriteRequest,
)
from app.services.admin_osce_station_service import AdminOsceStationService


router = APIRouter(prefix="/admin/osce", tags=["admin-osce"])


@router.get("", response_model=list[AdminOsceStationListItemResponse])
async def list_stations(
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> list[AdminOsceStationListItemResponse]:
    return await AdminOsceStationService(session).list_stations()


@router.get("/{slug}", response_model=AdminOsceStationDetailsResponse)
async def get_station(
    slug: str,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminOsceStationDetailsResponse:
    return await AdminOsceStationService(session).get_station(slug)


@router.post("", response_model=AdminOsceStationDetailsResponse, status_code=status.HTTP_201_CREATED)
async def create_station(
    payload: AdminOsceStationWriteRequest,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminOsceStationDetailsResponse:
    return await AdminOsceStationService(session).create_station(payload)


@router.put("/{slug}", response_model=AdminOsceStationDetailsResponse)
async def update_station(
    slug: str,
    payload: AdminOsceStationWriteRequest,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminOsceStationDetailsResponse:
    return await AdminOsceStationService(session).update_station(slug, payload)


@router.delete("/{slug}", response_model=AdminOsceStationDeleteResponse)
async def delete_station(
    slug: str,
    session: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
) -> AdminOsceStationDeleteResponse:
    return await AdminOsceStationService(session).delete_station(slug)
