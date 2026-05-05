from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from math import ceil

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError
from app.core.exceptions import NotFoundError
from app.models.osce_exam_session import OsceExamSession
from app.models.osce_attempt import OsceAttempt
from app.models.osce_station import OsceStation
from app.models.osce_station import OsceStationRecord
from app.models.user import User
from app.repositories.faculty_repository import FacultyRepository
from app.repositories.osce_attempt_repository import OsceAttemptRepository
from app.repositories.osce_exam_session_repository import OsceExamSessionRepository
from app.repositories.osce_station_repository import OsceStationRepository
from app.schemas.osce import (
    OsceAttemptHistoryItemResponse,
    OsceAttemptStartRequest,
    OsceAttemptStartResponse,
    OsceAttemptSubmitRequest,
    OsceAttemptSubmitResponse,
    OsceChecklistItemResponse,
    OsceQuizFeedbackResponse,
    OsceQuizQuestionResponse,
    OsceQuizOptionResponse,
    OsceStationDetailResponse,
    OsceStationListItemResponse,
)
from app.services.accreditation_service import AccreditationService
from app.services.evidence_context import resolve_attempt_context
from app.services.schedule_service import ScheduleService


EXAM_SUBMISSION_GRACE_SECONDS = 5
OSCE_STUDY_SESSION_DURATION_MINUTES = 240


