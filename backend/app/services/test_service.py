from datetime import datetime, timedelta, timezone
from math import ceil
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import today, utc_now
from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.enums import TestSessionMode, TestSessionStatus
from app.models.enums import PlanTaskType
from app.models.question import Question
from app.models.test_session import TestSession
from app.models.user import User
from app.repositories.question_repository import QuestionRepository
from app.repositories.study_plan_repository import StudyPlanRepository
from app.repositories.test_session_repository import TestSessionRepository
from app.schemas.question import AnswerOptionResponse, QuestionResponse
from app.schemas.test import (
    TestSessionAnswerRequest,
    TestSessionAnswerResultResponse,
    TestSessionAnswerResponse,
    TestSessionCreateRequest,
    TestSessionFinishResponse,
    TestSessionResponse,
)
from app.services.accreditation_service import AccreditationService
from app.services.evidence_context import ATTEMPT_CONTEXT_INITIAL_DIAGNOSTIC, resolve_attempt_context
from app.services.schedule_service import ScheduleService


EXAM_TIME_LIMIT_MINUTES = 60
ACCREDITATION_EXAM_QUESTION_COUNT = 80
INITIAL_DIAGNOSTIC_QUESTION_COUNT = 30


class TestService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.question_repository = QuestionRepository(session)
        self.test_session_repository = TestSessionRepository(session)
        self.study_plan_repository = StudyPlanRepository(session)

    async def start_session(self, user: User, payload: TestSessionCreateRequest) -> TestSessionResponse:
        if user.faculty_id is None or user.accreditation_date is None or not user.onboarding_completed:
            raise BadRequestError("Сначала нужно завершить настройку профиля перед запуском теста")

        explicit_question_ids = self._normalize_question_ids(payload.question_ids)

        if payload.question_ids is not None and explicit_question_ids is None:
            raise BadRequestError("Не удалось собрать вопросы для повторения")

        self._validate_initial_diagnostic_request(payload, explicit_question_ids)

        if payload.simulation_id is not None:
            if explicit_question_ids is not None:
                raise BadRequestError("Пробную аккредитацию нельзя запускать как повторение ошибок")

            if (
                payload.mode != TestSessionMode.EXAM
                or payload.topic_id is not None
                or payload.question_count < ACCREDITATION_EXAM_QUESTION_COUNT
            ):
                raise BadRequestError("Тестовый этап пробной аккредитации должен быть полным экзаменом: 80 вопросов без темы")

            await AccreditationService(self.session).ensure_stage_can_start(user, payload.simulation_id, "tests")

        if explicit_question_ids is not None:
            if payload.planned_task_id is not None:
                raise BadRequestError("Повторение ошибок нельзя запускать как плановую задачу")

            if payload.mode != TestSessionMode.LEARNING:
                raise BadRequestError("Повторение ошибок доступно только в учебном режиме")

            questions = await self.question_repository.list_active_by_ids_for_session(
                faculty_id=user.faculty_id,
                question_ids=explicit_question_ids,
                topic_id=payload.topic_id,
            )

            if len(questions) != len(explicit_question_ids):
                raise BadRequestError(
                    "Часть вопросов для повторения уже недоступна. Обновите аналитику и попробуйте снова."
                )
        elif payload.planned_task_id is not None:
            planned_task = await self.study_plan_repository.get_task_for_user(user.id, payload.planned_task_id)

            if planned_task is None:
                raise NotFoundError("Задача плана не найдена")

            expected_task_type = PlanTaskType.EXAM_SIM if payload.mode == TestSessionMode.EXAM else PlanTaskType.TEST

            if planned_task.task_type != expected_task_type:
                raise BadRequestError("Выбранная задача плана не подходит для этого формата теста")

            if planned_task.topic_id != payload.topic_id:
                raise BadRequestError("Выбранная задача плана не совпадает с темой теста")

            if planned_task.questions_count != payload.question_count:
                raise BadRequestError("Количество вопросов должно совпадать с задачей плана")

            if planned_task.is_skipped or planned_task.is_completed:
                raise BadRequestError("Выбранная задача плана уже не активна")

            if planned_task.scheduled_date > today():
                raise BadRequestError("Эта задача запланирована на будущую дату")

        if explicit_question_ids is None:
            questions = await self.question_repository.list_for_session(
                faculty_id=user.faculty_id,
                topic_id=payload.topic_id,
                question_count=payload.question_count,
                user_id=user.id,
                mode=payload.mode,
            )

        available_question_count = len(questions)

        if available_question_count == 0:
            raise BadRequestError(
                "В выбранном разделе пока нет активных вопросов. Добавь вопросы в админке или выбери другой тест."
            )

        self._validate_initial_diagnostic_availability(payload, available_question_count)

        is_full_exam_simulation = (
            payload.mode == TestSessionMode.EXAM
            and payload.topic_id is None
            and payload.question_count >= ACCREDITATION_EXAM_QUESTION_COUNT
        )

        if is_full_exam_simulation and available_question_count < ACCREDITATION_EXAM_QUESTION_COUNT:
            missing_count = ACCREDITATION_EXAM_QUESTION_COUNT - available_question_count
            raise BadRequestError(
                "Для пробной аккредитации нужно 80 активных вопросов. "
                f"Сейчас доступно {available_question_count}, не хватает {missing_count}. "
                "Добавь вопросы в админке или запусти обычный смешанный тест."
            )

        if payload.planned_task_id is not None and available_question_count < payload.question_count:
            missing_count = payload.question_count - available_question_count
            raise BadRequestError(
                "Плановую задачу нельзя запустить с неполным набором вопросов. "
                f"Нужно {payload.question_count}, сейчас доступно {available_question_count}, "
                f"не хватает {missing_count}. Добавь вопросы в админке и попробуй снова."
            )

        resolved_question_count = available_question_count

        time_limit_minutes = EXAM_TIME_LIMIT_MINUTES if payload.mode == TestSessionMode.EXAM else None

        attempt_context = payload.attempt_context or resolve_attempt_context(
            simulation_id=payload.simulation_id,
            planned_task_id=payload.planned_task_id,
            mode=payload.mode.value,
            is_remediation=explicit_question_ids is not None,
        )

        test_session = TestSession(
            user_id=user.id,
            mode=payload.mode,
            status=TestSessionStatus.ACTIVE,
            topic_id=payload.topic_id,
            planned_task_id=payload.planned_task_id,
            simulation_id=payload.simulation_id,
            attempt_context=attempt_context,
            question_ids=[question.id for question in questions],
            total_questions=resolved_question_count,
            current_index=0,
            time_limit_minutes=time_limit_minutes,
        )

        self.test_session_repository.add(test_session)
        await self.session.commit()
        await self.session.refresh(test_session)

        return self._to_session_response(test_session, questions, answer_results=[])

    async def get_session(self, user: User, session_id: UUID) -> TestSessionResponse:
        test_session = await self._get_owned_session(user, session_id)
        questions = await self.question_repository.get_by_ids(test_session.question_ids)
        return self._to_session_response(test_session, questions)

    async def submit_answer(
        self,
        user: User,
        session_id: UUID,
        payload: TestSessionAnswerRequest,
    ) -> TestSessionAnswerResponse:
        await self._acquire_user_transaction_lock(user.id)
        test_session = await self._get_owned_session(user, session_id)

        if test_session.status != TestSessionStatus.ACTIVE:
            raise BadRequestError("Эта тестовая сессия уже завершена")

        if self._is_exam_time_expired(test_session):
            raise BadRequestError("Время экзаменационной сессии истекло. Заверши сессию, чтобы увидеть результат.")

        if payload.question_id not in test_session.question_ids:
            raise ForbiddenError("Этот вопрос не относится к текущей сессии")

        question = await self.question_repository.get_with_details(payload.question_id)

        if question is None:
            raise NotFoundError("Вопрос не найден")

        existing_answer = next(
            (answer for answer in test_session.answers if answer.question_id == payload.question_id),
            None,
        )
        reveal_feedback = test_session.mode == TestSessionMode.LEARNING

        if existing_answer is not None:
            return self._to_answer_response(
                question_id=payload.question_id,
                selected_option_label=existing_answer.selected_option_label or "",
                is_correct=bool(existing_answer.is_correct),
                question=question,
                reveal_feedback=reveal_feedback,
            )

        normalized_label = self._normalize_selected_option_label(question, payload.selected_option_label)
        correct_option_label = self._get_correct_option_label(question)
        is_correct = normalized_label == correct_option_label

        answer = await self.test_session_repository.upsert_answer(
            session_id=session_id,
            question_id=payload.question_id,
            selected_option_label=normalized_label,
            is_correct=is_correct,
        )

        question_position = test_session.question_ids.index(payload.question_id) + 1
        test_session.current_index = max(test_session.current_index, question_position)

        await self.session.commit()

        return self._to_answer_response(
            question_id=payload.question_id,
            selected_option_label=answer.selected_option_label or normalized_label,
            is_correct=is_correct,
            question=question,
            reveal_feedback=reveal_feedback,
        )

    async def finish_session(
        self,
        user: User,
        session_id: UUID,
        planned_task_id: int | None = None,
    ) -> TestSessionFinishResponse:
        await self._acquire_user_transaction_lock(user.id)
        test_session = await self._get_owned_session(user, session_id)
        questions = await self.question_repository.get_by_ids(test_session.question_ids)

        if test_session.status == TestSessionStatus.FINISHED:
            answered_questions = await self.test_session_repository.count_answered_questions(session_id)
            correct_answers = await self.test_session_repository.count_correct_answers(session_id)
            score_percent = float(test_session.score_percent or 0)

            return self._to_finish_response(
                test_session=test_session,
                questions=questions,
                score_percent=score_percent,
                correct_answers=correct_answers,
                answered_questions=answered_questions,
            )

        if self._is_exam_time_expired(test_session):
            test_session.current_index = test_session.total_questions

        answered_questions = await self.test_session_repository.count_answered_questions(session_id)
        correct_answers = await self.test_session_repository.count_correct_answers(session_id)
        score_percent = round((correct_answers / test_session.total_questions) * 100, 2) if test_session.total_questions else 0.0
        finished_at = utc_now()

        test_session.status = TestSessionStatus.FINISHED
        test_session.finished_at = finished_at
        test_session.current_index = test_session.total_questions
        test_session.score_percent = score_percent

        planned_completion_task_id = (
            test_session.planned_task_id
            if test_session.planned_task_id is not None
            else planned_task_id
        )

        if answered_questions < test_session.total_questions:
            planned_completion_task_id = None

        study_seconds = max(int((finished_at - self._as_aware_datetime(test_session.started_at)).total_seconds()), 1)
        study_minutes = max(ceil(study_seconds / 60), 1)
        await ScheduleService(self.session).record_test_completion(
            user=user,
            topic_id=test_session.topic_id,
            questions_answered=answered_questions,
            correct_answers=correct_answers,
            study_minutes=study_minutes,
            study_seconds=study_seconds,
            mode=test_session.mode,
            planned_task_id=planned_completion_task_id,
            simulation_id=test_session.simulation_id,
            completion_source="exam_simulation" if test_session.simulation_id is not None else None,
            allow_equivalent_free_practice=(
                test_session.simulation_id is None
                and test_session.attempt_context != ATTEMPT_CONTEXT_INITIAL_DIAGNOSTIC
                and answered_questions >= test_session.total_questions
            ),
        )

        if test_session.simulation_id is not None:
            stage_status, remediation_plan, stage_transitioned = await AccreditationService(self.session).record_test_stage_result(
                user=user,
                simulation_id=test_session.simulation_id,
                score_percent=score_percent,
                total_questions=test_session.total_questions,
                answered_questions=answered_questions,
                correct_answers=correct_answers,
                started_at=self._as_aware_datetime(test_session.started_at),
                finished_at=finished_at,
                question_ids=list(test_session.question_ids),
            )
            if stage_transitioned and stage_status == "failed" and remediation_plan:
                await ScheduleService(self.session).apply_accreditation_remediation(
                    user=user,
                    stage_key="tests",
                    simulation_id=test_session.simulation_id,
                    remediation_plan=remediation_plan,
                )
            elif stage_transitioned and stage_status == "passed":
                await ScheduleService(self.session).apply_accreditation_stage_success(
                    user=user,
                    stage_key="tests",
                    simulation_id=test_session.simulation_id,
                )

        await self.session.commit()

        return self._to_finish_response(
            test_session=test_session,
            questions=questions,
            score_percent=score_percent,
            correct_answers=correct_answers,
            answered_questions=answered_questions,
        )

    async def _acquire_user_transaction_lock(self, user_id: int) -> None:
        await self.session.execute(select(func.pg_advisory_xact_lock(user_id)))

    @staticmethod
    def _validate_initial_diagnostic_request(
        payload: TestSessionCreateRequest,
        explicit_question_ids: list[int] | None,
    ) -> None:
        if payload.attempt_context != ATTEMPT_CONTEXT_INITIAL_DIAGNOSTIC:
            return

        if (
            payload.mode != TestSessionMode.EXAM
            or payload.topic_id is not None
            or payload.planned_task_id is not None
            or payload.simulation_id is not None
            or explicit_question_ids is not None
        ):
            raise BadRequestError("Стартовая диагностика запускается как смешанный контроль без привязки к плану")

        if payload.question_count != INITIAL_DIAGNOSTIC_QUESTION_COUNT:
            raise BadRequestError(
                f"Стартовая диагностика должна содержать ровно {INITIAL_DIAGNOSTIC_QUESTION_COUNT} вопросов"
            )

    @staticmethod
    def _validate_initial_diagnostic_availability(
        payload: TestSessionCreateRequest,
        available_question_count: int,
    ) -> None:
        if payload.attempt_context != ATTEMPT_CONTEXT_INITIAL_DIAGNOSTIC:
            return

        if available_question_count < INITIAL_DIAGNOSTIC_QUESTION_COUNT:
            missing_count = INITIAL_DIAGNOSTIC_QUESTION_COUNT - available_question_count
            raise BadRequestError(
                "Для стартовой диагностики нужно 30 активных вопросов. "
                f"Сейчас доступно {available_question_count}, не хватает {missing_count}. "
                "Добавь вопросы в админке или запусти обычную тренировку."
            )

    @staticmethod
    def _normalize_question_ids(question_ids: list[int] | None) -> list[int] | None:
        if question_ids is None:
            return None

        normalized: list[int] = []
        seen: set[int] = set()

        for question_id in question_ids:
            if question_id <= 0 or question_id in seen:
                continue
            seen.add(question_id)
            normalized.append(question_id)

        if not normalized:
            return None

        return normalized

    def _is_exam_time_expired(self, test_session: TestSession) -> bool:
        if test_session.mode != TestSessionMode.EXAM or test_session.time_limit_minutes is None:
            return False

        deadline = self._as_aware_datetime(test_session.started_at) + timedelta(minutes=test_session.time_limit_minutes)
        return utc_now() > deadline

    def _as_aware_datetime(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)

        return value

    def _to_finish_response(
        self,
        test_session: TestSession,
        questions: list[Question],
        score_percent: float,
        correct_answers: int,
        answered_questions: int,
    ) -> TestSessionFinishResponse:
        return TestSessionFinishResponse(
            session_id=test_session.id,
            simulation_id=test_session.simulation_id,
            attempt_context=test_session.attempt_context,
            score_percent=score_percent,
            correct_answers=correct_answers,
            answered_questions=answered_questions,
            total_questions=test_session.total_questions,
            status=test_session.status.value,
            started_at=self._as_aware_datetime(test_session.started_at),
            finished_at=self._as_aware_datetime(test_session.finished_at) if test_session.finished_at is not None else None,
            server_time=utc_now(),
            answers=self._build_answer_results(test_session, questions, reveal_feedback=True),
        )

    async def _get_owned_session(self, user: User, session_id: UUID) -> TestSession:
        test_session = await self.test_session_repository.get_with_answers(session_id)

        if test_session is None:
            raise NotFoundError("Тестовая сессия не найдена")

        if test_session.user_id != user.id:
            raise ForbiddenError("Нет доступа к этой тестовой сессии")

        return test_session

    def _get_correct_option_label(self, question: Question) -> str:
        for answer_option in question.answer_options:
            if answer_option.is_correct:
                return answer_option.label

        raise BadRequestError("У вопроса не настроен правильный ответ")

    def _normalize_selected_option_label(self, question: Question, selected_option_label: str) -> str:
        normalized_label = selected_option_label.strip().upper()
        available_labels = {answer_option.label for answer_option in question.answer_options}

        if normalized_label not in available_labels:
            raise BadRequestError("Выбранный вариант ответа не относится к этому вопросу")

        return normalized_label

    def _to_session_response(
        self,
        test_session: TestSession,
        questions: list[Question],
        answer_results: list[TestSessionAnswerResultResponse] | None = None,
    ) -> TestSessionResponse:
        reveal_feedback = test_session.mode == TestSessionMode.LEARNING or test_session.status == TestSessionStatus.FINISHED
        return TestSessionResponse(
            id=test_session.id,
            simulation_id=test_session.simulation_id,
            attempt_context=test_session.attempt_context,
            mode=test_session.mode.value,
            status=test_session.status.value,
            topic_id=test_session.topic_id,
            total_questions=test_session.total_questions,
            current_index=test_session.current_index,
            time_limit_minutes=test_session.time_limit_minutes,
            started_at=self._as_aware_datetime(test_session.started_at),
            finished_at=self._as_aware_datetime(test_session.finished_at) if test_session.finished_at is not None else None,
            server_time=utc_now(),
            questions=[self._to_question_response(question) for question in questions],
            answers=(
                answer_results
                if answer_results is not None
                else self._build_answer_results(test_session, questions, reveal_feedback=reveal_feedback)
            ),
        )

    def _build_answer_results(
        self,
        test_session: TestSession,
        questions: list[Question],
        reveal_feedback: bool,
    ) -> list[TestSessionAnswerResultResponse]:
        questions_by_id = {question.id: question for question in questions}
        results: list[TestSessionAnswerResultResponse] = []

        for answer in sorted(test_session.answers, key=lambda item: test_session.question_ids.index(item.question_id)):
            question = questions_by_id.get(answer.question_id)

            if question is None:
                continue

            results.append(
                self._to_answer_response(
                    question_id=answer.question_id,
                    selected_option_label=answer.selected_option_label or "",
                    is_correct=bool(answer.is_correct),
                    question=question,
                    reveal_feedback=reveal_feedback,
                )
            )

        return results

    def _to_answer_response(
        self,
        question_id: int,
        selected_option_label: str,
        is_correct: bool,
        question: Question,
        reveal_feedback: bool,
    ) -> TestSessionAnswerResponse:
        return TestSessionAnswerResponse(
            question_id=question_id,
            selected_option_label=selected_option_label,
            is_correct=is_correct if reveal_feedback else None,
            correct_option_label=self._get_correct_option_label(question) if reveal_feedback else None,
            explanation=question.explanation.text if reveal_feedback and question.explanation is not None else None,
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
