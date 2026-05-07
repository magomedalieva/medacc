from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.clock import utc_now
from app.models.enums import PlanTaskType
from app.models.plan_task import PlanTask
from app.models.study_plan import StudyPlan
from app.models.topic import Topic
from app.repositories.base_repository import BaseRepository


class StudyPlanRepository(BaseRepository[StudyPlan]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, StudyPlan)

    async def get_by_user_id(self, user_id: int) -> StudyPlan | None:
        result = await self.session.execute(
            select(StudyPlan)
            .options(selectinload(StudyPlan.tasks).selectinload(PlanTask.topic).selectinload(Topic.section))
            .where(StudyPlan.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def delete_tasks(self, plan_id: int) -> None:
        await self.session.execute(delete(PlanTask).where(PlanTask.plan_id == plan_id))

    async def delete_tasks_from_date(self, plan_id: int, start_date: date) -> None:
        await self.session.execute(
            delete(PlanTask).where(PlanTask.plan_id == plan_id, PlanTask.scheduled_date >= start_date)
        )

    async def delete_tasks_from_date_excluding_task(
        self,
        plan_id: int,
        start_date: date,
        excluded_task_id: int,
    ) -> None:
        await self.session.execute(
            delete(PlanTask).where(
                PlanTask.plan_id == plan_id,
                PlanTask.scheduled_date >= start_date,
                PlanTask.id != excluded_task_id,
            )
        )

    async def list_tasks_in_range(self, plan_id: int, start_date: date, end_date: date) -> list[PlanTask]:
        result = await self.session.execute(
            select(PlanTask)
            .options(selectinload(PlanTask.topic).selectinload(Topic.section))
            .where(
                PlanTask.plan_id == plan_id,
                PlanTask.scheduled_date >= start_date,
                PlanTask.scheduled_date <= end_date,
            )
            .order_by(PlanTask.scheduled_date.asc(), PlanTask.id.asc())
        )
        return list(result.scalars().all())

    async def get_task_for_user(self, user_id: int, task_id: int) -> PlanTask | None:
        result = await self.session.execute(
            select(PlanTask)
            .join(PlanTask.plan)
            .options(selectinload(PlanTask.topic).selectinload(Topic.section))
            .where(StudyPlan.user_id == user_id, PlanTask.id == task_id)
        )
        return result.scalar_one_or_none()

    async def get_next_active_task_for_user(self, user_id: int) -> PlanTask | None:
        result = await self.session.execute(
            select(PlanTask)
            .join(PlanTask.plan)
            .options(selectinload(PlanTask.topic).selectinload(Topic.section))
            .where(
                StudyPlan.user_id == user_id,
                PlanTask.is_completed.is_(False),
                PlanTask.is_skipped.is_(False),
                PlanTask.is_stale.is_(False),
            )
            .order_by(PlanTask.scheduled_date.asc(), PlanTask.id.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_active_tasks_before(self, user_id: int, before_date: date) -> list[PlanTask]:
        result = await self.session.execute(
            select(PlanTask)
            .join(PlanTask.plan)
            .options(selectinload(PlanTask.topic).selectinload(Topic.section))
            .where(
                StudyPlan.user_id == user_id,
                PlanTask.scheduled_date < before_date,
                PlanTask.is_completed.is_(False),
                PlanTask.is_skipped.is_(False),
                PlanTask.is_stale.is_(False),
            )
            .order_by(PlanTask.scheduled_date.asc(), PlanTask.id.asc())
        )
        return list(result.scalars().all())

    async def get_pending_task_for_completion(
        self,
        user_id: int,
        task_type: PlanTaskType,
        topic_id: int | None,
        osce_station_slug: str | None,
        max_scheduled_date: date,
    ) -> PlanTask | None:
        result = await self.session.execute(
            select(PlanTask)
            .join(PlanTask.plan)
            .options(selectinload(PlanTask.topic).selectinload(Topic.section))
            .where(
                StudyPlan.user_id == user_id,
                PlanTask.task_type == task_type,
                PlanTask.topic_id == topic_id,
                PlanTask.osce_station_slug == osce_station_slug,
                PlanTask.scheduled_date <= max_scheduled_date,
                PlanTask.is_completed.is_(False),
                PlanTask.is_skipped.is_(False),
                PlanTask.is_stale.is_(False),
            )
            .order_by(PlanTask.scheduled_date.asc(), PlanTask.id.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_completed_task_for_completion(
        self,
        user_id: int,
        task_type: PlanTaskType,
        topic_id: int | None,
        osce_station_slug: str | None,
        max_scheduled_date: date,
    ) -> PlanTask | None:
        result = await self.session.execute(
            select(PlanTask)
            .join(PlanTask.plan)
            .options(selectinload(PlanTask.topic).selectinload(Topic.section))
            .where(
                StudyPlan.user_id == user_id,
                PlanTask.task_type == task_type,
                PlanTask.topic_id == topic_id,
                PlanTask.osce_station_slug == osce_station_slug,
                PlanTask.scheduled_date <= max_scheduled_date,
                PlanTask.is_completed.is_(True),
            )
            .order_by(PlanTask.completed_at.desc(), PlanTask.scheduled_date.desc(), PlanTask.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    def mark_task_completed(self, task: PlanTask) -> None:
        task.is_completed = True
        task.is_skipped = False
        task.is_stale = False
        task.completed_at = utc_now()
        task.missed_at = None
        task.missed_reason = None

    def mark_task_stale_missed(self, task: PlanTask, *, reason: str) -> None:
        task.is_completed = False
        task.is_skipped = True
        task.is_stale = True
        task.completed_at = None
        task.missed_at = utc_now()
        task.missed_reason = reason