class OsceService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.faculty_repository = FacultyRepository(session)
        self.station_repository = OsceStationRepository(session)
        self.attempt_repository = OsceAttemptRepository(session)
        self.exam_session_repository = OsceExamSessionRepository(session)

    async def list_stations(self, user: User) -> list[OsceStationListItemResponse]:
        self._ensure_onboarding_completed(user)
        faculty_code = await self._resolve_faculty_code(user)
        stations = [
            station
            for station in await self.station_repository.list_station_records()
            if self._is_record_accessible_for_faculty(station, faculty_code)
        ]
        attempts = await self.attempt_repository.list_by_user(user.id)
        attempts_by_station = self._group_attempts_by_station(attempts)

        return [
            self._to_record_list_response(station, attempts_by_station.get(station.slug, []))
            for station in stations
        ]

    async def get_station(self, user: User, slug: str) -> OsceStationDetailResponse:
        self._ensure_onboarding_completed(user)
        station = await self._get_accessible_station(user, slug)
        attempts = await self.attempt_repository.list_by_user_and_station(user.id, station.slug)

        return self._to_station_detail_response(station, attempts)

    async def start_attempt(
        self,
        user: User,
        slug: str,
        payload: OsceAttemptStartRequest,
    ) -> OsceAttemptStartResponse:
        self._ensure_onboarding_completed(user)
        station = await self._get_accessible_station(user, slug)

        if len(station.checklist_items) == 0:
            raise BadRequestError("Станция ОСКЭ не содержит чек-лист")

        if len(station.quiz_questions) == 0:
            raise BadRequestError("Станция ОСКЭ не содержит проверочные вопросы")

        if payload.simulation_id is not None:
            await AccreditationService(self.session).ensure_osce_station_can_start(user, payload.simulation_id, station.slug)

        now = self._utcnow()
        duration_minutes = (
            max(station.duration_minutes, 1)
            if payload.simulation_id is not None
            else OSCE_STUDY_SESSION_DURATION_MINUTES
        )
        attempt = OsceExamSession(
            user_id=user.id,
            station_slug=station.slug,
            planned_task_id=payload.planned_task_id,
            simulation_id=payload.simulation_id,
            attempt_context=resolve_attempt_context(
                simulation_id=payload.simulation_id,
                planned_task_id=payload.planned_task_id,
            ),
            status="active",
            started_at=now,
            expires_at=now + timedelta(minutes=duration_minutes),
        )
        self.exam_session_repository.add(attempt)
        await self.session.commit()
        await self.session.refresh(attempt)

        return self._to_attempt_start_response(attempt, now)

    async def submit_attempt(self, user: User, slug: str, payload: OsceAttemptSubmitRequest) -> OsceAttemptSubmitResponse:
        self._ensure_onboarding_completed(user)
        station = await self._get_accessible_station(user, slug)
        exam_session = await self._get_osce_attempt(user, payload, station)
        if exam_session.status == "submitted" and exam_session.submitted_at is not None:
            return await self._build_idempotent_osce_submit_response(
                user=user,
                exam_session=exam_session,
                station=station,
            )

        now = self._utcnow()
        expires_at = self._coerce_aware(exam_session.expires_at)

        if now > expires_at + timedelta(seconds=EXAM_SUBMISSION_GRACE_SECONDS):
            exam_session.status = "expired"
            await self.session.commit()
            raise BadRequestError("Время серверной попытки ОСКЭ истекло. Начните новую попытку.")

        checklist_ids_by_normalized_id = {item.id.strip().lower(): item.id for item in station.checklist_items}
        selected_checklist_ids = [
            item_id.strip().lower()
            for item_id in payload.checklist_item_ids
            if isinstance(item_id, str) and item_id.strip()
        ]

        if len(selected_checklist_ids) != len(set(selected_checklist_ids)):
            raise BadRequestError("Один пункт чек-листа ОСКЭ нельзя отправить дважды")

        unknown_checklist_ids = set(selected_checklist_ids).difference(checklist_ids_by_normalized_id)

        if unknown_checklist_ids:
            raise BadRequestError("Пункт чек-листа не относится к этой станции ОСКЭ")

        selected_checklist_id_set = set(selected_checklist_ids)
        normalized_checklist_ids = [
            item.id
            for item in station.checklist_items
            if item.id.strip().lower() in selected_checklist_id_set
        ]
        quiz_answers = {
            answer.question_id.strip().lower(): answer.selected_option_label.strip().upper()
            for answer in payload.quiz_answers
            if answer.question_id.strip() and answer.selected_option_label.strip()
        }
        normalized_quiz_answer_ids = [
            answer.question_id.strip().lower()
            for answer in payload.quiz_answers
            if answer.question_id.strip()
        ]
        expected_quiz_question_ids = {question.id.strip().lower() for question in station.quiz_questions}

        if len(normalized_quiz_answer_ids) != len(set(normalized_quiz_answer_ids)):
            raise BadRequestError("На один вопрос ОСКЭ можно отправить только один ответ")

        if set(quiz_answers) != expected_quiz_question_ids:
            raise BadRequestError("Нужно ответить на все вопросы ОСКЭ этой станции")

        checklist_total_count = len(station.checklist_items)
        quiz_total_questions = len(station.quiz_questions)
        checklist_completed_count = len(normalized_checklist_ids)
        quiz_correct_answers = 0
        quiz_feedback: list[OsceQuizFeedbackResponse] = []
        stored_quiz_answers: list[dict[str, str | None]] = []

        for question in station.quiz_questions:
            normalized_question_id = question.id.strip().lower()
            selected_option_label = quiz_answers.get(normalized_question_id)
            available_option_labels = {option.label.strip().upper() for option in question.options}
            correct_option_label = question.correct_option_label.strip().upper()

            if selected_option_label not in available_option_labels:
                raise BadRequestError("Выбранный вариант ответа не относится к вопросу ОСКЭ")

            is_correct = selected_option_label == correct_option_label

            if is_correct:
                quiz_correct_answers += 1

            stored_quiz_answers.append(
                {
                    "question_id": question.id,
                    "selected_option_label": selected_option_label,
                }
            )
            quiz_feedback.append(
                OsceQuizFeedbackResponse(
                    question_id=question.id,
                    is_correct=is_correct,
                    correct_option_label=correct_option_label,
                    explanation=question.explanation,
                )
            )

        checklist_score_percent = self._calculate_percent(checklist_completed_count, checklist_total_count)
        quiz_score_percent = self._calculate_percent(quiz_correct_answers, quiz_total_questions)
        total_score_percent = round((checklist_score_percent * 0.7) + (quiz_score_percent * 0.3), 2)
        score_points = round((total_score_percent / 100) * station.max_score)
        exam_session.status = "submitted"
        exam_session.submitted_at = now
        simulation_id = getattr(exam_session, "simulation_id", None)
        attempt_context = getattr(exam_session, "attempt_context", "strict_simulation" if simulation_id is not None else "free_training")
        attempt = OsceAttempt(
            user_id=user.id,
            simulation_id=simulation_id,
            attempt_context=attempt_context,
            station_slug=station.slug,
            station_title=station.title,
            checklist_item_ids=normalized_checklist_ids,
            quiz_answers=stored_quiz_answers,
            checklist_completed_count=checklist_completed_count,
            checklist_total_count=checklist_total_count,
            quiz_correct_answers=quiz_correct_answers,
            quiz_total_questions=quiz_total_questions,
            checklist_score_percent=checklist_score_percent,
            quiz_score_percent=quiz_score_percent,
            total_score_percent=total_score_percent,
            score_points=score_points,
            submitted_at=now,
        )
        self.attempt_repository.add(attempt)
        study_seconds = self._calculate_study_seconds(exam_session, now)
        await ScheduleService(self.session).record_osce_completion(
            user=user,
            station_slug=station.slug,
            quiz_total_questions=quiz_total_questions,
            quiz_correct_answers=quiz_correct_answers,
            study_minutes=max(ceil(study_seconds / 60), 1),
            study_seconds=study_seconds,
            planned_task_id=exam_session.planned_task_id,
            completion_source="exam_simulation" if simulation_id is not None else None,
            workload_units=checklist_total_count + quiz_total_questions,
        )

        if simulation_id is not None:
            stage_status, remediation_plan, stage_transitioned = await AccreditationService(self.session).record_osce_stage_progress(user, simulation_id)

            if stage_transitioned and stage_status in {"passed", "failed"}:
                await ScheduleService(self.session).complete_exam_checkpoint_task(
                    user=user,
                    planned_task_id=exam_session.planned_task_id,
                    checkpoint_type="osce_stage",
                    simulation_id=simulation_id,
                )
                if stage_status == "failed" and remediation_plan:
                    await ScheduleService(self.session).apply_accreditation_remediation(
                        user=user,
                        stage_key="osce",
                        simulation_id=simulation_id,
                        remediation_plan=remediation_plan,
                    )
                elif stage_status == "passed":
                    await ScheduleService(self.session).apply_accreditation_stage_success(
                        user=user,
                        stage_key="osce",
                        simulation_id=simulation_id,
                    )

        await self.session.commit()
        await self.session.refresh(attempt)

        return OsceAttemptSubmitResponse(
            station_slug=station.slug,
            station_title=station.title,
            quiz_feedback=quiz_feedback,
            **self._to_attempt_history_response(attempt).model_dump(),
        )

    def _ensure_onboarding_completed(self, user: User) -> None:
        if user.faculty_id is None or user.accreditation_date is None or not user.onboarding_completed:
            raise BadRequestError("Сначала нужно завершить настройку профиля перед работой со станциями ОСКЭ")

    async def _get_osce_attempt(
        self,
        user: User,
        payload: OsceAttemptSubmitRequest,
        station: OsceStation,
    ) -> OsceExamSession:
        if payload.attempt_id is None:
            raise BadRequestError("Сначала нужно начать серверную попытку ОСКЭ")

        attempt = await self.exam_session_repository.get_by_user_and_id(user.id, payload.attempt_id)

        if attempt is None or attempt.station_slug != station.slug:
            raise BadRequestError("Попытка не относится к этой станции ОСКЭ")

        if attempt.status not in {"active", "submitted"}:
            raise BadRequestError("Эта попытка ОСКЭ уже завершена")

        return attempt

    async def _build_idempotent_osce_submit_response(
        self,
        *,
        user: User,
        exam_session: OsceExamSession,
        station: OsceStation,
    ) -> OsceAttemptSubmitResponse:
        stored_attempt = await self.attempt_repository.get_by_session_signature(
            user_id=user.id,
            station_slug=station.slug,
            submitted_at=exam_session.submitted_at,
        )

        if stored_attempt is None:
            raise BadRequestError("Эта попытка ОСКЭ уже завершена")

        return OsceAttemptSubmitResponse(
            station_slug=station.slug,
            station_title=station.title,
            quiz_feedback=self._restore_osce_quiz_feedback(station, stored_attempt),
            **self._to_attempt_history_response(stored_attempt).model_dump(),
        )

    def _restore_osce_quiz_feedback(
        self,
        station: OsceStation,
        attempt: OsceAttempt,
    ) -> list[OsceQuizFeedbackResponse]:
        answers_by_question = {
            str(item.get("question_id", "")).strip().lower(): str(item.get("selected_option_label", "")).strip().upper()
            for item in attempt.quiz_answers
            if isinstance(item, dict)
        }
        feedback: list[OsceQuizFeedbackResponse] = []

        for question in station.quiz_questions:
            question_id = question.id.strip().lower()
            correct_option_label = question.correct_option_label.strip().upper()
            feedback.append(
                OsceQuizFeedbackResponse(
                    question_id=question.id,
                    is_correct=answers_by_question.get(question_id) == correct_option_label,
                    correct_option_label=correct_option_label,
                    explanation=question.explanation,
                )
            )

        return feedback

    def _utcnow(self) -> datetime:
        return datetime.now(timezone.utc)

    def _coerce_aware(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)

        return value

    def _calculate_study_minutes(self, attempt: OsceExamSession, submitted_at: datetime) -> int:
        return max(ceil(self._calculate_study_seconds(attempt, submitted_at) / 60), 1)

    def _calculate_study_seconds(self, attempt: OsceExamSession, submitted_at: datetime) -> int:
        started_at = self._coerce_aware(attempt.started_at)
        expires_at = self._coerce_aware(attempt.expires_at)
        effective_submitted_at = min(submitted_at, expires_at)
        elapsed_seconds = max((effective_submitted_at - started_at).total_seconds(), 0)
        return max(int(elapsed_seconds), 1)

    def _to_attempt_start_response(self, attempt: OsceExamSession, server_time: datetime) -> OsceAttemptStartResponse:
        started_at = self._coerce_aware(attempt.started_at)
        expires_at = self._coerce_aware(attempt.expires_at)

        return OsceAttemptStartResponse(
            attempt_id=attempt.id,
            simulation_id=getattr(attempt, "simulation_id", None),
            attempt_context=attempt.attempt_context,
            station_slug=attempt.station_slug,
            started_at=started_at,
            expires_at=expires_at,
            duration_seconds=max(int((expires_at - started_at).total_seconds()), 0),
            server_time=server_time,
        )

    async def _get_accessible_station(self, user: User, slug: str) -> OsceStation:
        faculty_code = await self._resolve_faculty_code(user)
        station = await self.station_repository.get_by_slug(slug)

        if not self._is_accessible_for_faculty(station, faculty_code):
            raise NotFoundError("Станция ОСКЭ не найдена")

        return station

    async def _resolve_faculty_code(self, user: User) -> str | None:
        if user.faculty_id is None:
            return None

        faculty = await self.faculty_repository.get_by_id(user.faculty_id)

        if faculty is None:
            return None

        return faculty.code

    def _is_accessible_for_faculty(self, station: OsceStation, faculty_code: str | None) -> bool:
        if not station.faculty_codes or faculty_code is None:
            return True

        return faculty_code in station.faculty_codes

    def _is_record_accessible_for_faculty(self, station: OsceStationRecord, faculty_code: str | None) -> bool:
        if not station.faculty_codes or faculty_code is None:
            return True

        return faculty_code in station.faculty_codes

    def _group_attempts_by_station(self, attempts: list[OsceAttempt]) -> dict[str, list[OsceAttempt]]:
        grouped: dict[str, list[OsceAttempt]] = {}

        for attempt in attempts:
            grouped.setdefault(attempt.station_slug, []).append(attempt)

        return grouped

    def _calculate_percent(self, value: int, total: int) -> float:
        if total <= 0:
            return 0.0

        return round((value / total) * 100, 2)

    def _resolve_status(self, attempts: Iterable[OsceAttempt]) -> str:
        attempt_list = list(attempts)

        if len(attempt_list) == 0:
            return "not_started"

        best_percent = max(self._to_float(attempt.total_score_percent) for attempt in attempt_list)

        if best_percent >= 85:
            return "mastered"

        return "in_progress"

    def _to_station_list_response(
        self,
        station: OsceStation,
        attempts: list[OsceAttempt],
    ) -> OsceStationListItemResponse:
        best_attempt = max(
            attempts,
            key=lambda item: (self._to_float(item.total_score_percent), item.score_points),
            default=None,
        )

        return OsceStationListItemResponse(
            slug=station.slug,
            title=station.title,
            subtitle=station.subtitle,
            section_name=station.section_name,
            topic_name=station.topic_name,
            skill_level=station.skill_level,
            duration_minutes=station.duration_minutes,
            max_score=station.max_score,
            summary=station.summary,
            best_score_percent=self._to_float(best_attempt.total_score_percent) if best_attempt is not None else None,
            best_score_points=best_attempt.score_points if best_attempt is not None else None,
            attempts_count=len(attempts),
            status=self._resolve_status(attempts),
        )

    def _to_record_list_response(
        self,
        station: OsceStationRecord,
        attempts: list[OsceAttempt],
    ) -> OsceStationListItemResponse:
        best_attempt = max(
            attempts,
            key=lambda item: (self._to_float(item.total_score_percent), item.score_points),
            default=None,
        )

        return OsceStationListItemResponse(
            slug=station.slug,
            title=station.title,
            subtitle=station.subtitle,
            section_name=station.section_name,
            topic_name=station.topic_name,
            skill_level=station.skill_level,
            duration_minutes=station.duration_minutes,
            max_score=station.max_score,
            summary=station.summary,
            best_score_percent=self._to_float(best_attempt.total_score_percent) if best_attempt is not None else None,
            best_score_points=best_attempt.score_points if best_attempt is not None else None,
            attempts_count=len(attempts),
            status=self._resolve_status(attempts),
        )

    def _to_station_detail_response(
        self,
        station: OsceStation,
        attempts: list[OsceAttempt],
    ) -> OsceStationDetailResponse:
        list_response = self._to_station_list_response(station, attempts)

        return OsceStationDetailResponse(
            **list_response.model_dump(),
            checklist_items=[
                OsceChecklistItemResponse(
                    id=item.id,
                    title=item.title,
                    description=item.description,
                    critical=item.critical,
                )
                for item in station.checklist_items
            ],
            quiz_questions=[
                OsceQuizQuestionResponse(
                    id=question.id,
                    prompt=question.prompt,
                    options=[
                        OsceQuizOptionResponse(label=option.label, text=option.text)
                        for option in question.options
                    ],
                )
                for question in station.quiz_questions
            ],
            attempts=[self._to_attempt_history_response(attempt) for attempt in attempts],
        )

    def _to_attempt_history_response(self, attempt: OsceAttempt) -> OsceAttemptHistoryItemResponse:
        return OsceAttemptHistoryItemResponse(
            id=str(attempt.id),
            attempt_context=attempt.attempt_context,
            checklist_score_percent=self._to_float(attempt.checklist_score_percent),
            quiz_score_percent=self._to_float(attempt.quiz_score_percent),
            total_score_percent=self._to_float(attempt.total_score_percent),
            score_points=attempt.score_points,
            checklist_completed_count=attempt.checklist_completed_count,
            checklist_total_count=attempt.checklist_total_count,
            quiz_correct_answers=attempt.quiz_correct_answers,
            quiz_total_questions=attempt.quiz_total_questions,
            submitted_at=attempt.submitted_at,
        )

    def _to_float(self, value: Decimal | float | int) -> float:
        return round(float(value), 2)
