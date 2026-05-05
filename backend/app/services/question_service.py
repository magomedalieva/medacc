from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.models.enums import UserRole
from app.models.question import Question
from app.models.user import User
from app.repositories.question_repository import QuestionRepository
from app.schemas.question import AnswerOptionResponse, QuestionListResponse, QuestionResponse


class QuestionService:
    def __init__(self, session: AsyncSession) -> None:
        self.question_repository = QuestionRepository(session)

    async def list_questions(
        self,
        user: User,
        faculty_id: int | None,
        topic_id: int | None,
        search: str | None,
        limit: int,
        offset: int,
    ) -> QuestionListResponse:
        resolved_faculty_id = faculty_id if faculty_id is not None else user.faculty_id

        if user.role == UserRole.STUDENT and faculty_id is not None and faculty_id != user.faculty_id:
            raise ForbiddenError("Нет доступа к материалам другого факультета")

        if resolved_faculty_id is None:
            return QuestionListResponse(items=[], total=0, limit=limit, offset=offset)

        questions = await self.question_repository.list_filtered(resolved_faculty_id, topic_id, search, limit, offset)
        total = await self.question_repository.count_filtered(resolved_faculty_id, topic_id, search)

        return QuestionListResponse(
            items=[self._to_question_response(question) for question in questions],
            total=total,
            limit=limit,
            offset=offset,
        )

    def _to_question_response(self, question: Question) -> QuestionResponse:
        return QuestionResponse(
            id=question.id,
            topic_id=question.topic_id,
            text=question.text,
            difficulty=question.difficulty.value,
            answer_options=[
                AnswerOptionResponse(label=answer_option.label, text=answer_option.text)
                for answer_option in sorted(question.answer_options, key=lambda item: item.label)
            ],
        )
