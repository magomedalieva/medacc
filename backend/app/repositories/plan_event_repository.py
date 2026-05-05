from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plan_event import PlanEvent
from app.repositories.base_repository import BaseRepository


class PlanEventRepository(BaseRepository[PlanEvent]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, PlanEvent)

    async def get_latest_by_user(self, user_id: int) -> PlanEvent | None:
        result = await self.session.execute(
            select(PlanEvent)
            .where(PlanEvent.user_id == user_id)
            .order_by(PlanEvent.created_at.desc(), PlanEvent.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_by_user(self, user_id: int, limit: int = 5) -> list[PlanEvent]:
        result = await self.session.execute(
            select(PlanEvent)
            .where(PlanEvent.user_id == user_id)
            .order_by(PlanEvent.created_at.desc(), PlanEvent.id.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
