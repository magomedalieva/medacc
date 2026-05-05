from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.answer_option import AnswerOption
from app.models.question import Question
from app.models.question_explanation import QuestionExplanation
from app.models.user import User
from app.repositories.question_repository import QuestionRepository
from app.repositories.topic_repository import TopicRepository
from app.schemas.admin_question import (
    AdminAnswerOptionResponse,
    AdminAnswerOptionWriteRequest,
    AdminQuestionCreateRequest,
    AdminQuestionDeleteResponse,
    AdminQuestionDetailsResponse,
    AdminQuestionListItemResponse,
    AdminQuestionListResponse,
    AdminQuestionUpdateRequest,
)


class AdminQuestionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.question_repository = QuestionRepository(session)
        self.topic_repository = TopicRepository(session)

    async def list_questions(
        self,
        faculty_id: int | None,
        section_id: int | None,
        topic_id: int | None,
        search: str | None,
        is_active: bool | None,
        limit: int,
        offset: int,
    ) -> AdminQuestionListResponse:
        questions = await self.question_repository.list_admin_filtered(
            faculty_id=faculty_id,
            section_id=section_id,
            topic_id=topic_id,
            search=search,
            is_active=is_active,
            limit=limit,
            offset=offset,
        )
        total = await self.question_repository.count_admin_filtered(
            faculty_id=faculty_id,
            section_id=section_id,
            topic_id=topic_id,
            search=search,
            is_active=is_active,
        )

        return AdminQuestionListResponse(
            items=[self._to_list_item_response(question) for question in questions],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def get_question(self, question_id: int) -> AdminQuestionDetailsResponse:
        question = await self.question_repository.get_with_details(question_id)

        if question is None:
            raise NotFoundError("Вопрос не найден")

        return self._to_details_response(question)

    async def create_question(self, actor: User, payload: AdminQuestionCreateRequest) -> AdminQuestionDetailsResponse:
        await self._ensure_topic_exists(payload.topic_id)
        await self._ensure_question_uniqueness(payload.topic_id, payload.text)

        question = Question(
            topic_id=payload.topic_id,
            text=payload.text,
            difficulty=payload.difficulty,
            is_active=payload.is_active,
            created_by=actor.id,
        )
        question.answer_options = self._build_answer_options(payload.answer_options)
        question.explanation = self._build_explanation(payload.explanation)

        self.question_repository.add(question)
        await self.session.flush()
        await self.session.commit()

        return await self.get_question(question.id)

    async def update_question(
        self,
        question_id: int,
        payload: AdminQuestionUpdateRequest,
    ) -> AdminQuestionDetailsResponse:
        question = await self.question_repository.get_with_details(question_id)

        if question is None:
            raise NotFoundError("Вопрос не найден")

        await self._ensure_topic_exists(payload.topic_id)
        await self._ensure_question_uniqueness(payload.topic_id, payload.text, question.id)

        question.topic_id = payload.topic_id
        question.text = payload.text
        question.difficulty = payload.difficulty
        question.is_active = payload.is_active
        question.answer_options.clear()
        question.answer_options.extend(self._build_answer_options(payload.answer_options))

        explanation = self._build_explanation(payload.explanation)

        if explanation is None:
            question.explanation = None
        elif question.explanation is None:
            question.explanation = explanation
        else:
            question.explanation.text = explanation.text

        await self.session.commit()

        return await self.get_question(question.id)

    async def deactivate_question(self, question_id: int) -> AdminQuestionDetailsResponse:
        return await self._set_question_activity(question_id, is_active=False)

    async def activate_question(self, question_id: int) -> AdminQuestionDetailsResponse:
        return await self._set_question_activity(question_id, is_active=True)

    async def delete_question(self, question_id: int) -> AdminQuestionDeleteResponse:
        question = await self.question_repository.get_with_details(question_id)

        if question is None:
            raise NotFoundError("Вопрос не найден")

        answer_usage_count = await self.question_repository.count_answer_usage(question_id)

        if answer_usage_count > 0:
            raise ConflictError("Вопрос уже использовался в попытках студентов. Деактивируйте его вместо удаления")

        await self.session.delete(question)
        await self.session.commit()

        return AdminQuestionDeleteResponse(id=question_id, deleted=True)

    async def _set_question_activity(self, question_id: int, is_active: bool) -> AdminQuestionDetailsResponse:
        question = await self.question_repository.get_with_details(question_id)

        if question is None:
            raise NotFoundError("Вопрос не найден")

        question.is_active = is_active
        await self.session.commit()

        return self._to_details_response(question)

    async def _ensure_topic_exists(self, topic_id: int) -> None:
        topic = await self.topic_repository.get_with_section(topic_id)

        if topic is None:
            raise NotFoundError("Тема не найдена")

    async def _ensure_question_uniqueness(
        self,
        topic_id: int,
        text: str,
        current_question_id: int | None = None,
    ) -> None:
        existing_question = await self.question_repository.get_by_topic_and_text(topic_id, text)

        if existing_question is None:
            return

        if current_question_id is not None and existing_question.id == current_question_id:
            return

        raise ConflictError("В этой теме уже есть вопрос с таким текстом")

    def _build_answer_options(
        self,
        answer_options: list[AdminAnswerOptionWriteRequest],
    ) -> list[AnswerOption]:
        return [
            AnswerOption(
                label=item.label,
                text=item.text,
                is_correct=item.is_correct,
                explanation=item.explanation,
            )
            for item in sorted(answer_options, key=lambda value: value.label)
        ]

    def _build_explanation(self, explanation: str | None) -> QuestionExplanation | None:
        if explanation is None:
            return None

        return QuestionExplanation(text=explanation)

    def _to_list_item_response(self, question: Question) -> AdminQuestionListItemResponse:
        topic = question.topic
        section = topic.section if topic is not None else None
        faculty = section.faculty if section is not None else None

        return AdminQuestionListItemResponse(
            id=question.id,
            faculty_id=faculty.id if faculty is not None else None,
            faculty_name=faculty.name if faculty is not None else None,
            section_id=section.id if section is not None else None,
            section_name=section.name if section is not None else None,
            topic_id=topic.id if topic is not None else None,
            topic_name=topic.name if topic is not None else None,
            text=question.text,
            difficulty=question.difficulty.value,
            is_active=question.is_active,
            answer_option_count=len(question.answer_options),
        )

    def _to_details_response(self, question: Question) -> AdminQuestionDetailsResponse:
        topic = question.topic
        section = topic.section if topic is not None else None
        faculty = section.faculty if section is not None else None

        return AdminQuestionDetailsResponse(
            id=question.id,
            faculty_id=faculty.id if faculty is not None else None,
            faculty_name=faculty.name if faculty is not None else None,
            section_id=section.id if section is not None else None,
            section_name=section.name if section is not None else None,
            topic_id=topic.id if topic is not None else None,
            topic_name=topic.name if topic is not None else None,
            text=question.text,
            difficulty=question.difficulty.value,
            explanation=question.explanation.text if question.explanation is not None else None,
            is_active=question.is_active,
            created_by=question.created_by,
            answer_options=[
                AdminAnswerOptionResponse(
                    id=item.id,
                    label=item.label,
                    text=item.text,
                    is_correct=item.is_correct,
                    explanation=item.explanation,
                )
                for item in question.answer_options
            ],
        )
