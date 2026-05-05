from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import QuestionDifficulty, TestSessionMode
from app.models.question import Question
from app.models.section import Section
from app.models.test_session import TestSession
from app.models.test_session_answer import TestSessionAnswer
from app.models.topic import Topic
from app.repositories.base_repository import BaseRepository


QUESTION_DETAIL_OPTIONS = (
    selectinload(Question.answer_options),
    selectinload(Question.explanation),
    selectinload(Question.topic).selectinload(Topic.section).selectinload(Section.faculty),
)


class QuestionRepository(BaseRepository[Question]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Question)

    async def list_filtered(
        self,
        faculty_id: int | None,
        topic_id: int | None,
        search: str | None,
        limit: int,
        offset: int,
    ) -> list[Question]:
        query = self._build_filtered_query(
            faculty_id=faculty_id,
            section_id=None,
            topic_id=topic_id,
            search=search,
            is_active=True,
        )
        query = query.options(*QUESTION_DETAIL_OPTIONS).order_by(Question.id).limit(limit).offset(offset)
        result = await self.session.execute(query)
        return list(result.scalars().unique().all())

    async def count_filtered(self, faculty_id: int | None, topic_id: int | None, search: str | None) -> int:
        query = self._build_count_query(
            faculty_id=faculty_id,
            section_id=None,
            topic_id=topic_id,
            search=search,
            is_active=True,
        )
        result = await self.session.execute(query)
        return int(result.scalar_one())

    async def list_admin_filtered(
        self,
        faculty_id: int | None,
        section_id: int | None,
        topic_id: int | None,
        search: str | None,
        is_active: bool | None,
        limit: int,
        offset: int,
    ) -> list[Question]:
        query = self._build_filtered_query(
            faculty_id=faculty_id,
            section_id=section_id,
            topic_id=topic_id,
            search=search,
            is_active=is_active,
        )
        query = query.options(*QUESTION_DETAIL_OPTIONS).order_by(Question.id.desc()).limit(limit).offset(offset)
        result = await self.session.execute(query)
        return list(result.scalars().unique().all())

    async def count_admin_filtered(
        self,
        faculty_id: int | None,
        section_id: int | None,
        topic_id: int | None,
        search: str | None,
        is_active: bool | None,
    ) -> int:
        query = self._build_count_query(
            faculty_id=faculty_id,
            section_id=section_id,
            topic_id=topic_id,
            search=search,
            is_active=is_active,
        )
        result = await self.session.execute(query)
        return int(result.scalar_one())

    async def list_for_session(
        self,
        faculty_id: int,
        topic_id: int | None,
        question_count: int,
        user_id: int,
        mode: TestSessionMode,
    ) -> list[Question]:
        query = (
            select(Question)
            .options(selectinload(Question.answer_options), selectinload(Question.explanation))
            .join(Question.topic)
            .join(Topic.section)
            .where(Question.is_active.is_(True), Section.faculty_id == faculty_id)
        )

        if topic_id is not None:
            query = query.where(Question.topic_id == topic_id)

        if mode == TestSessionMode.EXAM:
            query = query.order_by(func.random()).limit(question_count)
        else:
            performance_subquery = (
                select(
                    TestSessionAnswer.question_id.label("question_id"),
                    func.count(TestSessionAnswer.id).label("attempts_count"),
                    func.coalesce(
                        func.sum(case((TestSessionAnswer.is_correct.is_(True), 1), else_=0)),
                        0,
                    ).label("correct_answers"),
                    func.coalesce(
                        func.sum(case((TestSessionAnswer.is_correct.is_(False), 1), else_=0)),
                        0,
                    ).label("incorrect_answers"),
                    func.max(
                        case((TestSessionAnswer.is_correct.is_(False), TestSessionAnswer.answered_at), else_=None)
                    ).label("last_incorrect_at"),
                )
                .join(TestSession, TestSession.id == TestSessionAnswer.session_id)
                .where(TestSession.user_id == user_id)
                .group_by(TestSessionAnswer.question_id)
                .subquery()
            )

            attempts_count = func.coalesce(performance_subquery.c.attempts_count, 0)
            correct_answers = func.coalesce(performance_subquery.c.correct_answers, 0)
            incorrect_answers = func.coalesce(performance_subquery.c.incorrect_answers, 0)
            difficulty_priority = case(
                (Question.difficulty == QuestionDifficulty.HARD, 0),
                (Question.difficulty == QuestionDifficulty.MEDIUM, 1),
                else_=2,
            )
            struggle_bucket = case(
                (incorrect_answers >= 2, 0),
                (incorrect_answers == 1, 1),
                (attempts_count == 0, 2),
                else_=3,
            )
            accuracy_ratio = case(
                (attempts_count > 0, correct_answers * 1.0 / attempts_count),
                else_=1.1,
            )

            query = (
                query.outerjoin(performance_subquery, performance_subquery.c.question_id == Question.id)
                .order_by(
                    struggle_bucket.asc(),
                    accuracy_ratio.asc(),
                    difficulty_priority.asc(),
                    performance_subquery.c.last_incorrect_at.desc().nullslast(),
                    func.random(),
                )
                .limit(question_count)
            )

        result = await self.session.execute(query)
        return list(result.scalars().unique().all())

    async def get_by_ids(self, question_ids: list[int]) -> list[Question]:
        if not question_ids:
            return []

        query = (
            select(Question)
            .options(selectinload(Question.answer_options), selectinload(Question.explanation))
            .where(Question.id.in_(question_ids))
        )
        result = await self.session.execute(query)
        questions = {question.id: question for question in result.scalars().unique().all()}
        return [questions[question_id] for question_id in question_ids if question_id in questions]

    async def list_active_by_ids_for_session(
        self,
        faculty_id: int,
        question_ids: list[int],
        topic_id: int | None = None,
    ) -> list[Question]:
        if not question_ids:
            return []

        query = (
            select(Question)
            .options(selectinload(Question.answer_options), selectinload(Question.explanation))
            .join(Question.topic)
            .join(Topic.section)
            .where(
                Question.is_active.is_(True),
                Section.faculty_id == faculty_id,
                Question.id.in_(question_ids),
            )
        )

        if topic_id is not None:
            query = query.where(Question.topic_id == topic_id)

        result = await self.session.execute(query)
        questions = {question.id: question for question in result.scalars().unique().all()}
        return [questions[question_id] for question_id in question_ids if question_id in questions]

    async def get_with_details(self, question_id: int) -> Question | None:
        query = select(Question).options(*QUESTION_DETAIL_OPTIONS).where(Question.id == question_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_topic_and_text(self, topic_id: int, text: str) -> Question | None:
        query = (
            select(Question)
            .options(*QUESTION_DETAIL_OPTIONS)
            .where(Question.topic_id == topic_id, Question.text == text)
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def count_answer_usage(self, question_id: int) -> int:
        query = select(func.count(TestSessionAnswer.id)).where(TestSessionAnswer.question_id == question_id)
        result = await self.session.execute(query)
        return int(result.scalar_one())

    def _build_filtered_query(
        self,
        faculty_id: int | None,
        section_id: int | None,
        topic_id: int | None,
        search: str | None,
        is_active: bool | None,
    ):
        query = select(Question)
        query = self._apply_filters(query, faculty_id, section_id, topic_id, search, is_active)
        return query

    def _build_count_query(
        self,
        faculty_id: int | None,
        section_id: int | None,
        topic_id: int | None,
        search: str | None,
        is_active: bool | None,
    ):
        query = select(func.count(Question.id))
        query = self._apply_filters(query, faculty_id, section_id, topic_id, search, is_active)
        return query

    def _apply_filters(
        self,
        query,
        faculty_id: int | None,
        section_id: int | None,
        topic_id: int | None,
        search: str | None,
        is_active: bool | None,
    ):
        if faculty_id is not None or section_id is not None:
            query = query.join(Question.topic).join(Topic.section)

        if is_active is not None:
            query = query.where(Question.is_active.is_(is_active))

        if faculty_id is not None:
            query = query.where(Section.faculty_id == faculty_id)

        if section_id is not None:
            query = query.where(Topic.section_id == section_id)

        if topic_id is not None:
            query = query.where(Question.topic_id == topic_id)

        if search:
            query = query.where(Question.text.ilike(f"%{search}%"))

        return query
