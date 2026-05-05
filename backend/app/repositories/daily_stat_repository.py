from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_stat import DailyStat
from app.repositories.base_repository import BaseRepository


class DailyStatRepository(BaseRepository[DailyStat]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, DailyStat)

    async def get_by_user_and_date(self, user_id: int, stat_date: date) -> DailyStat | None:
        result = await self.session.execute(
            select(DailyStat).where(DailyStat.user_id == user_id, DailyStat.stat_date == stat_date)
        )
        return result.scalar_one_or_none()

    async def add_or_accumulate(
        self,
        user_id: int,
        stat_date: date,
        questions_answered: int,
        correct_answers: int,
        study_minutes: int,
        study_seconds: int,
    ) -> DailyStat:
        insert_statement = insert(DailyStat).values(
            user_id=user_id,
            stat_date=stat_date,
            questions_answered=questions_answered,
            correct_answers=correct_answers,
            study_minutes=study_minutes,
            study_seconds=study_seconds,
        )
        excluded = insert_statement.excluded
        statement = insert_statement.on_conflict_do_update(
            index_elements=[DailyStat.user_id, DailyStat.stat_date],
            set_={
                "questions_answered": DailyStat.questions_answered + excluded.questions_answered,
                "correct_answers": DailyStat.correct_answers + excluded.correct_answers,
                "study_minutes": DailyStat.study_minutes + excluded.study_minutes,
                "study_seconds": DailyStat.study_seconds + excluded.study_seconds,
            },
        )
        await self.session.execute(statement)

        result = await self.session.execute(
            select(DailyStat).where(DailyStat.user_id == user_id, DailyStat.stat_date == stat_date)
        )
        return result.scalar_one()

    async def list_recent(self, user_id: int, limit: int) -> list[DailyStat]:
        result = await self.session.execute(
            select(DailyStat).where(DailyStat.user_id == user_id).order_by(DailyStat.stat_date.desc()).limit(limit)
        )
        return list(result.scalars().all())
