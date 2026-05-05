from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.osce_attempt import OsceAttempt
from app.repositories.base_repository import BaseRepository


class OsceAttemptRepository(BaseRepository[OsceAttempt]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, OsceAttempt)

    async def list_by_user(self, user_id: int) -> list[OsceAttempt]:
        result = await self.session.execute(
            select(OsceAttempt)
            .where(OsceAttempt.user_id == user_id)
            .order_by(OsceAttempt.submitted_at.desc(), OsceAttempt.id.desc())
        )
        return list(result.scalars().all())

    async def list_by_user_and_station(self, user_id: int, station_slug: str) -> list[OsceAttempt]:
        result = await self.session.execute(
            select(OsceAttempt)
            .where(
                OsceAttempt.user_id == user_id,
                OsceAttempt.station_slug == station_slug,
            )
            .order_by(OsceAttempt.submitted_at.desc(), OsceAttempt.id.desc())
        )
        return list(result.scalars().all())

    async def get_by_session_signature(
        self,
        *,
        user_id: int,
        station_slug: str,
        submitted_at: datetime,
    ) -> OsceAttempt | None:
        result = await self.session.execute(
            select(OsceAttempt).where(
                OsceAttempt.user_id == user_id,
                OsceAttempt.station_slug == station_slug,
                OsceAttempt.submitted_at == submitted_at,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_simulation(self, simulation_id: UUID) -> list[OsceAttempt]:
        result = await self.session.execute(
            select(OsceAttempt)
            .where(OsceAttempt.simulation_id == simulation_id)
            .order_by(OsceAttempt.submitted_at.desc(), OsceAttempt.id.desc())
        )
        return list(result.scalars().all())
