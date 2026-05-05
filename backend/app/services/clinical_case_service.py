from datetime import datetime, timedelta, timezone
from math import ceil

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import today
from app.core.exceptions import BadRequestError
from app.core.exceptions import NotFoundError
from app.models.enums import PlanTaskType
from app.models.clinical_case import ClinicalCase
from app.models.clinical_case import ClinicalCaseRecord
from app.models.clinical_case_exam_session import ClinicalCaseExamSession
from app.models.topic import Topic
from app.models.user import User
from app.repositories.clinical_case_attempt_repository import ClinicalCaseAttemptRepository
from app.repositories.clinical_case_exam_session_repository import ClinicalCaseExamSessionRepository
from app.repositories.clinical_case_repository import ClinicalCaseRepository
from app.repositories.faculty_repository import FacultyRepository
from app.repositories.study_plan_repository import StudyPlanRepository
from app.repositories.topic_repository import TopicRepository
from app.schemas.clinical_case import (
    ClinicalCaseAnswerRequest,
    ClinicalCaseAnswerFeedbackResponse,
    ClinicalCaseAttemptStartRequest,
    ClinicalCaseAttemptStartResponse,
    ClinicalCaseCompletionRequest,
    ClinicalCaseCompletionResponse,
    ClinicalCaseDetailResponse,
    ClinicalCaseFactResponse,
    ClinicalCaseListItemResponse,
    ClinicalCaseQuizOptionResponse,
    ClinicalCaseQuizQuestionResponse,
)
from app.services.accreditation_service import AccreditationService
from app.services.evidence_context import resolve_attempt_context
from app.services.schedule_service import ScheduleService


CASE_EXAM_DURATION_MINUTES = 30
CASE_STUDY_SESSION_DURATION_MINUTES = 240
EXAM_SUBMISSION_GRACE_SECONDS = 5


