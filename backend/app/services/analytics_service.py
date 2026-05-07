from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import today, utc_now
from app.core.exceptions import NotFoundError
from app.models.user import User
from app.repositories.analytics_repository import AnalyticsRepository
from app.repositories.clinical_case_attempt_repository import ClinicalCaseAttemptRepository
from app.repositories.clinical_case_repository import ClinicalCaseRepository
from app.repositories.faculty_repository import FacultyRepository
from app.repositories.osce_attempt_repository import OsceAttemptRepository
from app.repositories.osce_station_repository import OsceStationRepository
from app.repositories.question_repository import QuestionRepository
from app.schemas.analytics import (
    AnalyticsOverviewResponse,
    ClinicalCaseAttemptAnalyticsResponse,
    ClinicalCaseAttemptReviewAnalyticsResponse,
    ClinicalCaseAttemptReviewItemResponse,
    DailyAnalyticsResponse,
    ExamReadinessProtocolResponse,
    OsceStationChecklistGapAnalyticsResponse,
    OsceStationQuizMistakeAnalyticsResponse,
    OsceStationReviewAnalyticsResponse,
    ReadinessSummaryResponse,
    ReadinessTrackResponse,
    RepeatingQuestionErrorAnalyticsResponse,
    TopicAnalyticsResponse,
    TopicQuestionErrorAnalyticsResponse,
    TopicQuestionErrorOptionResponse,
)
from app.services.readiness_engine import (
    build_case_readiness,
    build_osce_readiness,
    build_readiness_summary,
    build_test_readiness,
)


TRAINING_PASS_PERCENT = 70.0
TRAINING_MASTERY_PERCENT = 85.0
WEAK_THRESHOLD = TRAINING_PASS_PERCENT
MEDIUM_THRESHOLD = TRAINING_MASTERY_PERCENT
ACCREDITATION_PASS_PERCENT = 70.0
HISTORY_LIMIT_DAYS = 30
RECENT_CASE_ATTEMPTS_LIMIT = 40
REPEATING_QUESTION_ERRORS_LIMIT = 8
TOPIC_QUESTION_ERRORS_LIMIT = 12
QUESTION_PREVIEW_LENGTH = 140
RECENT_ACTIVITY_WINDOW_DAYS = 14


class AnalyticsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.analytics_repository = AnalyticsRepository(session)
        self.case_attempt_repository = ClinicalCaseAttemptRepository(session)
        self.clinical_case_repository = ClinicalCaseRepository(session)
        self.faculty_repository = FacultyRepository(session)
        self.osce_attempt_repository = OsceAttemptRepository(session)
        self.osce_station_repository = OsceStationRepository(session)
        self.question_repository = QuestionRepository(session)

    async def get_learning_readiness(self, user: User) -> ReadinessSummaryResponse:
        return await self.get_readiness(user)

    async def get_exam_protocol(self, user: User) -> ExamReadinessProtocolResponse:
        from app.services.accreditation_service import AccreditationService

        return await AccreditationService(self.session).get_exam_protocol(user)

    async def get_overview(self, user: User) -> AnalyticsOverviewResponse:
        metrics = await self.analytics_repository.get_overview_metrics(user.id)
        accuracy_percent = round((metrics.correct_answers / metrics.total_answered) * 100, 2) if metrics.total_answered else 0.0

        return AnalyticsOverviewResponse(
            total_answered=metrics.total_answered,
            correct_answers=metrics.correct_answers,
            accuracy_percent=accuracy_percent,
            completed_sessions=metrics.completed_sessions,
            initial_diagnostic_completed=metrics.initial_diagnostic_completed,
            latest_initial_diagnostic_score_percent=metrics.latest_initial_diagnostic_score_percent,
            non_diagnostic_completed_sessions=metrics.non_diagnostic_completed_sessions,
            streak_days=user.streak_days,
            days_until_accreditation=self._calculate_days_until_accreditation(user.accreditation_date),
        )

    async def get_topics(self, user: User) -> list[TopicAnalyticsResponse]:
        if user.faculty_id is None:
            return []

        metrics = await self.analytics_repository.list_topic_metrics(user.id, user.faculty_id)
        responses: list[TopicAnalyticsResponse] = []

        for item in metrics:
            accuracy_percent = self._calculate_accuracy(item.correct_answers, item.answered_questions)
            status = "not_started" if item.answered_questions == 0 else self._resolve_status(accuracy_percent)

            responses.append(
                TopicAnalyticsResponse(
                    topic_id=item.topic_id,
                    topic_name=item.topic_name,
                    section_name=item.section_name,
                    answered_questions=item.answered_questions,
                    correct_answers=item.correct_answers,
                    test_incorrect_answers=item.test_incorrect_answers,
                    accuracy_percent=accuracy_percent,
                    status=status,
                    case_attempts_count=item.case_attempts_count,
                    repeated_question_struggles=item.repeated_question_struggles,
                    hard_question_accuracy_percent=self._calculate_optional_accuracy(
                        item.hard_question_correct_answers,
                        item.hard_question_attempts,
                    ),
                    last_activity_at=self._latest_datetime(item.last_test_activity_at, item.last_case_activity_at),
                    recent_struggle_at=self._latest_datetime(item.last_test_incorrect_at, item.last_case_low_score_at),
                )
            )

        return responses

    async def get_history(self, user: User) -> list[DailyAnalyticsResponse]:
        daily_stats = await self.analytics_repository.list_daily_stats(user.id, HISTORY_LIMIT_DAYS)
        ordered_stats = list(reversed(daily_stats))

        return [
            DailyAnalyticsResponse(
                stat_date=item.stat_date,
                questions_answered=item.questions_answered,
                correct_answers=item.correct_answers,
                accuracy_percent=self._calculate_accuracy(item.correct_answers, item.questions_answered),
                study_minutes=item.study_minutes,
            )
            for item in ordered_stats
        ]

    async def get_case_attempts(self, user: User) -> list[ClinicalCaseAttemptAnalyticsResponse]:
        attempts = await self.analytics_repository.list_recent_case_attempts(user.id, RECENT_CASE_ATTEMPTS_LIMIT)

        return [
            ClinicalCaseAttemptAnalyticsResponse(
                id=str(item.id),
                case_slug=item.case_slug,
                case_title=item.case_title,
                topic_id=item.topic_id,
                topic_name=item.topic_name,
                answered_questions=item.answered_questions,
                correct_answers=item.correct_answers,
                accuracy_percent=round(item.accuracy_percent, 2),
                study_minutes=item.study_minutes,
                submitted_at=item.submitted_at,
            )
            for item in attempts
        ]

    async def get_case_attempt_review(self, user: User, attempt_id: str) -> ClinicalCaseAttemptReviewAnalyticsResponse:
        faculty_code = await self._resolve_faculty_code(user)

        try:
            parsed_attempt_id = UUID(attempt_id)
        except ValueError as exc:
            raise NotFoundError("Попытка кейса не найдена") from exc

        attempt = await self.case_attempt_repository.get_by_user_and_id(user.id, parsed_attempt_id)

        if attempt is None:
            raise NotFoundError("Попытка кейса не найдена")

        clinical_case = await self.clinical_case_repository.get_by_slug(attempt.case_slug)

        if not self._is_accessible_for_faculty(clinical_case.faculty_codes, faculty_code):
            raise NotFoundError("Кейс не найден")

        questions_by_id = {question.id.strip().lower(): question for question in clinical_case.quiz_questions}
        feedback_items = list(attempt.answer_feedback or [])
        incorrect_items: list[ClinicalCaseAttemptReviewItemResponse] = []

        for item in feedback_items:
            if bool(item.get("is_correct")):
                continue

            question_id = str(item.get("question_id") or "").strip()

            if not question_id:
                continue

            question = questions_by_id.get(question_id.lower())

            if question is None:
                continue

            selected_option_label = self._normalize_option_label(item.get("selected_option_label"))
            correct_option_label = self._normalize_option_label(item.get("correct_option_label"))
            selected_option = next(
                (option for option in question.options if self._normalize_option_label(option.label) == selected_option_label),
                None,
            )
            correct_option = next(
                (option for option in question.options if self._normalize_option_label(option.label) == correct_option_label),
                None,
            )
            explanation = str(item.get("explanation") or question.explanation or "").strip() or None

            incorrect_items.append(
                ClinicalCaseAttemptReviewItemResponse(
                    question_id=question.id,
                    prompt=question.prompt,
                    selected_option_label=selected_option_label,
                    selected_option_text=selected_option.text if selected_option is not None else None,
                    correct_option_label=correct_option_label,
                    correct_option_text=correct_option.text if correct_option is not None else None,
                    explanation=explanation,
                )
            )

        return ClinicalCaseAttemptReviewAnalyticsResponse(
            attempt_id=str(attempt.id),
            case_slug=attempt.case_slug,
            case_title=attempt.case_title,
            topic_name=clinical_case.topic_name or None,
            accuracy_percent=round(float(attempt.accuracy_percent or 0.0), 2),
            correct_answers=attempt.correct_answers,
            answered_questions=attempt.answered_questions,
            study_minutes=attempt.study_minutes,
            submitted_at=attempt.submitted_at,
            patient_summary=clinical_case.patient_summary,
            focus_points=list(clinical_case.focus_points or []),
            exam_targets=list(clinical_case.exam_targets or []),
            review_available=len(feedback_items) > 0,
            incorrect_items=incorrect_items,
        )

    async def get_osce_station_review(self, user: User, station_slug: str) -> OsceStationReviewAnalyticsResponse:
        faculty_code = await self._resolve_faculty_code(user)
        station = await self.osce_station_repository.get_by_slug(station_slug)

        if not self._is_accessible_for_faculty(station.faculty_codes, faculty_code):
            raise NotFoundError("Станция ОСКЭ не найдена")

        attempts = await self.osce_attempt_repository.list_by_user_and_station(user.id, station.slug)
        latest_attempt = attempts[0] if attempts else None
        best_score_percent = max((round(float(item.total_score_percent or 0.0), 2) for item in attempts), default=None)
        status = "not_started"

        if best_score_percent is not None:
            status = "mastered" if best_score_percent >= 85.0 else "in_progress"

        missed_checklist_items: list[OsceStationChecklistGapAnalyticsResponse] = []
        incorrect_quiz_items: list[OsceStationQuizMistakeAnalyticsResponse] = []

        if latest_attempt is not None:
            completed_checklist_ids = {
                item_id.strip().lower()
                for item_id in latest_attempt.checklist_item_ids
                if isinstance(item_id, str) and item_id.strip()
            }
            quiz_answers_by_question_id = {
                str(item.get("question_id") or "").strip().lower(): self._normalize_option_label(item.get("selected_option_label"))
                for item in latest_attempt.quiz_answers
                if str(item.get("question_id") or "").strip()
            }

            missed_checklist_items = [
                OsceStationChecklistGapAnalyticsResponse(
                    id=item.id,
                    title=item.title,
                    description=item.description,
                    critical=item.critical,
                )
                for item in station.checklist_items
                if item.id.strip().lower() not in completed_checklist_ids
            ]

            for question in station.quiz_questions:
                selected_option_label = quiz_answers_by_question_id.get(question.id.strip().lower())
                correct_option_label = self._normalize_option_label(question.correct_option_label)

                if selected_option_label is None or selected_option_label == correct_option_label:
                    continue

                selected_option = next(
                    (option for option in question.options if self._normalize_option_label(option.label) == selected_option_label),
                    None,
                )
                correct_option = next(
                    (option for option in question.options if self._normalize_option_label(option.label) == correct_option_label),
                    None,
                )

                incorrect_quiz_items.append(
                    OsceStationQuizMistakeAnalyticsResponse(
                        question_id=question.id,
                        prompt=question.prompt,
                        selected_option_label=selected_option_label,
                        selected_option_text=selected_option.text if selected_option is not None else None,
                        correct_option_label=correct_option_label,
                        correct_option_text=correct_option.text if correct_option is not None else None,
                        explanation=question.explanation or None,
                    )
                )

        return OsceStationReviewAnalyticsResponse(
            station_slug=station.slug,
            station_title=station.title,
            section_name=station.section_name,
            topic_name=station.topic_name,
            status=status,
            attempts_count=len(attempts),
            best_score_percent=best_score_percent,
            latest_attempt_submitted_at=latest_attempt.submitted_at if latest_attempt is not None else None,
            latest_total_score_percent=round(float(latest_attempt.total_score_percent or 0.0), 2)
            if latest_attempt is not None
            else None,
            latest_checklist_score_percent=round(float(latest_attempt.checklist_score_percent or 0.0), 2)
            if latest_attempt is not None
            else None,
            latest_quiz_score_percent=round(float(latest_attempt.quiz_score_percent or 0.0), 2)
            if latest_attempt is not None
            else None,
            missed_checklist_items=missed_checklist_items,
            incorrect_quiz_items=incorrect_quiz_items,
        )

    async def get_repeating_question_errors(self, user: User) -> list[RepeatingQuestionErrorAnalyticsResponse]:
        if user.faculty_id is None:
            return []

        items = await self.analytics_repository.list_repeating_question_errors(
            user.id,
            user.faculty_id,
            REPEATING_QUESTION_ERRORS_LIMIT,
        )

        return [
            RepeatingQuestionErrorAnalyticsResponse(
                question_id=item.question_id,
                question_preview=self._build_question_preview(item.question_text),
                difficulty=item.difficulty.value,
                topic_id=item.topic_id,
                topic_name=item.topic_name,
                section_name=item.section_name,
                attempts_count=item.attempts_count,
                incorrect_answers=item.incorrect_answers,
                accuracy_percent=self._calculate_accuracy(item.correct_answers, item.attempts_count),
                last_seen_at=item.last_seen_at,
                last_incorrect_at=item.last_incorrect_at,
            )
            for item in items
        ]

    async def get_topic_question_errors(self, user: User, topic_id: int) -> list[TopicQuestionErrorAnalyticsResponse]:
        if user.faculty_id is None:
            return []

        items = await self.analytics_repository.list_topic_question_errors(
            user.id,
            user.faculty_id,
            topic_id,
            TOPIC_QUESTION_ERRORS_LIMIT,
        )

        if not items:
            return []

        question_ids = [item.question_id for item in items]
        latest_incorrect_labels = await self.analytics_repository.get_latest_incorrect_option_labels(user.id, question_ids)
        questions = await self.question_repository.get_by_ids(question_ids)
        questions_by_id = {question.id: question for question in questions}
        responses: list[TopicQuestionErrorAnalyticsResponse] = []

        for item in items:
            question = questions_by_id.get(item.question_id)

            if question is None:
                continue

            sorted_options = sorted(question.answer_options, key=lambda option: option.label)
            selected_option_label = latest_incorrect_labels.get(item.question_id)
            selected_option = next(
                (option for option in sorted_options if option.label == selected_option_label),
                None,
            )
            correct_option = next((option for option in sorted_options if option.is_correct), None)

            responses.append(
                TopicQuestionErrorAnalyticsResponse(
                    question_id=item.question_id,
                    question_text=question.text,
                    difficulty=item.difficulty.value,
                    attempts_count=item.attempts_count,
                    incorrect_answers=item.incorrect_answers,
                    correct_answers=item.correct_answers,
                    accuracy_percent=self._calculate_accuracy(item.correct_answers, item.attempts_count),
                    last_seen_at=item.last_seen_at,
                    last_incorrect_at=item.last_incorrect_at,
                    last_selected_option_label=selected_option_label,
                    last_selected_option_text=selected_option.text if selected_option is not None else None,
                    correct_option_label=correct_option.label if correct_option is not None else None,
                    correct_option_text=correct_option.text if correct_option is not None else None,
                    explanation=question.explanation.text if question.explanation is not None else None,
                    answer_options=[
                        TopicQuestionErrorOptionResponse(label=option.label, text=option.text)
                        for option in sorted_options
                    ],
                )
            )

        return responses

    async def get_readiness(self, user: User) -> ReadinessSummaryResponse:
        topic_metrics = []

        if user.faculty_id is not None:
            topic_metrics = await self.analytics_repository.list_topic_metrics(user.id, user.faculty_id)

        readiness_metrics = await self.analytics_repository.get_readiness_aggregate_metrics(
            user.id,
            utc_now() - timedelta(days=RECENT_ACTIVITY_WINDOW_DAYS),
        )
        faculty_code = await self._resolve_faculty_code(user)
        stations = [
            station
            for station in await self.osce_station_repository.list_station_records()
            if self._is_accessible_for_faculty(station.faculty_codes, faculty_code)
        ]
        best_osce_by_station = {station.slug: None for station in stations}

        for item in await self.analytics_repository.list_osce_station_best_scores(user.id):
            if item.station_slug in best_osce_by_station:
                best_osce_by_station[item.station_slug] = item.best_score

        started_stations_count = 0
        mastered_stations_count = 0

        for score in best_osce_by_station.values():
            if score is None:
                continue

            started_stations_count += 1

            if score >= 85.0:
                mastered_stations_count += 1

        osce_passed_stations_count = len(
            [score for score in best_osce_by_station.values() if score is not None and score >= ACCREDITATION_PASS_PERCENT]
        )
        average_best_osce_score = (
            sum(score or 0.0 for score in best_osce_by_station.values()) / len(best_osce_by_station)
            if len(best_osce_by_station) > 0
            else None
        )
        topic_count = len(topic_metrics)
        covered_topics_count = 0
        stable_topics_count = 0
        critical_topics_count = 0
        fragile_topics_count = 0
        due_topics_count = 0
        overdue_topics_count = 0
        total_topic_accuracy = 0.0

        for item in topic_metrics:
            accuracy = self._calculate_accuracy(item.correct_answers, item.answered_questions)
            total_topic_accuracy += accuracy

            if item.answered_questions > 0:
                covered_topics_count += 1

                if accuracy >= TRAINING_MASTERY_PERCENT:
                    stable_topics_count += 1

                if accuracy < 55.0:
                    critical_topics_count += 1
                elif accuracy < 70.0:
                    fragile_topics_count += 1

            days_since_activity = self._days_since(
                self._latest_datetime(item.last_test_activity_at, item.last_case_activity_at)
            )

            if days_since_activity is None:
                continue

            if days_since_activity >= RECENT_ACTIVITY_WINDOW_DAYS:
                overdue_topics_count += 1
            elif days_since_activity >= 7:
                due_topics_count += 1

        average_topic_accuracy = total_topic_accuracy / topic_count if topic_count > 0 else 0.0
        summary = build_readiness_summary(
            build_test_readiness(
                topic_count=topic_count,
                covered_topics_count=covered_topics_count,
                stable_topics_count=stable_topics_count,
                average_topic_accuracy=round(average_topic_accuracy, 2),
                exam_attempts_count=readiness_metrics.exam_attempts_count,
                average_exam_score=readiness_metrics.average_exam_score,
                best_exam_score=readiness_metrics.best_exam_score,
                overdue_topics_count=overdue_topics_count,
                due_topics_count=due_topics_count,
                critical_topics_count=critical_topics_count,
                fragile_topics_count=fragile_topics_count,
                last_exam_finished_at=readiness_metrics.last_exam_finished_at,
            ),
            build_case_readiness(
                topic_count=topic_count,
                case_topics_count=readiness_metrics.case_topics_count,
                case_attempts_count=readiness_metrics.case_attempts_count,
                average_case_accuracy=round(readiness_metrics.average_case_accuracy, 2)
                if readiness_metrics.average_case_accuracy is not None
                else None,
                best_case_accuracy=round(readiness_metrics.best_case_accuracy, 2)
                if readiness_metrics.best_case_accuracy is not None
                else None,
                recent_case_accuracy=round(readiness_metrics.recent_case_accuracy, 2)
                if readiness_metrics.recent_case_accuracy is not None
                else None,
                recent_case_attempts_count=readiness_metrics.recent_case_attempts_count,
                weak_case_attempts_count=readiness_metrics.weak_case_attempts_count,
                last_case_attempt_at=readiness_metrics.last_case_attempt_at,
            ),
            build_osce_readiness(
                station_count=len(stations),
                started_stations_count=started_stations_count,
                mastered_stations_count=mastered_stations_count,
                average_best_score=round(average_best_osce_score, 2) if average_best_osce_score is not None else None,
                total_attempts_count=readiness_metrics.total_osce_attempts_count,
                recent_attempts_count=readiness_metrics.recent_osce_attempts_count,
                average_recent_score=round(readiness_metrics.average_recent_osce_score, 2)
                if readiness_metrics.average_recent_osce_score is not None
                else None,
                last_osce_attempt_at=readiness_metrics.last_osce_attempt_at,
            ),
        )
        exam_protocol = await self.get_exam_protocol(user)

        return ReadinessSummaryResponse(
            overall_readiness_percent=summary.overall_readiness_percent,
            recommended_focus_key=summary.recommended_focus_key,
            recommended_focus_label=summary.recommended_focus_label,
            tracks=[
                ReadinessTrackResponse(
                    key=item.key,
                    label=item.label,
                    readiness_percent=item.readiness_percent,
                    deficit_percent=item.deficit_percent,
                    status=item.status,
                    detail=item.detail,
                    coverage_percent=item.coverage_percent,
                    freshness_percent=item.freshness_percent,
                    consistency_percent=item.consistency_percent,
                    volume_percent=item.volume_percent,
                    momentum_percent=item.momentum_percent,
                )
                for item in summary.tracks
            ],
            exam_protocol=exam_protocol,
        )

    def _calculate_accuracy(self, correct_answers: int, answered_questions: int) -> float:
        return round((correct_answers / answered_questions) * 100, 2) if answered_questions else 0.0

    def _calculate_optional_accuracy(self, correct_answers: int, answered_questions: int) -> float | None:
        if answered_questions == 0:
            return None

        return self._calculate_accuracy(correct_answers, answered_questions)

    def _days_since(self, value: datetime | None) -> int | None:
        if value is None:
            return None

        if value.tzinfo is None:
            normalized = value.replace(tzinfo=timezone.utc)
        else:
            normalized = value.astimezone(timezone.utc)

        return max((utc_now() - normalized).days, 0)

    def _resolve_status(self, accuracy_percent: float) -> str:
        if accuracy_percent < WEAK_THRESHOLD:
            return "weak"
        if accuracy_percent < MEDIUM_THRESHOLD:
            return "medium"
        return "strong"

    def _latest_datetime(self, *values):
        defined_values = [value for value in values if value is not None]
        return max(defined_values) if defined_values else None

    def _build_question_preview(self, text: str) -> str:
        normalized = " ".join(text.split())

        if len(normalized) <= QUESTION_PREVIEW_LENGTH:
            return normalized

        return f"{normalized[: QUESTION_PREVIEW_LENGTH - 3].rstrip()}..."

    def _normalize_option_label(self, value: object | None) -> str | None:
        if not isinstance(value, str):
            return None

        normalized = value.strip().upper()
        return normalized or None

    async def _resolve_faculty_code(self, user: User) -> str | None:
        if user.faculty_id is None:
            return None

        faculty = await self.faculty_repository.get_by_id(user.faculty_id)

        if faculty is None:
            return None

        return faculty.code

    def _is_accessible_for_faculty(self, faculty_codes: list[str] | None, faculty_code: str | None) -> bool:
        if not faculty_codes or faculty_code is None:
            return True

        return faculty_code in faculty_codes

    def _calculate_days_until_accreditation(self, accreditation_date: date | None) -> int | None:
        if accreditation_date is None:
            return None
        return max((accreditation_date - today()).days, 0)
