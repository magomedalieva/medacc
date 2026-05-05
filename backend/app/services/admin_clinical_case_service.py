from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clinical_case_quiz import CASE_QUIZ_QUESTION_COUNT
from app.core.exceptions import ConflictError, NotFoundError
from app.models.clinical_case import ClinicalCase, ClinicalCaseFact, ClinicalCaseQuizOption, ClinicalCaseQuizQuestion
from app.models.clinical_case import ClinicalCaseRecord
from app.models.faculty import Faculty
from app.models.topic import Topic
from app.repositories.clinical_case_repository import ClinicalCaseRepository
from app.repositories.faculty_repository import FacultyRepository
from app.repositories.topic_repository import TopicRepository
from app.schemas.admin_clinical_case import (
    AdminClinicalCaseDeleteResponse,
    AdminClinicalCaseDetailsResponse,
    AdminClinicalCaseFactResponse,
    AdminClinicalCaseQuizOptionResponse,
    AdminClinicalCaseQuizQuestionResponse,
    AdminClinicalCaseListItemResponse,
    AdminClinicalCaseWriteRequest,
)


class AdminClinicalCaseService:
    def __init__(self, session: AsyncSession) -> None:
        self.faculty_repository = FacultyRepository(session)
        self.topic_repository = TopicRepository(session)
        self.session = session
        self.clinical_case_repository = ClinicalCaseRepository(session)

    async def list_cases(self) -> list[AdminClinicalCaseListItemResponse]:
        faculty_map = await self._build_faculty_map()
        topic_map = await self._build_topic_map(faculty_map)
        clinical_cases = await self.clinical_case_repository.list_case_records()

        return [self._to_record_list_response(case, faculty_map, topic_map) for case in clinical_cases]

    async def get_case(self, slug: str) -> AdminClinicalCaseDetailsResponse:
        faculty_map = await self._build_faculty_map()
        topic_map = await self._build_topic_map(faculty_map)
        clinical_case = await self.clinical_case_repository.get_by_slug(slug)
        return self._to_details_response(clinical_case, faculty_map, topic_map)

    async def create_case(self, payload: AdminClinicalCaseWriteRequest) -> AdminClinicalCaseDetailsResponse:
        existing_case = await self._find_case(payload.slug)

        if existing_case is not None:
            raise ConflictError("Кейс с таким slug уже существует")

        clinical_case = await self._build_case_from_payload(payload)
        await self.clinical_case_repository.save_case(clinical_case, topic_id=payload.topic_id)
        await self.session.commit()
        return await self.get_case(clinical_case.slug)

    async def update_case(self, slug: str, payload: AdminClinicalCaseWriteRequest) -> AdminClinicalCaseDetailsResponse:
        current_case = await self._find_case(slug)

        if current_case is None:
            raise NotFoundError("Кейс не найден")

        if payload.slug != slug:
            conflicting_case = await self._find_case(payload.slug)

            if conflicting_case is not None:
                raise ConflictError("Кейс с таким slug уже существует")

        clinical_case = await self._build_case_from_payload(payload)
        await self.clinical_case_repository.save_case(clinical_case, topic_id=payload.topic_id, previous_slug=slug)
        await self.session.commit()
        return await self.get_case(clinical_case.slug)

    async def delete_case(self, slug: str) -> AdminClinicalCaseDeleteResponse:
        await self.clinical_case_repository.delete_case(slug)
        await self.session.commit()
        return AdminClinicalCaseDeleteResponse(slug=slug, deleted=True)

    async def _build_case_from_payload(self, payload: AdminClinicalCaseWriteRequest) -> ClinicalCase:
        topic = await self.topic_repository.get_with_section(payload.topic_id)

        if topic is None or topic.section is None or topic.section.faculty is None:
            raise NotFoundError("Тема не найдена")

        faculty = topic.section.faculty

        return ClinicalCase(
            slug=payload.slug,
            faculty_codes=[faculty.code],
            title=payload.title,
            subtitle=payload.subtitle,
            section_name=topic.section.name,
            topic_name=topic.name,
            difficulty=payload.difficulty,
            duration_minutes=payload.duration_minutes,
            summary=payload.summary,
            patient_summary=payload.patient_summary,
            focus_points=payload.focus_points,
            exam_targets=payload.exam_targets,
            discussion_questions=payload.discussion_questions,
            quiz_questions=[
                ClinicalCaseQuizQuestion(
                    id=question.id,
                    prompt=question.prompt,
                    options=[
                        ClinicalCaseQuizOption(label=option.label, text=option.text)
                        for option in question.options
                    ],
                    correct_option_label=question.correct_option_label,
                    explanation=question.explanation,
                    hint=question.hint,
                )
                for question in payload.quiz_questions
            ],
            clinical_facts=[
                ClinicalCaseFact(label=fact.label, value=fact.value, tone=fact.tone)
                for fact in payload.clinical_facts
            ],
            topic_id=payload.topic_id,
        )

    async def _build_faculty_map(self) -> dict[str, Faculty]:
        faculties = await self.faculty_repository.list_all()
        return {faculty.code: faculty for faculty in faculties}

    async def _build_topic_map(self, faculty_map: dict[str, Faculty]) -> dict[tuple[str, str], Topic]:
        topic_map: dict[tuple[str, str], Topic] = {}

        for faculty in faculty_map.values():
            topics = await self.topic_repository.list_by_faculty(faculty.id)

            for topic in topics:
                topic_map[(faculty.code, self._normalize_key(topic.name))] = topic

        return topic_map

    async def _find_case(self, slug: str) -> ClinicalCase | None:
        try:
            return await self.clinical_case_repository.get_by_slug(slug)
        except NotFoundError:
            return None

    def _normalize_key(self, value: str) -> str:
        return " ".join(value.strip().lower().split())

    def _resolve_context(
        self,
        clinical_case: ClinicalCase,
        faculty_map: dict[str, Faculty],
        topic_map: dict[tuple[str, str], Topic],
    ) -> tuple[Faculty | None, Topic | None]:
        if clinical_case.topic_id is not None:
            for (faculty_code, _), topic in topic_map.items():
                if topic.id == clinical_case.topic_id:
                    return faculty_map.get(faculty_code), topic

        faculty = next((faculty_map.get(code) for code in clinical_case.faculty_codes if code in faculty_map), None)

        if faculty is None:
            return None, None

        topic = topic_map.get((faculty.code, self._normalize_key(clinical_case.topic_name)))
        return faculty, topic

    def _resolve_record_context(
        self,
        clinical_case: ClinicalCaseRecord,
        faculty_map: dict[str, Faculty],
        topic_map: dict[tuple[str, str], Topic],
    ) -> tuple[Faculty | None, Topic | None]:
        if clinical_case.topic_id is not None:
            for (faculty_code, _), topic in topic_map.items():
                if topic.id == clinical_case.topic_id:
                    return faculty_map.get(faculty_code), topic

        faculty = next((faculty_map.get(code) for code in clinical_case.faculty_codes if code in faculty_map), None)

        if faculty is None:
            return None, None

        topic = topic_map.get((faculty.code, self._normalize_key(clinical_case.topic_name)))
        return faculty, topic

    def _to_list_response(
        self,
        clinical_case: ClinicalCase,
        faculty_map: dict[str, Faculty],
        topic_map: dict[tuple[str, str], Topic],
    ) -> AdminClinicalCaseListItemResponse:
        faculty, topic = self._resolve_context(clinical_case, faculty_map, topic_map)

        return AdminClinicalCaseListItemResponse(
            slug=clinical_case.slug,
            faculty_code=clinical_case.faculty_codes[0] if clinical_case.faculty_codes else "",
            faculty_name=faculty.name if faculty is not None else None,
            section_name=clinical_case.section_name,
            topic_id=topic.id if topic is not None else None,
            topic_name=clinical_case.topic_name,
            title=clinical_case.title,
            subtitle=clinical_case.subtitle,
            difficulty=clinical_case.difficulty,
            duration_minutes=clinical_case.duration_minutes,
            summary=clinical_case.summary,
            quiz_questions_count=len(clinical_case.quiz_questions),
        )

    def _to_record_list_response(
        self,
        clinical_case: ClinicalCaseRecord,
        faculty_map: dict[str, Faculty],
        topic_map: dict[tuple[str, str], Topic],
    ) -> AdminClinicalCaseListItemResponse:
        faculty, topic = self._resolve_record_context(clinical_case, faculty_map, topic_map)

        return AdminClinicalCaseListItemResponse(
            slug=clinical_case.slug,
            faculty_code=clinical_case.faculty_codes[0] if clinical_case.faculty_codes else "",
            faculty_name=faculty.name if faculty is not None else None,
            section_name=clinical_case.section_name,
            topic_id=topic.id if topic is not None else None,
            topic_name=clinical_case.topic_name,
            title=clinical_case.title,
            subtitle=clinical_case.subtitle,
            difficulty=clinical_case.difficulty,
            duration_minutes=clinical_case.duration_minutes,
            summary=clinical_case.summary,
            quiz_questions_count=(
                len(clinical_case.quiz_questions)
                if len(clinical_case.quiz_questions or []) == CASE_QUIZ_QUESTION_COUNT
                else CASE_QUIZ_QUESTION_COUNT
            ),
        )

    def _to_details_response(
        self,
        clinical_case: ClinicalCase,
        faculty_map: dict[str, Faculty],
        topic_map: dict[tuple[str, str], Topic],
    ) -> AdminClinicalCaseDetailsResponse:
        faculty, topic = self._resolve_context(clinical_case, faculty_map, topic_map)

        return AdminClinicalCaseDetailsResponse(
            slug=clinical_case.slug,
            faculty_code=clinical_case.faculty_codes[0] if clinical_case.faculty_codes else "",
            faculty_name=faculty.name if faculty is not None else None,
            section_name=clinical_case.section_name,
            topic_id=topic.id if topic is not None else None,
            topic_name=clinical_case.topic_name,
            title=clinical_case.title,
            subtitle=clinical_case.subtitle,
            difficulty=clinical_case.difficulty,
            duration_minutes=clinical_case.duration_minutes,
            summary=clinical_case.summary,
            quiz_questions_count=len(clinical_case.quiz_questions),
            patient_summary=clinical_case.patient_summary,
            focus_points=clinical_case.focus_points,
            exam_targets=clinical_case.exam_targets,
            discussion_questions=clinical_case.discussion_questions,
            quiz_questions=[
                AdminClinicalCaseQuizQuestionResponse(
                    id=question.id,
                    prompt=question.prompt,
                    options=[
                        AdminClinicalCaseQuizOptionResponse(label=option.label, text=option.text)
                        for option in question.options
                    ],
                    correct_option_label=question.correct_option_label,
                    explanation=question.explanation,
                    hint=question.hint,
                )
                for question in clinical_case.quiz_questions
            ],
            clinical_facts=[
                AdminClinicalCaseFactResponse(label=fact.label, value=fact.value, tone=fact.tone)
                for fact in clinical_case.clinical_facts
            ],
        )