class ClinicalCaseService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.faculty_repository = FacultyRepository(session)
        self.topic_repository = TopicRepository(session)
        self.clinical_case_repository = ClinicalCaseRepository(session)
        self.case_attempt_repository = ClinicalCaseAttemptRepository(session)
        self.exam_session_repository = ClinicalCaseExamSessionRepository(session)
        self.study_plan_repository = StudyPlanRepository(session)

    async def list_cases(self, user: User) -> list[ClinicalCaseListItemResponse]:
        self._ensure_onboarding_completed(user)
        faculty_code = await self._resolve_faculty_code(user)
        topic_map = await self._build_topic_map(user)
        cases = [
            case
            for case in await self.clinical_case_repository.list_case_records()
            if self._is_record_accessible_for_faculty(case, faculty_code)
        ]

        return [self._to_record_list_response(case, topic_map) for case in cases]

    async def get_case(self, user: User, slug: str) -> ClinicalCaseDetailResponse:
        self._ensure_onboarding_completed(user)
        faculty_code = await self._resolve_faculty_code(user)
        topic_map = await self._build_topic_map(user)
        clinical_case = await self.clinical_case_repository.get_by_slug(slug)

        if not self._is_accessible_for_faculty(clinical_case, faculty_code):
            raise NotFoundError("Кейс не найден")

        return self._to_detail_response(clinical_case, self._resolve_topic(clinical_case, topic_map))

    async def start_case_attempt(
        self,
        user: User,
        slug: str,
        payload: ClinicalCaseAttemptStartRequest,
    ) -> ClinicalCaseAttemptStartResponse:
        self._ensure_onboarding_completed(user)

        faculty_code = await self._resolve_faculty_code(user)
        topic_map = await self._build_topic_map(user)
        clinical_case = await self.clinical_case_repository.get_by_slug(slug)

        if not self._is_accessible_for_faculty(clinical_case, faculty_code):
            raise NotFoundError("Кейс не найден")

        topic = self._resolve_topic(clinical_case, topic_map)
        resolved_topic_id = topic.id if topic is not None else None

        if payload.topic_id is not None and payload.topic_id != resolved_topic_id:
            raise BadRequestError("Тема кейса не совпадает с выбранной темой плана")

        if len(clinical_case.quiz_questions) == 0:
            raise BadRequestError("Кейс не содержит проверочных вопросов")

            if payload.simulation_id is not None:
                if payload.mode != "exam":
                    raise BadRequestError("Кейсовый этап пробной аккредитации доступен только в контрольном режиме")

            await AccreditationService(self.session).ensure_case_can_start(user, payload.simulation_id, clinical_case.slug)

        now = self._utcnow()
        duration_minutes = CASE_EXAM_DURATION_MINUTES if payload.mode == "exam" else CASE_STUDY_SESSION_DURATION_MINUTES
        attempt = ClinicalCaseExamSession(
            user_id=user.id,
            case_slug=clinical_case.slug,
            topic_id=resolved_topic_id,
            planned_task_id=payload.planned_task_id,
            simulation_id=payload.simulation_id,
            attempt_context=resolve_attempt_context(
                simulation_id=payload.simulation_id,
                planned_task_id=payload.planned_task_id,
                mode=payload.mode,
            ),
            mode=payload.mode,
            status="active",
            started_at=now,
            expires_at=now + timedelta(minutes=duration_minutes),
        )
        self.exam_session_repository.add(attempt)
        await self.session.commit()
        await self.session.refresh(attempt)

        return self._to_attempt_start_response(attempt, now)

    async def complete_case(self, user: User, payload: ClinicalCaseCompletionRequest) -> ClinicalCaseCompletionResponse:
        self._ensure_onboarding_completed(user)

        faculty_code = await self._resolve_faculty_code(user)
        topic_map = await self._build_topic_map(user)
        clinical_case = await self.clinical_case_repository.get_by_slug(payload.slug)

        if not self._is_accessible_for_faculty(clinical_case, faculty_code):
            raise NotFoundError("Кейс не найден")

        topic = self._resolve_topic(clinical_case, topic_map)
        resolved_topic_id = topic.id if topic is not None else None

        if payload.topic_id is not None and payload.topic_id != resolved_topic_id:
            raise BadRequestError("Тема кейса не совпадает с выбранной темой плана")

        if len(clinical_case.quiz_questions) == 0:
            raise BadRequestError("Кейс не содержит проверочных вопросов")

        attempt = await self._get_case_attempt(user, payload, clinical_case)
        if attempt.status == "submitted" and attempt.submitted_at is not None:
            return await self._build_idempotent_case_completion_response(
                user=user,
                exam_session=attempt,
                clinical_case=clinical_case,
            )

        now = self._utcnow()
        expires_at = self._coerce_aware(attempt.expires_at)

        if now > expires_at + timedelta(seconds=EXAM_SUBMISSION_GRACE_SECONDS):
            attempt.status = "expired"
            await self.session.commit()
            raise BadRequestError("Время серверной попытки кейса истекло. Начните новую попытку.")

        feedback: list[ClinicalCaseAnswerFeedbackResponse] = []

        answered_questions, correct_answers, feedback = self._score_case_answers(clinical_case, payload.answers)

        if correct_answers > answered_questions:
            raise BadRequestError("Количество правильных ответов не может быть больше количества отвеченных вопросов")

        attempt.status = "submitted"
        attempt.submitted_at = now
        simulation_id = getattr(attempt, "simulation_id", None)
        attempt_context = getattr(attempt, "attempt_context", "strict_simulation" if simulation_id is not None else "free_training")
        study_seconds = self._calculate_study_seconds(attempt, now)
        task_completed = await ScheduleService(self.session).record_case_completion(
            user=user,
            case_slug=clinical_case.slug,
            case_title=clinical_case.title,
            topic_id=resolved_topic_id,
            questions_answered=answered_questions,
            correct_answers=correct_answers,
            study_minutes=max(ceil(study_seconds / 60), 1),
            study_seconds=study_seconds,
            answer_feedback=[
                {
                    "question_id": item.question_id,
                    "selected_option_label": item.selected_option_label,
                    "is_correct": item.is_correct,
                    "correct_option_label": item.correct_option_label,
                    "explanation": item.explanation,
                }
                for item in feedback
            ],
            planned_task_id=attempt.planned_task_id,
            simulation_id=simulation_id,
            attempt_context=attempt_context,
            completion_source="exam_simulation" if simulation_id is not None else None,
            submitted_at=now,
        )

        if simulation_id is not None:
            stage_status, remediation_plan, stage_transitioned = await AccreditationService(self.session).record_case_stage_progress(user, simulation_id)

            if stage_transitioned and stage_status in {"passed", "failed"}:
                task_completed = await ScheduleService(self.session).complete_exam_checkpoint_task(
                    user=user,
                    planned_task_id=attempt.planned_task_id,
                    checkpoint_type="case_stage",
                    simulation_id=simulation_id,
                )
                if stage_status == "failed" and remediation_plan:
                    await ScheduleService(self.session).apply_accreditation_remediation(
                        user=user,
                        stage_key="cases",
                        simulation_id=simulation_id,
                        remediation_plan=remediation_plan,
                    )
                elif stage_status == "passed":
                    await ScheduleService(self.session).apply_accreditation_stage_success(
                        user=user,
                        stage_key="cases",
                        simulation_id=simulation_id,
                    )

        await self.session.commit()

        accuracy_percent = round((correct_answers / len(clinical_case.quiz_questions)) * 100, 2)

        return ClinicalCaseCompletionResponse(
            attempt_id=attempt.id,
            simulation_id=simulation_id,
            attempt_context=attempt_context,
            recorded=True,
            task_completed=task_completed,
            answered_questions=answered_questions,
            correct_answers=correct_answers,
            total_questions=len(clinical_case.quiz_questions),
            accuracy_percent=accuracy_percent,
            feedback=feedback,
        )

    def _ensure_onboarding_completed(self, user: User) -> None:
        if user.faculty_id is None or user.accreditation_date is None or not user.onboarding_completed:
            raise BadRequestError("Сначала нужно завершить настройку профиля перед работой с кейсами")

    async def _get_case_attempt(
        self,
        user: User,
        payload: ClinicalCaseCompletionRequest,
        clinical_case: ClinicalCase,
    ) -> ClinicalCaseExamSession:
        if payload.attempt_id is None:
            raise BadRequestError("Сначала нужно начать серверную попытку кейса")

        attempt = await self.exam_session_repository.get_by_user_and_id(user.id, payload.attempt_id)

        if attempt is None or attempt.case_slug != clinical_case.slug:
            raise BadRequestError("Попытка не относится к этому кейсу")

        if attempt.status not in {"active", "submitted"}:
            raise BadRequestError("Эта попытка кейса уже завершена")

        return attempt

    async def _build_idempotent_case_completion_response(
        self,
        *,
        user: User,
        exam_session: ClinicalCaseExamSession,
        clinical_case: ClinicalCase,
    ) -> ClinicalCaseCompletionResponse:
        stored_attempt = await self.case_attempt_repository.get_by_session_signature(
            user_id=user.id,
            case_slug=clinical_case.slug,
            submitted_at=exam_session.submitted_at,
        )

        if stored_attempt is None:
            raise BadRequestError("Эта попытка кейса уже завершена")

        task_completed = await self._is_related_plan_task_completed(
            user=user,
            planned_task_id=exam_session.planned_task_id,
            topic_id=stored_attempt.topic_id,
        )
        feedback = self._restore_case_feedback(stored_attempt.answer_feedback)
        answered_questions = stored_attempt.answered_questions
        correct_answers = stored_attempt.correct_answers
        total_questions = len(clinical_case.quiz_questions)

        return ClinicalCaseCompletionResponse(
            attempt_id=exam_session.id,
            simulation_id=exam_session.simulation_id,
            attempt_context=exam_session.attempt_context,
            recorded=True,
            task_completed=task_completed,
            answered_questions=answered_questions,
            correct_answers=correct_answers,
            total_questions=total_questions,
            accuracy_percent=round(float(stored_attempt.accuracy_percent or 0), 2),
            feedback=feedback,
        )

    async def _is_related_plan_task_completed(
        self,
        *,
        user: User,
        planned_task_id: int | None,
        topic_id: int | None,
    ) -> bool:
        if planned_task_id is not None:
            task = await self.study_plan_repository.get_task_for_user(user.id, planned_task_id)
            return bool(task and task.is_completed)

        task = await self.study_plan_repository.get_completed_task_for_completion(
            user.id,
            PlanTaskType.CASE,
            topic_id,
            None,
            today(),
        )
        return task is not None

    @staticmethod
    def _restore_case_feedback(items: list[dict[str, str | bool]]) -> list[ClinicalCaseAnswerFeedbackResponse]:
        return [
            ClinicalCaseAnswerFeedbackResponse(
                question_id=str(item.get("question_id", "")),
                selected_option_label=str(item.get("selected_option_label", "")),
                is_correct=bool(item.get("is_correct", False)),
                correct_option_label=str(item.get("correct_option_label", "")),
                explanation=str(item.get("explanation", "")),
            )
            for item in items
            if isinstance(item, dict)
        ]

    def _utcnow(self) -> datetime:
        return datetime.now(timezone.utc)

    def _coerce_aware(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)

        return value

    def _calculate_study_minutes(self, attempt: ClinicalCaseExamSession, submitted_at: datetime) -> int:
        return max(ceil(self._calculate_study_seconds(attempt, submitted_at) / 60), 1)

    def _calculate_study_seconds(self, attempt: ClinicalCaseExamSession, submitted_at: datetime) -> int:
        started_at = self._coerce_aware(attempt.started_at)
        expires_at = self._coerce_aware(attempt.expires_at)
        effective_submitted_at = min(submitted_at, expires_at)
        elapsed_seconds = max((effective_submitted_at - started_at).total_seconds(), 0)
        return max(int(elapsed_seconds), 1)

    def _to_attempt_start_response(
        self,
        attempt: ClinicalCaseExamSession,
        server_time: datetime,
    ) -> ClinicalCaseAttemptStartResponse:
        started_at = self._coerce_aware(attempt.started_at)
        expires_at = self._coerce_aware(attempt.expires_at)

        return ClinicalCaseAttemptStartResponse(
            attempt_id=attempt.id,
            simulation_id=getattr(attempt, "simulation_id", None),
            attempt_context=attempt.attempt_context,
            case_slug=attempt.case_slug,
            mode=attempt.mode,
            started_at=started_at,
            expires_at=expires_at,
            duration_seconds=max(int((expires_at - started_at).total_seconds()), 0),
            server_time=server_time,
        )

    async def _resolve_faculty_code(self, user: User) -> str | None:
        if user.faculty_id is None:
            return None

        faculty = await self.faculty_repository.get_by_id(user.faculty_id)

        if faculty is None:
            return None

        return faculty.code

    async def _build_topic_map(self, user: User) -> dict[str, Topic]:
        if user.faculty_id is None:
            return {}

        topics = await self.topic_repository.list_by_faculty(user.faculty_id)
        return {self._normalize_key(topic.name): topic for topic in topics}

    def _is_accessible_for_faculty(self, clinical_case: ClinicalCase, faculty_code: str | None) -> bool:
        if not clinical_case.faculty_codes or faculty_code is None:
            return True

        return faculty_code in clinical_case.faculty_codes

    def _is_record_accessible_for_faculty(self, clinical_case: ClinicalCaseRecord, faculty_code: str | None) -> bool:
        if not clinical_case.faculty_codes or faculty_code is None:
            return True

        return faculty_code in clinical_case.faculty_codes

    def _normalize_key(self, value: str) -> str:
        return " ".join(value.strip().lower().split())

    def _resolve_topic(self, clinical_case: ClinicalCase, topic_map: dict[str, Topic]) -> Topic | None:
        if clinical_case.topic_id is not None:
            for topic in topic_map.values():
                if topic.id == clinical_case.topic_id:
                    return topic

        return topic_map.get(self._normalize_key(clinical_case.topic_name))

    def _score_case_answers(
        self,
        clinical_case: ClinicalCase,
        answers: list[ClinicalCaseAnswerRequest],
    ) -> tuple[int, int, list[ClinicalCaseAnswerFeedbackResponse]]:
        questions_by_id = {question.id.strip().lower(): question for question in clinical_case.quiz_questions}
        seen_question_ids: set[str] = set()
        correct_answers = 0
        feedback: list[ClinicalCaseAnswerFeedbackResponse] = []

        for answer in answers:
            question_id = answer.question_id.strip().lower()
            selected_option_label = answer.selected_option_label.strip().upper()
            question = questions_by_id.get(question_id)

            if question_id in seen_question_ids:
                raise BadRequestError("На один вопрос кейса можно отправить только один ответ")

            if question is None:
                raise BadRequestError("Ответ не относится к вопросам этого кейса")

            available_option_labels = {option.label.strip().upper() for option in question.options}
            correct_option_label = question.correct_option_label.strip().upper()

            if selected_option_label not in available_option_labels:
                raise BadRequestError("Выбранный вариант ответа не относится к вопросу кейса")

            seen_question_ids.add(question_id)
            is_correct = selected_option_label == correct_option_label

            if is_correct:
                correct_answers += 1

            feedback.append(
                ClinicalCaseAnswerFeedbackResponse(
                    question_id=question.id,
                    selected_option_label=selected_option_label,
                    is_correct=is_correct,
                    correct_option_label=correct_option_label,
                    explanation=question.explanation,
                )
            )

        for question in clinical_case.quiz_questions:
            question_id = question.id.strip().lower()

            if question_id in seen_question_ids:
                continue

            feedback.append(
                ClinicalCaseAnswerFeedbackResponse(
                    question_id=question.id,
                    selected_option_label="-",
                    is_correct=False,
                    correct_option_label=question.correct_option_label.strip().upper(),
                    explanation=question.explanation,
                )
            )

        return len(clinical_case.quiz_questions), correct_answers, feedback

    def _to_list_response(self, clinical_case: ClinicalCase, topic: Topic | None) -> ClinicalCaseListItemResponse:
        return ClinicalCaseListItemResponse(
            slug=clinical_case.slug,
            title=clinical_case.title,
            subtitle=clinical_case.subtitle,
            section_name=clinical_case.section_name,
            topic_name=clinical_case.topic_name,
            difficulty=clinical_case.difficulty,
            duration_minutes=clinical_case.duration_minutes,
            summary=clinical_case.summary,
            focus_points=clinical_case.focus_points,
            exam_targets=clinical_case.exam_targets,
            topic_id=topic.id if topic is not None else None,
        )

    def _to_record_list_response(
        self,
        clinical_case: ClinicalCaseRecord,
        topic_map: dict[str, Topic],
    ) -> ClinicalCaseListItemResponse:
        topic = topic_map.get(self._normalize_key(clinical_case.topic_name))

        return ClinicalCaseListItemResponse(
            slug=clinical_case.slug,
            title=clinical_case.title,
            subtitle=clinical_case.subtitle,
            section_name=clinical_case.section_name,
            topic_name=clinical_case.topic_name,
            difficulty=clinical_case.difficulty,
            duration_minutes=clinical_case.duration_minutes,
            summary=clinical_case.summary,
            focus_points=list(clinical_case.focus_points or []),
            exam_targets=list(clinical_case.exam_targets or []),
            topic_id=clinical_case.topic_id if clinical_case.topic_id is not None else topic.id if topic is not None else None,
        )

    def _to_detail_response(self, clinical_case: ClinicalCase, topic: Topic | None) -> ClinicalCaseDetailResponse:
        return ClinicalCaseDetailResponse(
            slug=clinical_case.slug,
            title=clinical_case.title,
            subtitle=clinical_case.subtitle,
            section_name=clinical_case.section_name,
            topic_name=clinical_case.topic_name,
            difficulty=clinical_case.difficulty,
            duration_minutes=clinical_case.duration_minutes,
            summary=clinical_case.summary,
            focus_points=clinical_case.focus_points,
            exam_targets=clinical_case.exam_targets,
            topic_id=topic.id if topic is not None else None,
            patient_summary=clinical_case.patient_summary,
            discussion_questions=clinical_case.discussion_questions,
            quiz_questions=[
                ClinicalCaseQuizQuestionResponse(
                    id=question.id,
                    prompt=question.prompt,
                    options=[
                        ClinicalCaseQuizOptionResponse(label=option.label, text=option.text)
                        for option in question.options
                    ],
                    hint=question.hint,
                )
                for question in clinical_case.quiz_questions
            ],
            clinical_facts=[
                ClinicalCaseFactResponse(label=fact.label, value=fact.value, tone=fact.tone)
                for fact in clinical_case.clinical_facts
            ],
        )
