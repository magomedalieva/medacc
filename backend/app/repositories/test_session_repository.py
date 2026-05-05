import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.test_session import TestSession
from app.models.test_session_answer import TestSessionAnswer
from app.repositories.base_repository import BaseRepository


class TestSessionRepository(BaseRepository[TestSession]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, TestSession)

    async def get_with_answers(self, session_id: uuid.UUID) -> TestSession | None:
        query = (
            select(TestSession)
            .options(selectinload(TestSession.answers))
            .where(TestSession.id == session_id)
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_answer(self, session_id: uuid.UUID, question_id: int) -> TestSessionAnswer | None:
        query = select(TestSessionAnswer).where(
            TestSessionAnswer.session_id == session_id,
            TestSessionAnswer.question_id == question_id,
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def upsert_answer(
        self,
        session_id: uuid.UUID,
        question_id: int,
        selected_option_label: str,
        is_correct: bool,
    ) -> TestSessionAnswer:
        answer = await self.get_answer(session_id, question_id)

        if answer is None:
            answer = TestSessionAnswer(
                session_id=session_id,
                question_id=question_id,
                selected_option_label=selected_option_label,
                is_correct=is_correct,
            )
            self.session.add(answer)
            return answer

        return answer

    async def count_answered_questions(self, session_id: uuid.UUID) -> int:
        result = await self.session.execute(
            select(func.count(TestSessionAnswer.id)).where(TestSessionAnswer.session_id == session_id)
        )
        return int(result.scalar_one())

    async def count_correct_answers(self, session_id: uuid.UUID) -> int:
        result = await self.session.execute(
            select(func.count(TestSessionAnswer.id)).where(
                TestSessionAnswer.session_id == session_id,
                TestSessionAnswer.is_correct.is_(True),
            )
        )
        return int(result.scalar_one())
