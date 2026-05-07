from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import logging
from math import ceil
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import today, utc_now
from app.core.clinical_case_quiz import CASE_QUIZ_QUESTION_COUNT
from app.core.exceptions import BadRequestError, NotFoundError
from app.core.study_schedule import (
    build_study_day_offsets,
    find_next_study_date,
    format_study_weekdays,
    is_study_weekday,
    normalize_study_weekdays,
)
from app.models.clinical_case_attempt import ClinicalCaseAttempt
from app.models.daily_stat import DailyStat
from app.models.osce_attempt import OsceAttempt
from app.models.plan_event import PlanEvent
from app.models.enums import PlanTaskType, PlanTaskVariant, StudyIntensity, TestSessionMode
from app.models.plan_task import PlanTask
from app.models.study_plan import StudyPlan
from app.models.topic import Topic
from app.models.user import User
from app.repositories.analytics_repository import AnalyticsRepository
from app.repositories.clinical_case_attempt_repository import ClinicalCaseAttemptRepository
from app.repositories.daily_stat_repository import DailyStatRepository
from app.repositories.exam_simulation_repository import ExamSimulationRepository
from app.repositories.faculty_repository import FacultyRepository
from app.repositories.osce_attempt_repository import OsceAttemptRepository
from app.repositories.osce_station_repository import OsceStationRepository
from app.repositories.plan_event_repository import PlanEventRepository
from app.repositories.study_plan_repository import StudyPlanRepository
from app.repositories.topic_repository import TopicRepository
from app.schemas.auth import UserResponse
from app.schemas.schedule import (
    PlanEventResponse,
    PlanTaskResponse,
    SchedulePreferencesUpdateResponse,
    ScheduleResponse,
    ScheduleTodayResponse,
)
from app.services.readiness_engine import (
    READINESS_BUILDING_THRESHOLD,
    ReadinessSummarySnapshot,
    build_case_readiness,
    build_osce_readiness,
    build_readiness_summary,
    build_test_readiness,
)

logger = logging.getLogger(__name__)


INTENSIVE_RATIO = 0.6
REINFORCEMENT_RATIO = 0.9
FOCUSED_TEST_QUESTION_COUNT = 6
MIXED_TEST_QUESTION_COUNT = 12
EXAM_SIM_QUESTION_COUNT = 80
FOCUSED_TEST_MINUTES = 12
MIXED_TEST_MINUTES = 20
EXAM_SIM_MINUTES = 60
CASE_SIM_QUESTION_COUNT = CASE_QUIZ_QUESTION_COUNT
CASE_SIM_MINUTES = 30
DEFAULT_SCHEDULE_WINDOW_DAYS = 30
PLAN_EVENT_PREVIEW_LIMIT = 3
OSCE_TASK_SHARE = 0.2
CASE_TASK_SHARE = 0.1
OSCE_PRIORITY_WINDOW_RATIO = 0.75
OSCE_TARGET_EXPANSION = 2
OSCE_MASTERY_PERCENT = 85.0
OSCE_REPEAT_THRESHOLD = 70.0
OSCE_CRITICAL_REPEAT_THRESHOLD = 55.0
TOPIC_EARLY_SIGNAL_QUESTIONS = 4
TOPIC_CONFIDENCE_QUESTIONS = 12
TOPIC_CRITICAL_ACCURACY_PERCENT = 55.0
TOPIC_LOW_ACCURACY_PERCENT = 70.0
TOPIC_STABLE_ACCURACY_PERCENT = 85.0
TOPIC_PRIMARY_BAND_MIN = 3
TOPIC_FRESH_STRUGGLE_DAYS = 3
TOPIC_RECENT_STRUGGLE_DAYS = 7
TOPIC_REPEATED_QUESTION_ALERT_COUNT = 2
TOPIC_HARD_QUESTION_ALERT_PERCENT = 60.0
TOPIC_REVIEW_CRITICAL_INTERVAL_DAYS = 2
TOPIC_REVIEW_FRAGILE_INTERVAL_DAYS = 4
TOPIC_REVIEW_BUILDING_INTERVAL_DAYS = 6
TOPIC_REVIEW_DEVELOPING_INTERVAL_DAYS = 9
TOPIC_REVIEW_STABLE_INTERVAL_DAYS = 14
TOPIC_REVIEW_SOON_WINDOW_DAYS = 2
INTENSIVE_RATIO_MIN = 0.55
INTENSIVE_RATIO_MAX = 0.72
REINFORCEMENT_RATIO_MIN = 0.86
REINFORCEMENT_RATIO_MAX = 0.94
CASE_TASK_SHARE_MIN = 0.08
CASE_TASK_SHARE_MAX = 0.22
OSCE_TASK_SHARE_MIN = 0.15
OSCE_TASK_SHARE_MAX = 0.33
NON_TEST_TASK_SHARE_LIMIT = 0.45
DEFAULT_DAILY_STUDY_MINUTES = 45
MIN_DAILY_STUDY_MINUTES = 20
MAX_DAILY_STUDY_MINUTES = 180
GENTLE_TASK_BUDGET_RATIO = 0.58
STEADY_TASK_BUDGET_RATIO = 0.72
INTENSIVE_TASK_BUDGET_RATIO = 0.86
FOCUSED_TASK_MINUTES_MIN = 12
FOCUSED_TASK_MINUTES_MAX = 24
MIXED_TASK_MINUTES_MIN = 18
MIXED_TASK_MINUTES_MAX = 34
CASE_TASK_MINUTES_MIN = 25
CASE_TASK_MINUTES_MAX = 42
FOCUSED_TASK_QUESTIONS_MIN = 6
FOCUSED_TASK_QUESTIONS_MAX = 12
MIXED_TASK_QUESTIONS_MIN = 10
MIXED_TASK_QUESTIONS_MAX = 18
FINAL_PHASE_OVERALL_GATE_PERCENT = 55.0
FINAL_PHASE_TEST_GATE_PERCENT = 60.0
RECENT_ACTIVITY_WINDOW_DAYS = 14
FINAL_PHASE_CASE_GATE_PERCENT = 45.0
FINAL_PHASE_OSCE_GATE_PERCENT = 50.0
FINAL_PHASE_FOCUSED_TEST_PERCENT = 52.0
FINAL_APPROACH_WINDOW_DAYS = 14
FINAL_WEEK_WINDOW_DAYS = 7
FINAL_PHASE_CYCLE_LENGTH = 4
FINAL_PHASE_REINFORCEMENT_SLOT = 1
FINAL_PHASE_CASE_SLOT = 2
FINAL_PHASE_OSCE_SLOT = 3
FINAL_APPROACH_BROAD_REVIEW_QUESTION_CAP = 14
FINAL_APPROACH_BROAD_REVIEW_MINUTES_CAP = 24
FINAL_WEEK_BROAD_REVIEW_QUESTION_CAP = 12
FINAL_WEEK_BROAD_REVIEW_MINUTES_CAP = 22
PRE_ACCREDITATION_REVIEW_QUESTION_COUNT = 10
PRE_ACCREDITATION_REVIEW_MINUTES = 18
RECOVERY_REVIEW_QUESTION_CAP = 10
RECOVERY_REVIEW_MINUTES_CAP = 18
SUPPLEMENTAL_TEST_QUESTION_COUNT = 6
SUPPLEMENTAL_TEST_MINUTES = 12
DAILY_BUDGET_MINIMUM_FILL_RATIO = 0.72
HEAVY_SLOT_ENERGY_THRESHOLD = 0.95
RECOVERY_DAY_ENERGY_THRESHOLD = 0.8
FINAL_REHEARSAL_TEST_DAY = 6
FINAL_REHEARSAL_CASE_DAY = 5
FINAL_REHEARSAL_OSCE_DAY = 4
FINAL_REHEARSAL_OVERALL_GATE_PERCENT = 68.0
FINAL_REHEARSAL_TEST_GATE_PERCENT = 70.0
FINAL_REHEARSAL_CASE_GATE_PERCENT = 58.0
FINAL_REHEARSAL_OSCE_GATE_PERCENT = 62.0
FINAL_REHEARSAL_MOMENTUM_GATE_PERCENT = 45.0
WEEKLY_CHECKPOINT_INTERVAL_STUDY_DAYS = 5
WEEKLY_CHECKPOINT_FIRST_STUDY_DAY_INDEX = 4
WEEKLY_CHECKPOINT_TITLE_PREFIX = "Недельный контроль"
CASE_EARLY_START_RATIO = 0.34
CASE_WEAK_START_RATIO = 0.22
CASE_CRITICAL_START_RATIO = 0.16
CASE_EARLY_START_MIN_INDEX = 3
NEAR_TERM_DIVERSITY_WINDOW = 5
NEAR_TERM_DIVERSITY_LOOKAHEAD_DAYS = 21
NEAR_TERM_OSCE_TASK_LIMIT = 2
CATCH_UP_STALE_AFTER_DAYS = 7
CATCH_UP_DRIFT_SCORE_THRESHOLD = 1.0
CATCH_UP_MISSED_REASON = "catch_up"
REMEDIATION_TASK_LIMIT = 3
COMPLETION_SOURCE_PLANNED_TASK = "planned_task"
COMPLETION_SOURCE_EQUIVALENT_FREE_PRACTICE = "equivalent_free_practice"
COMPLETION_SOURCE_EXAM_SIMULATION = "exam_simulation"
PROTOCOL_STAGE_KEYS = ("tests", "cases", "osce")
PROTOCOL_STAGE_KEY_SET = frozenset(PROTOCOL_STAGE_KEYS)
RUSSIAN_MONTH_NAMES = {
    1: "января",
    2: "февраля",
    3: "марта",
    4: "апреля",
    5: "мая",
    6: "июня",
    7: "июля",
    8: "августа",
    9: "сентября",
    10: "октября",
    11: "ноября",
    12: "декабря",
}


@dataclass(frozen=True)
class PlannedOsceStation:
    slug: str
    title: str
    duration_minutes: int
    workload_units: int
    best_score_percent: float | None
    attempts_count: int
    status: str
    recommended_repeats: int


@dataclass(frozen=True)
class PlannedTopic:
    topic: Topic
    answered_questions: int
    correct_answers: int
    accuracy_percent: float
    status: str
    recommended_repeats: int
    case_attempts_count: int
    repeated_question_struggles: int
    hard_question_accuracy_percent: float | None
    last_activity_at: datetime | None
    last_struggle_at: datetime | None
    review_interval_days: int
    review_urgency: str
    review_overdue_days: int


@dataclass(frozen=True)
class DeferredTaskSignature:
    task_type: PlanTaskType
    topic_id: int | None
    osce_station_slug: str | None


@dataclass(frozen=True)
class PlannerTaskMix:
    intensive_ratio: float
    reinforcement_ratio: float
    case_share: float
    osce_share: float


@dataclass(frozen=True)
class DailyRhythmContext:
    energy_score: float
    fatigue_score: float
    is_recovery_day: bool
    supports_heavy_slot: bool


@dataclass(frozen=True)
class UserStudyLoadProfile:
    daily_minutes: int
    intensity: StudyIntensity
    study_weekdays: tuple[int, ...]
    focused_test_question_count: int
    focused_test_minutes: int
    mixed_test_question_count: int
    mixed_test_minutes: int
    case_task_minutes: int
    intensive_ratio_shift: float
    reinforcement_ratio_shift: float
    case_share_shift: float
    osce_share_shift: float


@dataclass(frozen=True)
class FinalPhaseGateDecision:
    allow_exam_sim: bool
    focus_track_key: str
    use_focused_test: bool
    allow_final_rehearsal: bool = False


@dataclass(frozen=True)
class ProtocolConfirmationContext:
    passed_stage_keys: frozenset[str]
    failed_stage_keys: frozenset[str]
    active_simulation_id: UUID | None
    latest_simulation_status: str | None
    all_stages_passed: bool


@dataclass(frozen=True)
class TaskExplanationContext:
    topic_by_id: dict[int, PlannedTopic]
    osce_by_slug: dict[str, PlannedOsceStation]
    readiness_summary: ReadinessSummarySnapshot | None
    final_phase_gate: FinalPhaseGateDecision | None
    protocol_context: ProtocolConfirmationContext
    accreditation_date: date | None
    days_until_accreditation: int | None


class ScheduleService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.study_plan_repository = StudyPlanRepository(session)
        self.topic_repository = TopicRepository(session)
        self.analytics_repository = AnalyticsRepository(session)
        self.clinical_case_attempt_repository = ClinicalCaseAttemptRepository(session)
        self.daily_stat_repository = DailyStatRepository(session)
        self.exam_simulation_repository = ExamSimulationRepository(session)
        self.faculty_repository = FacultyRepository(session)
        self.osce_attempt_repository = OsceAttemptRepository(session)
        self.osce_station_repository = OsceStationRepository(session)
        self.plan_event_repository = PlanEventRepository(session)

    async def regenerate_plan_for_user(self, user: User, *, commit: bool = True) -> ScheduleResponse:
        await self._acquire_user_transaction_lock(user.id)
        existing_plan = await self.study_plan_repository.get_by_user_id(user.id)
        is_initial_plan = existing_plan is None or len(existing_plan.tasks) == 0

        await self._replace_plan_from_date(user, today())
        await self._record_regenerate_event(user, is_initial_plan=is_initial_plan)
        if commit:
            await self.session.commit()
        else:
            await self.session.flush()

        return await self.get_schedule(user)

    async def update_study_preferences(
        self,
        user: User,
        daily_study_minutes: int,
        study_intensity: StudyIntensity,
        study_weekdays: list[int],
    ) -> SchedulePreferencesUpdateResponse:
        await self._acquire_user_transaction_lock(user.id)

        if user.faculty_id is None or user.accreditation_date is None or not user.onboarding_completed:
            raise BadRequestError("Сначала нужно завершить настройку профиля перед изменением учебного плана")

        normalized_study_weekdays = normalize_study_weekdays(study_weekdays)
        has_changes = (
            user.daily_study_minutes != daily_study_minutes
            or user.study_intensity != study_intensity
            or normalize_study_weekdays(user.study_weekdays) != normalized_study_weekdays
        )

        if has_changes:
            previous_daily_study_minutes = user.daily_study_minutes
            previous_study_intensity = user.study_intensity
            previous_study_weekdays = normalize_study_weekdays(user.study_weekdays)
            server_today = today()

            user.daily_study_minutes = daily_study_minutes
            user.study_intensity = study_intensity
            user.study_weekdays = normalized_study_weekdays
            today_was_study_day = server_today.weekday() in previous_study_weekdays
            today_is_study_day = server_today.weekday() in normalized_study_weekdays
            rebuild_start_date = (
                server_today
                if today_was_study_day != today_is_study_day or not today_is_study_day
                else server_today + timedelta(days=1)
            )

            await self._replace_plan_from_date(user, rebuild_start_date)
            await self._record_study_preferences_updated_event(
                user,
                effective_from_date=rebuild_start_date,
                previous_daily_study_minutes=previous_daily_study_minutes,
                previous_study_intensity=previous_study_intensity,
                previous_study_weekdays=previous_study_weekdays,
            )
            await self.session.commit()

        return SchedulePreferencesUpdateResponse(
            user=UserResponse.model_validate(user),
            schedule=await self.get_schedule(user),
        )

    async def refresh_future_plan_for_user(self, user: User) -> None:
        await self.session.flush()
        await self._replace_plan_from_date(user, today() + timedelta(days=1))

    async def apply_accreditation_remediation(
        self,
        *,
        user: User,
        stage_key: str,
        simulation_id: UUID,
        remediation_plan: dict,
    ) -> None:
        await self._acquire_user_transaction_lock(user.id)

        if user.faculty_id is None or user.accreditation_date is None:
            return

        first_remediation_date = self._resolve_next_study_date(user, today())
        if first_remediation_date is None:
            await self._record_remediation_event(
                user=user,
                stage_key=stage_key,
                remediation_plan=remediation_plan,
                first_task=None,
            )
            return

        plan = await self._get_or_create_plan(user.id)
        remediation_tasks = await self._build_accreditation_remediation_tasks(
            plan_id=plan.id,
            first_scheduled_date=first_remediation_date,
            user=user,
            stage_key=stage_key,
            simulation_id=simulation_id,
            remediation_plan=remediation_plan,
        )

        if not remediation_tasks:
            await self._record_remediation_event(
                user=user,
                stage_key=stage_key,
                remediation_plan=remediation_plan,
                first_task=None,
            )
            return

        await self.study_plan_repository.delete_tasks_from_date(plan.id, first_remediation_date)
        plan.last_recalculated_at = utc_now()
        self.session.add_all(remediation_tasks)

        last_remediation_date = max(task.scheduled_date for task in remediation_tasks)
        rebuild_start_date = self._resolve_next_study_date(user, last_remediation_date)
        if rebuild_start_date is not None:
            await self._replace_plan_from_date(user, rebuild_start_date)

        await self._record_remediation_event(
            user=user,
            stage_key=stage_key,
            remediation_plan=remediation_plan,
            first_task=remediation_tasks[0],
        )

    async def apply_accreditation_stage_success(
        self,
        *,
        user: User,
        stage_key: str,
        simulation_id: UUID,
    ) -> None:
        await self._acquire_user_transaction_lock(user.id)

        if user.faculty_id is None or user.accreditation_date is None:
            return

        rebuild_start_date = self._resolve_next_study_date(user, today())
        if rebuild_start_date is not None:
            await self._replace_plan_from_date(user, rebuild_start_date)

        await self._record_stage_success_event(
            user=user,
            stage_key=stage_key,
            simulation_id=simulation_id,
            rebuild_start_date=rebuild_start_date,
        )

    async def get_schedule(
        self,
        user: User,
        days: int = DEFAULT_SCHEDULE_WINDOW_DAYS,
        *,
        allow_catch_up: bool = True,
    ) -> ScheduleResponse:
        server_today = today()
        if allow_catch_up:
            await self._apply_catch_up_mode_if_needed(user, server_today)
            await self._apply_non_study_today_rebuild_if_needed(user, server_today)

        plan = await self.study_plan_repository.get_by_user_id(user.id)
        events = await self.plan_event_repository.list_by_user(user.id, limit=PLAN_EVENT_PREVIEW_LIMIT)
        explanation_context = await self._build_task_explanation_context(user)
        budget = await self._build_today_budget(user, server_today)

        if plan is None:
            return ScheduleResponse(
                days_until_accreditation=self._calculate_days_until_accreditation(user),
                server_today=server_today,
                **budget,
                tasks=[],
                events=[self._to_plan_event_response(event) for event in events],
            )

        start_date = await self._resolve_schedule_focus_date(user.id, server_today)
        end_date = server_today + timedelta(days=max(days - 1, 0))
        tasks = await self.study_plan_repository.list_tasks_in_range(plan.id, start_date, end_date)

        return ScheduleResponse(
            days_until_accreditation=self._calculate_days_until_accreditation(user),
            server_today=server_today,
            **budget,
            tasks=[self._to_task_response(task, explanation_context) for task in tasks],
            events=[self._to_plan_event_response(event) for event in events],
        )

    async def get_today(self, user: User, *, allow_catch_up: bool = True) -> ScheduleTodayResponse:
        server_today = today()
        if allow_catch_up:
            await self._apply_catch_up_mode_if_needed(user, server_today)
            await self._apply_non_study_today_rebuild_if_needed(user, server_today)

        plan = await self.study_plan_repository.get_by_user_id(user.id)
        explanation_context = await self._build_task_explanation_context(user)
        budget = await self._build_today_budget(user, server_today)

        if plan is None:
            return ScheduleTodayResponse(
                scheduled_date=server_today,
                server_today=server_today,
                **budget,
                tasks=[],
            )

        focus_date = await self._resolve_schedule_focus_date(user.id, server_today)
        tasks = await self.study_plan_repository.list_tasks_in_range(plan.id, focus_date, focus_date)
        return ScheduleTodayResponse(
            scheduled_date=focus_date,
            server_today=server_today,
            **budget,
            tasks=[self._to_task_response(task, explanation_context) for task in tasks],
        )

    async def skip_task(self, user: User, task_id: int) -> PlanTaskResponse:
        await self._acquire_user_transaction_lock(user.id)
        task = await self.study_plan_repository.get_task_for_user(user.id, task_id)

        if task is None:
            raise NotFoundError("Задача плана не найдена")

        if task.is_completed:
            raise BadRequestError("Завершенную задачу нельзя пропустить")

        if task.is_skipped:
            explanation_context = await self._build_task_explanation_context(user)
            return self._to_task_response(task, explanation_context)

        task.is_skipped = True
        task.is_completed = False
        task.is_stale = False
        task.completed_at = None
        task.missed_at = None
        task.missed_reason = None

        rebuild_start_date = max(today(), task.scheduled_date) + timedelta(days=1)
        await self._replace_plan_from_date(user, rebuild_start_date)
        await self._record_skip_event(user, task)

        await self.session.commit()

        explanation_context = await self._build_task_explanation_context(user)
        return self._to_task_response(task, explanation_context)

    async def postpone_task(self, user: User, task_id: int) -> PlanTaskResponse:
        await self._acquire_user_transaction_lock(user.id)
        task = await self.study_plan_repository.get_task_for_user(user.id, task_id)

        if task is None:
            raise NotFoundError("Задача плана не найдена")

        target_date = self._resolve_next_study_date(user, max(today(), task.scheduled_date))

        if target_date is None:
            raise BadRequestError("До даты аккредитации не осталось доступных учебных дней")

        await self._reschedule_task_to_date(user, task, target_date)
        await self._record_postpone_event_explained(user, task)
        await self.session.commit()

        explanation_context = await self._build_task_explanation_context(user)
        return self._to_task_response(task, explanation_context)

    async def reschedule_task(self, user: User, task_id: int, target_date: date) -> ScheduleResponse:
        await self._acquire_user_transaction_lock(user.id)
        task = await self.study_plan_repository.get_task_for_user(user.id, task_id)

        if task is None:
            raise NotFoundError("Задача плана не найдена")

        previous_date = task.scheduled_date
        await self._reschedule_task_to_date(user, task, target_date)
        await self._record_reschedule_event_explained(user, task, previous_date)
        await self.session.commit()

        visible_days = max(DEFAULT_SCHEDULE_WINDOW_DAYS, (target_date - today()).days + 1)
        return await self.get_schedule(user, days=visible_days)

    async def record_test_completion(
        self,
        user: User,
        topic_id: int | None,
        questions_answered: int,
        correct_answers: int,
        study_minutes: int,
        mode: TestSessionMode,
        study_seconds: int | None = None,
        planned_task_id: int | None = None,
        simulation_id: UUID | None = None,
        completion_source: str | None = None,
        allow_equivalent_free_practice: bool = True,
    ) -> None:
        await self._acquire_user_transaction_lock(user.id)
        await self._record_activity(
            user=user,
            questions_answered=questions_answered,
            correct_answers=correct_answers,
            study_minutes=study_minutes,
            study_seconds=study_seconds,
        )

        task_type = PlanTaskType.EXAM_SIM if mode == TestSessionMode.EXAM else PlanTaskType.TEST
        task_topic_id = None if mode == TestSessionMode.EXAM else topic_id
        task = None

        task_completion_source = completion_source or COMPLETION_SOURCE_PLANNED_TASK

        if planned_task_id is not None:
            task = await self._resolve_task_for_completion(
                user=user,
                task_type=task_type,
                topic_id=task_topic_id,
                planned_task_id=planned_task_id,
            )

            if task is not None and not self._has_completed_required_workload(task, questions_answered):
                task = None
        elif allow_equivalent_free_practice and simulation_id is None and completion_source is None:
            task = await self._resolve_equivalent_free_practice_task(
                user=user,
                task_type=task_type,
                topic_id=task_topic_id,
            )
            task_completion_source = COMPLETION_SOURCE_EQUIVALENT_FREE_PRACTICE

            if task is not None and not self._has_completed_required_workload(task, questions_answered):
                task = None

        if task is not None:
            if simulation_id is not None:
                task.linked_simulation_id = simulation_id
            task.completion_source = task_completion_source
            self.study_plan_repository.mark_task_completed(task)

        await self.refresh_future_plan_for_user(user)

        if task is not None:
            await self._append_today_follow_up_if_time_remains(user)
            await self._record_completion_event(user, task)

    async def record_osce_completion(
        self,
        user: User,
        station_slug: str,
        quiz_total_questions: int,
        quiz_correct_answers: int,
        study_minutes: int,
        study_seconds: int | None = None,
        planned_task_id: int | None = None,
        completion_source: str | None = None,
        workload_units: int | None = None,
    ) -> None:
        await self._acquire_user_transaction_lock(user.id)
        await self._record_activity(
            user=user,
            questions_answered=quiz_total_questions,
            correct_answers=quiz_correct_answers,
            study_minutes=study_minutes,
            study_seconds=study_seconds,
        )

        task = None

        task_completion_source = completion_source or COMPLETION_SOURCE_PLANNED_TASK
        answered_units = workload_units if workload_units is not None else quiz_total_questions

        if planned_task_id is not None:
            task = await self._resolve_task_for_completion(
                user=user,
                task_type=PlanTaskType.OSCE,
                topic_id=None,
                osce_station_slug=station_slug,
                planned_task_id=planned_task_id,
            )

            if task is not None and self._resolve_task_intent(task) == "exam_checkpoint":
                task = None

        if task is not None:
            if not self._has_completed_required_workload(task, answered_units):
                task = None

        if task is None and planned_task_id is None and completion_source is None:
            task = await self._resolve_equivalent_free_practice_task(
                user=user,
                task_type=PlanTaskType.OSCE,
                topic_id=None,
                osce_station_slug=station_slug,
            )
            task_completion_source = COMPLETION_SOURCE_EQUIVALENT_FREE_PRACTICE

            if task is not None and not self._has_completed_required_workload(task, answered_units):
                task = None

        if task is not None:
            task.completion_source = task_completion_source
            self.study_plan_repository.mark_task_completed(task)

        await self.refresh_future_plan_for_user(user)

        if task is not None:
            await self._append_today_follow_up_if_time_remains(user)
            await self._record_completion_event(user, task)

    async def record_case_completion(
        self,
        user: User,
        case_slug: str,
        case_title: str,
        topic_id: int | None,
        questions_answered: int,
        correct_answers: int,
        study_minutes: int,
        study_seconds: int | None = None,
        answer_feedback: list[dict[str, str | bool]] | None = None,
        planned_task_id: int | None = None,
        simulation_id: UUID | None = None,
        attempt_context: str = "free_training",
        completion_source: str | None = None,
        submitted_at: datetime | None = None,
    ) -> bool:
        await self._acquire_user_transaction_lock(user.id)
        accuracy_percent = round((correct_answers / questions_answered) * 100, 2) if questions_answered else 0.0
        self.clinical_case_attempt_repository.add(
            ClinicalCaseAttempt(
                user_id=user.id,
                case_slug=case_slug,
                case_title=case_title,
                  topic_id=topic_id,
                  simulation_id=simulation_id,
                  attempt_context=attempt_context,
                  answered_questions=questions_answered,
                correct_answers=correct_answers,
                accuracy_percent=accuracy_percent,
                study_minutes=study_minutes,
                answer_feedback=list(answer_feedback or []),
                submitted_at=submitted_at or utc_now(),
            )
        )

        await self._record_activity(
            user=user,
            questions_answered=questions_answered,
            correct_answers=correct_answers,
            study_minutes=study_minutes,
            study_seconds=study_seconds,
        )

        task_completed = False
        task: PlanTask | None = None
        task_completion_source = completion_source or COMPLETION_SOURCE_PLANNED_TASK

        if planned_task_id is not None:
            task = await self._resolve_task_for_completion(
                user=user,
                task_type=PlanTaskType.CASE,
                topic_id=topic_id,
                planned_task_id=planned_task_id,
            )

            if task is not None and self._resolve_task_intent(task) == "exam_checkpoint":
                task = None

        elif simulation_id is None and completion_source is None and attempt_context != "strict_simulation":
            task = await self._resolve_equivalent_free_practice_task(
                user=user,
                task_type=PlanTaskType.CASE,
                topic_id=topic_id,
            )
            task_completion_source = COMPLETION_SOURCE_EQUIVALENT_FREE_PRACTICE

        if task is not None and self._has_completed_required_workload(task, questions_answered):
            task.completion_source = task_completion_source
            self.study_plan_repository.mark_task_completed(task)
            task_completed = True

        await self.refresh_future_plan_for_user(user)

        if task_completed and task is not None:
            await self._append_today_follow_up_if_time_remains(user)
            await self._record_completion_event(user, task)

        return task_completed

    async def complete_exam_checkpoint_task(
        self,
        user: User,
        planned_task_id: int | None,
        checkpoint_type: str,
        simulation_id: UUID,
    ) -> bool:
        if planned_task_id is None:
            return False

        await self._acquire_user_transaction_lock(user.id)
        task = await self.study_plan_repository.get_task_for_user(user.id, planned_task_id)

        if task is None:
            logger.warning(
                "Planner checkpoint completion ignored: task %s for user %s was not found",
                planned_task_id,
                user.id,
            )
            return False

        if self._resolve_task_intent(task) != "exam_checkpoint":
            logger.warning(
                "Planner checkpoint completion ignored: task %s for user %s is not an exam checkpoint",
                planned_task_id,
                user.id,
            )
            return False

        if self._resolve_task_exam_checkpoint_type(task) != checkpoint_type:
            logger.warning(
                "Planner checkpoint completion ignored: task %s for user %s expected checkpoint %s, got %s",
                planned_task_id,
                user.id,
                self._resolve_task_exam_checkpoint_type(task),
                checkpoint_type,
            )
            return False

        if (
            task.is_completed
            and task.linked_simulation_id == simulation_id
            and task.completion_source == COMPLETION_SOURCE_EXAM_SIMULATION
        ):
            return True

        if task.is_completed or task.is_skipped or task.scheduled_date > today():
            logger.warning(
                "Planner checkpoint completion ignored: task %s for user %s is not pending "
                "(completed=%s skipped=%s scheduled_date=%s)",
                planned_task_id,
                user.id,
                task.is_completed,
                task.is_skipped,
                task.scheduled_date.isoformat(),
            )
            return False

        task.linked_simulation_id = simulation_id
        task.completion_source = COMPLETION_SOURCE_EXAM_SIMULATION
        self.study_plan_repository.mark_task_completed(task)
        await self.refresh_future_plan_for_user(user)
        await self._record_completion_event(user, task)
        return True

    def _has_completed_required_workload(self, task: PlanTask, questions_answered: int) -> bool:
        if questions_answered >= task.questions_count:
            return True

        logger.warning(
            "Planner completion ignored: task %s requires %s answered units, got %s",
            task.id,
            task.questions_count,
            questions_answered,
        )
        return False

    async def _reschedule_task_to_date(self, user: User, task: PlanTask, target_date: date) -> None:
        self._validate_task_reschedule(user, task, target_date)

        deferred_task_signature = self._build_task_signature(task)

        await self.study_plan_repository.delete_tasks_from_date_excluding_task(
            task.plan_id,
            target_date,
            task.id,
        )

        task.scheduled_date = target_date
        task.is_skipped = False
        task.is_completed = False
        task.is_stale = False
        task.completed_at = None
        task.missed_at = None
        task.missed_reason = None

        await self._replace_plan_from_date(
            user,
            target_date + timedelta(days=1),
            deferred_task_signature=deferred_task_signature,
        )

    async def _resolve_task_for_completion(
        self,
        user: User,
        task_type: PlanTaskType,
        topic_id: int | None,
        planned_task_id: int | None = None,
        osce_station_slug: str | None = None,
    ) -> PlanTask | None:
        if planned_task_id is None:
            return None

        task = await self.study_plan_repository.get_task_for_user(user.id, planned_task_id)

        if task is None:
            logger.warning(
                "Planner completion ignored: explicit task %s for user %s was not found for %s",
                planned_task_id,
                user.id,
                task_type.value,
            )
            return None

        if task.task_type != task_type or task.topic_id != topic_id or task.osce_station_slug != osce_station_slug:
            logger.warning(
                "Planner completion ignored: explicit task %s for user %s mismatched "
                "(expected type=%s topic=%s station=%s, actual type=%s topic=%s station=%s)",
                planned_task_id,
                user.id,
                task_type.value,
                topic_id,
                osce_station_slug,
                task.task_type.value,
                task.topic_id,
                task.osce_station_slug,
            )
            return None

        if task.is_completed or task.is_skipped or task.scheduled_date > today():
            logger.warning(
                "Planner completion ignored: explicit task %s for user %s is not pending "
                "(completed=%s skipped=%s scheduled_date=%s)",
                planned_task_id,
                user.id,
                task.is_completed,
                task.is_skipped,
                task.scheduled_date.isoformat(),
            )
            return None

        return task

    async def _resolve_equivalent_free_practice_task(
        self,
        user: User,
        task_type: PlanTaskType,
        topic_id: int | None,
        osce_station_slug: str | None = None,
    ) -> PlanTask | None:
        task = await self.study_plan_repository.get_pending_task_for_completion(
            user.id,
            task_type,
            topic_id,
            osce_station_slug,
            today(),
        )

        if task is None:
            return None

        if self._resolve_task_intent(task) == "exam_checkpoint":
            logger.warning(
                "Planner equivalent completion ignored: task %s for user %s is an exam checkpoint",
                task.id,
                user.id,
            )
            return None

        return task

    def _validate_task_reschedule(self, user: User, task: PlanTask, target_date: date) -> None:
        if task.is_completed:
            raise BadRequestError("Завершенную задачу нельзя перенести")

        if task.is_skipped:
            raise BadRequestError("Пропущенную задачу нельзя перенести")

        if user.accreditation_date is None:
            raise BadRequestError("Сначала нужно завершить настройку профиля перед формированием плана")

        if target_date <= today():
            raise BadRequestError("Задачу можно перенести только на будущую дату")

        if target_date >= user.accreditation_date:
            raise BadRequestError("Задачу нельзя перенести дальше даты аккредитации")

        if target_date == task.scheduled_date:
            raise BadRequestError("Задача уже запланирована на выбранную дату")

        if not is_study_weekday(target_date, user.study_weekdays):
            raise BadRequestError("Задачу можно переносить только на выбранные учебные дни")

    def _resolve_next_study_date(self, user: User, after_date: date) -> date | None:
        return find_next_study_date(
            after_date=after_date,
            value=user.study_weekdays,
            accreditation_date=user.accreditation_date,
        )

    async def _build_accreditation_remediation_tasks(
        self,
        *,
        plan_id: int,
        first_scheduled_date: date,
        user: User,
        stage_key: str,
        simulation_id: UUID,
        remediation_plan: dict,
    ) -> list[PlanTask]:
        load_profile = self._build_user_study_load_profile(user)
        weak_items = self._sort_remediation_weak_items(remediation_plan.get("weak_items"))

        if stage_key == "cases":
            topics = await self._list_prioritized_topics(user)
            topics_by_id = {topic.topic.id: topic for topic in topics}
            return self._build_case_remediation_tasks(
                plan_id=plan_id,
                first_scheduled_date=first_scheduled_date,
                user=user,
                simulation_id=simulation_id,
                weak_items=weak_items,
                topics_by_id=topics_by_id,
                load_profile=load_profile,
            )

        if stage_key == "osce":
            stations = await self._list_prioritized_osce_stations(user)
            stations_by_slug = {station.slug: station for station in stations}
            return self._build_osce_remediation_tasks(
                plan_id=plan_id,
                first_scheduled_date=first_scheduled_date,
                user=user,
                simulation_id=simulation_id,
                weak_items=weak_items,
                stations_by_slug=stations_by_slug,
            )

        topics = await self._list_prioritized_topics(user)
        topic = topics[0] if topics else None
        return [
            PlanTask(
                plan_id=plan_id,
                scheduled_date=first_scheduled_date,
                task_type=PlanTaskType.TEST,
                task_variant=PlanTaskVariant.STANDARD,
                topic_id=topic.topic.id if topic is not None else None,
                task_title="Разбор проваленного тестового этапа",
                questions_count=load_profile.mixed_test_question_count,
                estimated_minutes=load_profile.mixed_test_minutes,
                intent="remediation",
                target_route="learning_center",
                linked_simulation_id=simulation_id,
            )
        ]

    def _build_case_remediation_tasks(
        self,
        *,
        plan_id: int,
        first_scheduled_date: date,
        user: User,
        simulation_id: UUID,
        weak_items: list[dict],
        topics_by_id: dict[int, PlannedTopic],
        load_profile: UserStudyLoadProfile,
    ) -> list[PlanTask]:
        tasks: list[PlanTask] = []
        scheduled_after = first_scheduled_date - timedelta(days=1)

        for item in weak_items[:REMEDIATION_TASK_LIMIT]:
            scheduled_date = self._resolve_next_study_date(user, scheduled_after)
            if scheduled_date is None:
                break

            topic_id = self._coerce_positive_int(item.get("topic_id"))
            planned_topic = topics_by_id.get(topic_id) if topic_id is not None else None
            title = str(item.get("title") or item.get("topic_name") or item.get("slug") or "кейс").strip()

            if planned_topic is not None:
                task = self._build_case_task(plan_id, scheduled_date, planned_topic, load_profile)
            else:
                task = PlanTask(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    task_type=PlanTaskType.CASE,
                    task_variant=PlanTaskVariant.STANDARD,
                    topic_id=topic_id,
                    questions_count=CASE_SIM_QUESTION_COUNT,
                    estimated_minutes=load_profile.case_task_minutes,
                    target_route="cases",
                )

            task.intent = "remediation"
            task.task_title = self._truncate_task_title(f"Разбор кейса после пробной аккредитации: {title}")
            task.linked_simulation_id = simulation_id
            tasks.append(task)
            scheduled_after = scheduled_date

        if tasks:
            return tasks

        return [
            PlanTask(
                plan_id=plan_id,
                scheduled_date=first_scheduled_date,
                task_type=PlanTaskType.CASE,
                task_variant=PlanTaskVariant.STANDARD,
                topic_id=None,
                task_title="Разбор кейсового этапа после пробной аккредитации",
                questions_count=CASE_SIM_QUESTION_COUNT,
                estimated_minutes=load_profile.case_task_minutes,
                intent="remediation",
                target_route="cases",
                linked_simulation_id=simulation_id,
            )
        ]

    def _build_osce_remediation_tasks(
        self,
        *,
        plan_id: int,
        first_scheduled_date: date,
        user: User,
        simulation_id: UUID,
        weak_items: list[dict],
        stations_by_slug: dict[str, PlannedOsceStation],
    ) -> list[PlanTask]:
        tasks: list[PlanTask] = []
        scheduled_after = first_scheduled_date - timedelta(days=1)

        for item in weak_items[:REMEDIATION_TASK_LIMIT]:
            scheduled_date = self._resolve_next_study_date(user, scheduled_after)
            if scheduled_date is None:
                break

            slug = str(item.get("slug") or "").strip().lower()
            title = str(item.get("title") or slug or "станция ОСКЭ").strip()
            station = stations_by_slug.get(slug)

            if station is not None:
                task = self._build_osce_task(plan_id, scheduled_date, station)
            else:
                task = PlanTask(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    task_type=PlanTaskType.OSCE,
                    task_variant=PlanTaskVariant.STANDARD,
                    topic_id=None,
                    osce_station_slug=slug or None,
                    questions_count=1,
                    estimated_minutes=10,
                    target_route="osce",
                )

            task.intent = "remediation"
            task.task_title = self._truncate_task_title(f"Разбор станции после пробной аккредитации: {title}")
            task.linked_simulation_id = simulation_id
            tasks.append(task)
            scheduled_after = scheduled_date

        if tasks:
            return tasks

        return [
            PlanTask(
                plan_id=plan_id,
                scheduled_date=first_scheduled_date,
                task_type=PlanTaskType.OSCE,
                task_variant=PlanTaskVariant.STANDARD,
                topic_id=None,
                task_title="Разбор практического этапа после пробной аккредитации",
                questions_count=1,
                estimated_minutes=10,
                intent="remediation",
                target_route="osce",
                linked_simulation_id=simulation_id,
            )
        ]

    @staticmethod
    def _sort_remediation_weak_items(value) -> list[dict]:
        if not isinstance(value, list):
            return []

        items = [item for item in value if isinstance(item, dict)]
        return sorted(
            items,
            key=lambda item: float(item.get("score_percent") if item.get("score_percent") is not None else 101),
        )

    @staticmethod
    def _coerce_positive_int(value) -> int | None:
        if isinstance(value, bool):
            return None

        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None

        return parsed if parsed > 0 else None

    @staticmethod
    def _truncate_task_title(value: str) -> str:
        return value[:255]

    def _build_tasks(
        self,
        plan_id: int,
        topics: list[PlannedTopic],
        osce_stations: list[PlannedOsceStation],
        readiness_summary: ReadinessSummarySnapshot,
        load_profile: UserStudyLoadProfile,
        start_date: date,
        days_until_accreditation: int,
        deferred_task_signature: DeferredTaskSignature | None = None,
        protocol_context: ProtocolConfirmationContext | None = None,
    ) -> list[PlanTask]:
        study_day_offsets = self._build_study_day_offsets(
            start_date,
            days_until_accreditation,
            load_profile,
        )
        study_day_count = len(study_day_offsets)

        if study_day_count <= 0:
            return []

        tasks: list[PlanTask] = []
        task_mix = self._build_planner_task_mix(readiness_summary, load_profile)
        intensive_limit = ceil(study_day_count * task_mix.intensive_ratio)
        reinforcement_limit = ceil(study_day_count * task_mix.reinforcement_ratio)
        osce_sequence = self._build_osce_task_sequence(
            osce_stations,
            study_day_count,
            task_mix.osce_share,
        )
        osce_day_offsets = self._build_osce_day_offsets(
            start_date,
            days_until_accreditation,
            len(osce_sequence),
            load_profile,
            study_day_offsets=study_day_offsets,
        )
        focused_topic_sequence = self._build_topic_focus_sequence(topics, intensive_limit)
        case_start_index = self._resolve_case_start_index(
            study_day_count,
            intensive_limit,
            readiness_summary,
        )
        case_sequence = self._build_case_task_sequence(
            topics,
            study_day_count,
            case_start_index,
            task_mix.case_share,
        )
        case_day_offsets = self._build_case_day_offsets(
            start_date,
            days_until_accreditation,
            case_start_index,
            len(case_sequence),
            load_profile,
            study_day_offsets=study_day_offsets,
        )
        osce_tasks_by_day = {
            day_offset: osce_sequence[index]
            for index, day_offset in enumerate(osce_day_offsets)
        }
        case_tasks_by_day = {
            day_offset: case_sequence[index]
            for index, day_offset in enumerate(case_day_offsets)
        }
        final_phase_gate = self._resolve_final_phase_gate(readiness_summary)
        fallback_osce_index = 0
        fallback_case_index = 0
        fallback_focus_index = 0
        early_focus_index = 0

        for study_day_index, day_offset in enumerate(study_day_offsets):
            scheduled_date = start_date + timedelta(days=day_offset)
            remaining_days_until_accreditation = study_day_count - study_day_index
            daily_rhythm = self._build_daily_rhythm_context(
                scheduled_date,
                load_profile,
                remaining_days_until_accreditation,
            )
            planned_osce_station = osce_tasks_by_day.get(day_offset)
            planned_case_topic = case_tasks_by_day.get(day_offset)

            if (
                day_offset == 0
                and planned_osce_station is not None
                and deferred_task_signature is not None
                and deferred_task_signature.task_type == PlanTaskType.OSCE
                and deferred_task_signature.osce_station_slug is not None
            ):
                planned_osce_station = self._select_next_osce_station(
                    osce_sequence,
                    deferred_task_signature.osce_station_slug,
                    planned_osce_station,
                )

            if planned_osce_station is not None:
                tasks.append(self._build_osce_task(plan_id, scheduled_date, planned_osce_station))
                continue

            if (
                planned_case_topic is not None
                and day_offset == 0
                and deferred_task_signature is not None
                and deferred_task_signature.task_type == PlanTaskType.CASE
                and deferred_task_signature.topic_id is not None
            ):
                planned_case_topic = self._select_next_topic(
                    case_sequence,
                    deferred_task_signature.topic_id,
                    planned_case_topic,
                )

            if planned_case_topic is not None:
                tasks.append(self._build_case_task(plan_id, scheduled_date, planned_case_topic, load_profile))
                continue

            if not topics and osce_sequence:
                planned_osce_station = osce_sequence[fallback_osce_index % len(osce_sequence)]

                if (
                    day_offset == 0
                    and deferred_task_signature is not None
                    and deferred_task_signature.task_type == PlanTaskType.OSCE
                    and deferred_task_signature.osce_station_slug is not None
                ):
                    planned_osce_station = self._select_next_osce_station(
                        osce_sequence,
                        deferred_task_signature.osce_station_slug,
                        planned_osce_station,
                    )

                tasks.append(self._build_osce_task(plan_id, scheduled_date, planned_osce_station))
                fallback_osce_index += 1
                continue

            if study_day_index < intensive_limit:
                if daily_rhythm.is_recovery_day:
                    tasks.append(self._build_recovery_review_task(plan_id, scheduled_date, load_profile))
                    continue

                if len(focused_topic_sequence) == 0:
                    tasks.append(
                        PlanTask(
                            plan_id=plan_id,
                            scheduled_date=scheduled_date,
                            task_type=PlanTaskType.TEST,
                            task_variant=PlanTaskVariant.STANDARD,
                            topic_id=None,
                            questions_count=load_profile.focused_test_question_count,
                            estimated_minutes=load_profile.focused_test_minutes,
                        )
                    )
                    continue

                topic = focused_topic_sequence[early_focus_index % len(focused_topic_sequence)]

                if (
                    day_offset == 0
                    and deferred_task_signature is not None
                    and deferred_task_signature.task_type == PlanTaskType.TEST
                    and deferred_task_signature.topic_id is not None
                ):
                    topic = self._select_next_topic(focused_topic_sequence, deferred_task_signature.topic_id, topic)

                tasks.append(
                    PlanTask(
                        plan_id=plan_id,
                        scheduled_date=scheduled_date,
                        task_type=PlanTaskType.TEST,
                        task_variant=PlanTaskVariant.STANDARD,
                        topic_id=topic.topic.id,
                        questions_count=load_profile.focused_test_question_count,
                        estimated_minutes=load_profile.focused_test_minutes,
                    )
                )
                early_focus_index += 1
                continue

            if study_day_index < reinforcement_limit:
                if daily_rhythm.is_recovery_day:
                    tasks.append(self._build_recovery_review_task(plan_id, scheduled_date, load_profile))
                    continue

                tasks.append(
                    PlanTask(
                        plan_id=plan_id,
                        scheduled_date=scheduled_date,
                        task_type=PlanTaskType.TEST,
                        task_variant=PlanTaskVariant.STANDARD,
                        topic_id=None,
                        questions_count=load_profile.mixed_test_question_count,
                        estimated_minutes=load_profile.mixed_test_minutes,
                    )
                )
                continue

            final_phase_task, fallback_focus_index, fallback_case_index, fallback_osce_index = (
                self._build_final_phase_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    focused_topic_sequence=focused_topic_sequence,
                    case_sequence=case_sequence,
                    osce_sequence=osce_sequence,
                    load_profile=load_profile,
                    final_phase_gate=final_phase_gate,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    final_phase_day_index=study_day_index - reinforcement_limit,
                    remaining_days_until_accreditation=remaining_days_until_accreditation,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                    protocol_context=protocol_context,
                )
            )
            tasks.append(final_phase_task)

        self._apply_weekly_checkpoint_rhythm(
            tasks,
            plan_id=plan_id,
            readiness_summary=readiness_summary,
            load_profile=load_profile,
            case_sequence=case_sequence,
            osce_sequence=osce_sequence,
            start_date=start_date,
            days_until_accreditation=days_until_accreditation,
            protocol_context=protocol_context,
        )
        self._fill_daily_study_budgets(
            tasks,
            plan_id=plan_id,
            topics=topics,
            load_profile=load_profile,
            start_date=start_date,
            days_until_accreditation=days_until_accreditation,
        )
        self._rebalance_near_term_task_mix(
            tasks,
            start_date=start_date,
            days_until_accreditation=days_until_accreditation,
        )

        return tasks

    async def _build_task_explanation_context(self, user: User) -> TaskExplanationContext:
        if user.faculty_id is None or user.accreditation_date is None:
            return TaskExplanationContext(
                topic_by_id={},
                osce_by_slug={},
                readiness_summary=None,
                final_phase_gate=None,
                protocol_context=self._empty_protocol_confirmation_context(),
                accreditation_date=user.accreditation_date,
                days_until_accreditation=self._calculate_days_until_accreditation(user),
            )

        prioritized_topics = await self._list_prioritized_topics(user)
        osce_stations = await self._list_prioritized_osce_stations(user)
        readiness_summary = await self._build_readiness_summary(user, prioritized_topics, osce_stations)
        protocol_context = await self._build_protocol_confirmation_context(user)

        return TaskExplanationContext(
            topic_by_id={topic.topic.id: topic for topic in prioritized_topics},
            osce_by_slug={station.slug: station for station in osce_stations},
            readiness_summary=readiness_summary,
            final_phase_gate=self._resolve_final_phase_gate(readiness_summary),
            protocol_context=protocol_context,
            accreditation_date=user.accreditation_date,
            days_until_accreditation=self._calculate_days_until_accreditation(user),
        )

    def _to_task_response(
        self,
        task: PlanTask,
        explanation_context: TaskExplanationContext | None = None,
    ) -> PlanTaskResponse:
        return PlanTaskResponse(
            id=task.id,
            scheduled_date=task.scheduled_date,
            task_type=task.task_type.value,
            task_variant=task.task_variant.value,
            intent=self._resolve_task_intent(task),
            exam_checkpoint_type=self._resolve_task_exam_checkpoint_type(task),
            target_route=self._resolve_task_target_route(task),
            completion_source=getattr(task, "completion_source", None),
            linked_simulation_id=getattr(task, "linked_simulation_id", None),
            title=self._resolve_task_title(task),
            topic_id=task.topic_id,
            topic_name=task.topic.name if task.topic is not None else None,
            osce_station_slug=task.osce_station_slug,
            questions_count=task.questions_count,
            estimated_minutes=task.estimated_minutes,
            is_completed=task.is_completed,
            is_skipped=task.is_skipped,
            is_stale=bool(getattr(task, "is_stale", False)),
            missed_at=getattr(task, "missed_at", None),
            missed_reason=getattr(task, "missed_reason", None),
            planner_reason=self._build_task_reason(task, explanation_context),
        )

    def _to_plan_event_response(self, event: PlanEvent) -> PlanEventResponse:
        return PlanEventResponse(
            id=event.id,
            event_type=event.event_type,
            tone=event.tone,
            title=event.title,
            description=event.description,
            created_at=event.created_at,
        )

    def _calculate_days_until_accreditation(self, user: User) -> int | None:
        return self._calculate_days_until_accreditation_from_date(user.accreditation_date, today())

    def _calculate_days_until_accreditation_from_date(self, accreditation_date: date | None, start_date: date) -> int | None:
        if accreditation_date is None:
            return None

        return max((accreditation_date - start_date).days, 0)

    def _build_task_reason(
        self,
        task: PlanTask,
        explanation_context: TaskExplanationContext | None,
    ) -> str | None:
        if task.is_completed:
            if getattr(task, "completion_source", None) == COMPLETION_SOURCE_EQUIVALENT_FREE_PRACTICE:
                return (
                    "Задача закрыта эквивалентной свободной практикой: формат, тема или станция и объем совпали "
                    "с учебным маршрутом. Это влияет на план, но не засчитывает этап пробной аккредитации."
                )

            if getattr(task, "completion_source", None) == COMPLETION_SOURCE_EXAM_SIMULATION:
                return "Задача закрыта через пробную аккредитацию; протокол этапа оценивается отдельно по строгим правилам."

            return "Задача уже выполнена и ее результат учтен при пересчете следующих шагов."

        if getattr(task, "is_stale", False):
            return "План устарел после долгого отсутствия: эта задача сохранена как missed/stale, а маршрут пересобран с текущей даты."

        if task.is_skipped:
            return "Эта задача была пропущена, а фокус плана после нее уже пересчитан."

        if getattr(task, "intent", None) == "remediation":
            return "Задача добавлена после проваленного этапа пробной аккредитации: она закрывает конкретный разрыв из протокола, а не заменяет сам протокол."

        if self._is_weekly_checkpoint_task(task):
            return self._build_weekly_checkpoint_reason(task)

        if explanation_context is None:
            return None

        if task.task_type == PlanTaskType.EXAM_SIM:
            return self._build_exam_sim_reason(task, explanation_context)

        if task.task_type == PlanTaskType.OSCE:
            station = (
                explanation_context.osce_by_slug.get(task.osce_station_slug)
                if task.osce_station_slug is not None
                else None
            )
            return self._build_osce_task_reason(task, station, explanation_context)

        planned_topic = explanation_context.topic_by_id.get(task.topic_id) if task.topic_id is not None else None

        if task.task_type == PlanTaskType.CASE:
            return self._build_case_task_reason(task, planned_topic, explanation_context)

        if planned_topic is not None:
            return self._build_topic_test_reason(task, planned_topic, explanation_context)

        return self._build_mixed_test_reason(task, explanation_context)

    def _is_weekly_checkpoint_task(self, task: PlanTask) -> bool:
        return (
            self._resolve_task_intent(task) == "control"
            and bool(task.task_title)
            and task.task_title.startswith(WEEKLY_CHECKPOINT_TITLE_PREFIX)
        )

    def _build_weekly_checkpoint_reason(self, task: PlanTask) -> str:
        if task.task_type == PlanTaskType.EXAM_SIM:
            return (
                "Недельный контрольный блок по тестам: короткая проверка без подсказок, "
                "которая обновляет учебный маршрут, но не засчитывает этап протокола пробной аккредитации."
            )

        if task.task_type == PlanTaskType.CASE:
            return (
                "Недельный контрольный клинический кейс: он проверяет перенос знаний в практический формат "
                "и влияет на маршрут, но не закрывает кейсовый этап протокола."
            )

        if task.task_type == PlanTaskType.OSCE:
            return (
                "Недельный контроль ОСКЭ: отдельная проверка практической станции для пересчета маршрута, "
                "без зачета практического этапа протокола."
            )

        return (
            "Недельный контроль: короткая проверка устойчивости, которая помогает пересобрать маршрут "
            "без подмены строгого протокола пробной аккредитации."
        )

    def _build_exam_sim_reason(self, task: PlanTask, explanation_context: TaskExplanationContext) -> str:
        if self._is_final_rehearsal_exam_task(task):
            return (
                "Это отдельный режим финальной репетиции тестового этапа: полноценный прогон 80/60 внутри "
                "трехшаговой репетиции аккредитации."
            )

        if (
            explanation_context.final_phase_gate is not None
            and explanation_context.final_phase_gate.allow_exam_sim
            and self._is_task_in_final_approach_window(task, explanation_context)
        ):
            return (
                "Это калибровочный экзаменационный прогон 80/60 за 8-14 дней до аккредитации: "
                "он показывает, какой трек еще проседает перед последней неделей."
            )

        if (
            explanation_context.final_phase_gate is not None
            and explanation_context.final_phase_gate.allow_exam_sim
            and self._is_task_in_final_week(task, explanation_context)
        ):
            return (
                "Финальная неделя подготовки: это один из полноценных прогонов 80/60, который проверяет "
                "устойчивость перед аккредитацией и чередуется с кейсовыми и ОСКЭ-слотами."
            )

        if explanation_context.final_phase_gate is not None and explanation_context.final_phase_gate.allow_exam_sim:
            return (
                "План вошел в финальную фазу: минимальная готовность по тестам, кейсам и ОСКЭ уже набрана, "
                "поэтому сегодня стоит полноценный экзаменационный прогон 80/60. Он чередуется с кейсовыми "
                "и ОСКЭ-слотами, а не идет каждый день подряд."
            )

        return "Это общий экзаменационный прогон для проверки устойчивости перед аккредитацией."

    def _build_topic_test_reason(
        self,
        task: PlanTask,
        planned_topic: PlannedTopic,
        explanation_context: TaskExplanationContext,
    ) -> str:
        drivers = self._build_topic_reason_drivers(planned_topic)
        focus_prefix = self._build_focus_prefix(task, explanation_context)
        topic_name = planned_topic.topic.name

        if len(drivers) == 0:
            return f"{focus_prefix}Тема «{topic_name}» стоит в ближайшем фокусе плана для уверенного закрепления."

        return f"{focus_prefix}Фокус на теме «{topic_name}»: {'; '.join(drivers[:2])}."

    def _build_case_task_reason(
        self,
        task: PlanTask,
        planned_topic: PlannedTopic | None,
        explanation_context: TaskExplanationContext,
    ) -> str:
        focus_prefix = self._build_focus_prefix(task, explanation_context)

        if planned_topic is None:
            return (
                f"{focus_prefix}Кейс поставлен для переноса подготовки из тестового формата в клиническое решение "
                "по слабому блоку."
            )

        drivers = self._build_topic_reason_drivers(planned_topic)

        if planned_topic.case_attempts_count == 0:
            drivers.insert(0, "по этой теме еще не было клинической практики")

        if self._is_final_rehearsal_case_task(task):
            format_prefix = "Финальная репетиция кейсового этапа 12/30. "
        elif self._is_final_phase_case_task(task):
            format_prefix = "Экзаменационный кейс 12/30. "
        else:
            format_prefix = ""

        return (
            f"{focus_prefix}{format_prefix}Клинический кейс по теме «{planned_topic.topic.name}»: "
            f"{'; '.join(drivers[:2]) if drivers else 'тему нужно перевести в практический формат закрепления'}."
        )

    def _build_osce_task_reason(
        self,
        task: PlanTask,
        station: PlannedOsceStation | None,
        explanation_context: TaskExplanationContext,
    ) -> str:
        focus_prefix = self._build_focus_prefix(task, explanation_context)

        if station is None:
            return f"{focus_prefix}Станция поставлена для удержания практического блока подготовки."

        drivers: list[str] = []

        if station.status == "not_started":
            drivers.append("станция еще не была начата")
        elif station.best_score_percent is not None and station.best_score_percent < OSCE_REPEAT_THRESHOLD:
            drivers.append(f"лучший результат по станции пока только {int(round(station.best_score_percent))}%")
        elif station.status == "in_progress":
            drivers.append("станция еще не доведена до уверенного уровня")

        if station.recommended_repeats > 1:
            drivers.append("план оставил повтор станции для закрепления навыка")

        if self._is_final_rehearsal_osce_task(task):
            return (
                f"{focus_prefix}Финальная репетиция практического этапа: станция «{station.title}» вынесена "
                "в отдельный слот, чтобы пройти формат максимально близко к реальной аккредитации."
            )

        if len(drivers) == 0:
            return f"{focus_prefix}Практическая станция оставлена в маршруте для поддержания ОСКЭ-готовности."

        return f"{focus_prefix}Практическая станция «{station.title}»: {'; '.join(drivers[:2])}."

    def _build_mixed_test_reason(self, task: PlanTask, explanation_context: TaskExplanationContext) -> str:
        if self._is_recovery_review_task(task):
            return (
                "Это восстановительное повторение: система специально облегчила день, чтобы удержать ритм недели "
                "без перегруза и не уронить качество следующих тяжелых слотов."
            )

        if self._is_pre_accreditation_review_task(task):
            return (
                "Это легкое предэкзаменационное закрепление накануне аккредитации: без перегруза, "
                "чтобы удержать уверенность и широту покрытия тем."
            )

        if self._is_final_approach_review_task(task):
            return (
                "Это калибровочное смешанное повторение перед последней неделей: "
                "оно проверяет широту покрытия и не дает слишком рано сузить маршрут только до одного дефицита."
            )

        if self._is_final_week_broad_review_task(task):
            return (
                "Финальное смешанное повторение удерживает широкое покрытие тем в последней неделе "
                "и помогает не сузить подготовку только до одного слабого блока."
            )

        if explanation_context.final_phase_gate is not None and not explanation_context.final_phase_gate.allow_exam_sim:
            return (
                "Смешанный тест нужен, чтобы добрать общую тестовую устойчивость до полноценного "
                "экзаменационного режима."
            )

        if self._is_task_in_final_week(task, explanation_context):
            return "Смешанный тест поддерживает широкое покрытие тем в последней неделе перед аккредитацией."

        return "Смешанный тест не дает сузить подготовку только до одной темы и удерживает общую широту покрытия."

    def _resolve_task_days_until_accreditation(
        self,
        task: PlanTask,
        explanation_context: TaskExplanationContext,
    ) -> int | None:
        return self._calculate_days_until_accreditation_from_date(
            explanation_context.accreditation_date,
            task.scheduled_date,
        )

    def _is_task_in_final_week(
        self,
        task: PlanTask,
        explanation_context: TaskExplanationContext,
    ) -> bool:
        task_days_until_accreditation = self._resolve_task_days_until_accreditation(task, explanation_context)
        return task_days_until_accreditation is not None and task_days_until_accreditation <= FINAL_WEEK_WINDOW_DAYS

    def _is_task_in_final_approach_window(
        self,
        task: PlanTask,
        explanation_context: TaskExplanationContext,
    ) -> bool:
        task_days_until_accreditation = self._resolve_task_days_until_accreditation(task, explanation_context)
        return (
            task_days_until_accreditation is not None
            and FINAL_WEEK_WINDOW_DAYS < task_days_until_accreditation <= FINAL_APPROACH_WINDOW_DAYS
        )

    def _is_final_approach_review_task(self, task: PlanTask) -> bool:
        return task.task_type == PlanTaskType.TEST and task.task_title == "Калибровочное смешанное повторение"

    def _is_recovery_review_task(self, task: PlanTask) -> bool:
        return task.task_type == PlanTaskType.TEST and task.task_title == "Восстановительное повторение"

    def _is_final_week_broad_review_task(self, task: PlanTask) -> bool:
        return task.task_type == PlanTaskType.TEST and task.task_title == "Финальное смешанное повторение"

    def _is_pre_accreditation_review_task(self, task: PlanTask) -> bool:
        return task.task_type == PlanTaskType.TEST and task.task_title == "Предэкзаменационное закрепление"

    def _is_final_rehearsal_exam_task(self, task: PlanTask) -> bool:
        return task.task_type == PlanTaskType.EXAM_SIM and task.task_title == "Финальная репетиция: тестовый этап 80/60"

    def _is_final_rehearsal_case_task(self, task: PlanTask) -> bool:
        return (
            task.task_type == PlanTaskType.CASE
            and bool(task.task_title)
            and task.task_title.startswith("Финальная репетиция: кейсовый этап - ")
        )

    def _is_final_rehearsal_osce_task(self, task: PlanTask) -> bool:
        return (
            task.task_type == PlanTaskType.OSCE
            and bool(task.task_title)
            and task.task_title.startswith("Финальная репетиция: практический этап - ")
        )

    def _has_task_variant(self, task: PlanTask, variant: PlanTaskVariant) -> bool:
        return task.task_variant == variant

    def _is_final_approach_review_task(self, task: PlanTask) -> bool:
        return self._has_task_variant(task, PlanTaskVariant.FINAL_APPROACH_REVIEW)

    def _is_recovery_review_task(self, task: PlanTask) -> bool:
        return self._has_task_variant(task, PlanTaskVariant.RECOVERY_REVIEW)

    def _is_final_week_broad_review_task(self, task: PlanTask) -> bool:
        return self._has_task_variant(task, PlanTaskVariant.FINAL_WEEK_BROAD_REVIEW)

    def _is_pre_accreditation_review_task(self, task: PlanTask) -> bool:
        return self._has_task_variant(task, PlanTaskVariant.PRE_ACCREDITATION_REVIEW)

    def _is_final_rehearsal_exam_task(self, task: PlanTask) -> bool:
        return self._has_task_variant(task, PlanTaskVariant.FINAL_REHEARSAL_EXAM)

    def _is_final_rehearsal_case_task(self, task: PlanTask) -> bool:
        return self._has_task_variant(task, PlanTaskVariant.FINAL_REHEARSAL_CASE)

    def _is_final_rehearsal_osce_task(self, task: PlanTask) -> bool:
        return self._has_task_variant(task, PlanTaskVariant.FINAL_REHEARSAL_OSCE)

    def _build_topic_reason_drivers(self, planned_topic: PlannedTopic) -> list[str]:
        drivers: list[str] = []

        if planned_topic.status == "not_started":
            drivers.append("тема еще не была полноценно начата")
        elif planned_topic.status == "critical":
            drivers.append("тема остается критичной по точности")
        elif planned_topic.status == "fragile":
            drivers.append("тема пока нестабильна по результатам")
        elif planned_topic.status == "building":
            drivers.append("тема еще только набирает базу")
        elif planned_topic.status == "developing":
            drivers.append("тему нужно довести до уверенного уровня")

        if planned_topic.review_urgency == "overdue":
            drivers.append("после паузы тема уже ушла в просроченное повторение")
        elif planned_topic.review_urgency == "due":
            drivers.append("пришло время вернуть тему на повторение")
        elif planned_topic.review_urgency == "soon":
            drivers.append("тема подходит к окну ближайшего повторения")

        if planned_topic.repeated_question_struggles >= TOPIC_REPEATED_QUESTION_ALERT_COUNT:
            drivers.append("в ней накопились повторные ошибки")
        elif planned_topic.repeated_question_struggles > 0:
            drivers.append("в ней уже были повторяющиеся ошибки")

        if (
            planned_topic.hard_question_accuracy_percent is not None
            and planned_topic.hard_question_accuracy_percent < TOPIC_HARD_QUESTION_ALERT_PERCENT
        ):
            drivers.append(
                f"сложные вопросы по теме пока решаются только на "
                f"{int(round(planned_topic.hard_question_accuracy_percent))}%"
            )

        return drivers

    def _build_focus_prefix(
        self,
        task: PlanTask,
        explanation_context: TaskExplanationContext,
    ) -> str:
        if explanation_context.readiness_summary is None:
            return ""

        task_track_key = self._resolve_task_track_key(task)

        if task_track_key == explanation_context.readiness_summary.recommended_focus_key:
            return "Это текущий главный дефицит по готовности. "

        return ""

    def _resolve_task_track_key(self, task: PlanTask) -> str:
        if task.task_type in {PlanTaskType.TEST, PlanTaskType.EXAM_SIM}:
            return "tests"

        if task.task_type == PlanTaskType.CASE:
            return "cases"

        return "osce"

    async def _record_activity(
        self,
        user: User,
        questions_answered: int,
        correct_answers: int,
        study_minutes: int,
        study_seconds: int | None = None,
    ) -> None:
        stat_date = today()
        recorded_seconds = max(int(study_seconds if study_seconds is not None else study_minutes * 60), 0)
        await self.daily_stat_repository.add_or_accumulate(
            user_id=user.id,
            stat_date=stat_date,
            questions_answered=questions_answered,
            correct_answers=correct_answers,
            study_minutes=study_minutes,
            study_seconds=recorded_seconds,
        )

        previous_activity_date = user.last_activity_date
        user.last_activity_date = stat_date

        if previous_activity_date == stat_date:
            user.streak_days = max(user.streak_days, 1)
        elif previous_activity_date == stat_date - timedelta(days=1):
            user.streak_days += 1
        else:
            user.streak_days = 1

    async def _build_today_budget(self, user: User, server_today: date) -> dict[str, int]:
        daily_study_seconds = max(int(user.daily_study_minutes or DEFAULT_DAILY_STUDY_MINUTES), 0) * 60
        stat = await self.daily_stat_repository.get_by_user_and_date(user.id, server_today)
        today_study_seconds = 0

        if stat is not None:
            today_study_seconds = int(getattr(stat, "study_seconds", 0) or stat.study_minutes * 60)

        return {
            "daily_study_seconds": daily_study_seconds,
            "today_study_seconds": today_study_seconds,
            "remaining_study_seconds": max(daily_study_seconds - today_study_seconds, 0),
        }

    async def _append_today_follow_up_if_time_remains(self, user: User) -> None:
        server_today = today()

        if not is_study_weekday(server_today, user.study_weekdays):
            return

        budget = await self._build_today_budget(user, server_today)

        if budget["remaining_study_seconds"] < SUPPLEMENTAL_TEST_MINUTES * 60:
            return

        plan = await self.study_plan_repository.get_by_user_id(user.id)
        if plan is None:
            return

        today_tasks = await self.study_plan_repository.list_tasks_in_range(plan.id, server_today, server_today)
        active_today_tasks = [task for task in today_tasks if not task.is_completed and not task.is_skipped]

        if active_today_tasks or len(today_tasks) >= 6:
            return

        load_profile = self._build_user_study_load_profile(user)
        remaining_minutes = budget["remaining_study_seconds"] // 60

        if remaining_minutes >= load_profile.focused_test_minutes:
            questions_count = load_profile.focused_test_question_count
            estimated_minutes = load_profile.focused_test_minutes
        else:
            questions_count = min(load_profile.focused_test_question_count, SUPPLEMENTAL_TEST_QUESTION_COUNT)
            estimated_minutes = SUPPLEMENTAL_TEST_MINUTES

        topics = await self._list_prioritized_topics(user)
        used_topic_ids = {task.topic_id for task in today_tasks if task.topic_id is not None}
        topic = next((item for item in topics if item.topic.id not in used_topic_ids), None)

        if topic is None and topics:
            topic = topics[0]

        task = self._build_test_task(
            plan.id,
            server_today,
            topic.topic.id if topic is not None else None,
            questions_count,
            estimated_minutes,
        )
        task.task_title = "Дополнительный блок на сегодня"
        self.session.add(task)

    async def _acquire_user_transaction_lock(self, user_id: int) -> None:
        await self.session.execute(select(func.pg_advisory_xact_lock(user_id)))

    async def _replace_plan_from_date(
        self,
        user: User,
        start_date: date,
        deferred_task_signature: DeferredTaskSignature | None = None,
    ) -> None:
        if user.faculty_id is None or user.accreditation_date is None:
            raise BadRequestError("Сначала нужно завершить настройку профиля перед формированием плана")

        days_until_accreditation = self._calculate_days_until_accreditation_from_date(
            user.accreditation_date,
            start_date,
        )
        prioritized_topics = await self._list_prioritized_topics(user)
        osce_stations = await self._list_prioritized_osce_stations(user)
        readiness_summary = await self._build_readiness_summary(user, prioritized_topics, osce_stations)
        protocol_context = await self._build_protocol_confirmation_context(user)
        load_profile = self._build_user_study_load_profile(user)
        plan = await self._get_or_create_plan(user.id)

        await self.study_plan_repository.delete_tasks_from_date(plan.id, start_date)
        plan.last_recalculated_at = utc_now()

        if days_until_accreditation > 0 and (prioritized_topics or osce_stations):
            tasks = self._build_tasks(
                plan.id,
                prioritized_topics,
                osce_stations,
                readiness_summary,
                load_profile,
                start_date,
                days_until_accreditation,
                deferred_task_signature=deferred_task_signature,
                protocol_context=protocol_context,
            )
            self.session.add_all(tasks)

    async def _get_or_create_plan(self, user_id: int) -> StudyPlan:
        plan = await self.study_plan_repository.get_by_user_id(user_id)

        if plan is None:
            plan = StudyPlan(user_id=user_id)
            self.study_plan_repository.add(plan)
            await self.session.flush()

        return plan

    async def _apply_catch_up_mode_if_needed(self, user: User, server_today: date) -> bool:
        if user.faculty_id is None or user.accreditation_date is None:
            return False

        overdue_tasks = await self.study_plan_repository.list_active_tasks_before(user.id, server_today)
        if not self._should_apply_catch_up_mode(overdue_tasks, server_today, user.accreditation_date):
            return False

        await self._acquire_user_transaction_lock(user.id)
        overdue_tasks = await self.study_plan_repository.list_active_tasks_before(user.id, server_today)
        if not self._should_apply_catch_up_mode(overdue_tasks, server_today, user.accreditation_date):
            return False

        overdue_tasks = sorted(overdue_tasks, key=lambda task: task.scheduled_date)
        oldest_date = overdue_tasks[0].scheduled_date
        latest_date = overdue_tasks[-1].scheduled_date

        for task in overdue_tasks:
            self.study_plan_repository.mark_task_stale_missed(task, reason=CATCH_UP_MISSED_REASON)

        await self._replace_plan_from_date(user, server_today)
        await self._record_catch_up_event(
            user=user,
            missed_count=len(overdue_tasks),
            oldest_date=oldest_date,
            latest_date=latest_date,
            rebuild_start_date=server_today,
        )
        await self.session.commit()
        return True

    def _should_apply_catch_up_mode(
        self,
        overdue_tasks: list[PlanTask],
        server_today: date,
        accreditation_date: date | None,
    ) -> bool:
        if not overdue_tasks:
            return False

        return (
            self._calculate_plan_drift_score(overdue_tasks, server_today, accreditation_date)
            >= CATCH_UP_DRIFT_SCORE_THRESHOLD
        )

    def _calculate_plan_drift_score(
        self,
        overdue_tasks: list[PlanTask],
        server_today: date,
        accreditation_date: date | None,
    ) -> float:
        if not overdue_tasks:
            return 0.0

        sorted_tasks = sorted(overdue_tasks, key=lambda task: task.scheduled_date)
        oldest_overdue_days = max((server_today - sorted_tasks[0].scheduled_date).days, 0)
        latest_overdue_days = max((server_today - sorted_tasks[-1].scheduled_date).days, 0)
        overdue_count = len(sorted_tasks)
        overdue_span_days = max(oldest_overdue_days - latest_overdue_days + 1, 1)

        stale_pressure = oldest_overdue_days / CATCH_UP_STALE_AFTER_DAYS
        count_pressure = min(overdue_count, 5) * 0.12
        span_pressure = min(overdue_span_days, 14) * 0.03

        deadline_pressure = 0.0
        if accreditation_date is not None:
            days_until_accreditation = max((accreditation_date - server_today).days, 0)
            extra_overdue_tasks = max(overdue_count - 1, 0)

            if days_until_accreditation <= 7:
                deadline_pressure = oldest_overdue_days * 0.35 + extra_overdue_tasks * 0.18
            elif days_until_accreditation <= 14:
                deadline_pressure = oldest_overdue_days * 0.22 + extra_overdue_tasks * 0.12
            elif days_until_accreditation <= 30:
                deadline_pressure = oldest_overdue_days * 0.12 + extra_overdue_tasks * 0.08

        return stale_pressure + count_pressure + span_pressure + deadline_pressure

    async def _apply_non_study_today_rebuild_if_needed(self, user: User, server_today: date) -> bool:
        if user.faculty_id is None or user.accreditation_date is None:
            return False

        if is_study_weekday(server_today, user.study_weekdays):
            return False

        plan = await self.study_plan_repository.get_by_user_id(user.id)
        if plan is None:
            return False

        today_tasks = await self.study_plan_repository.list_tasks_in_range(plan.id, server_today, server_today)
        has_active_today_task = any(not task.is_completed and not task.is_skipped for task in today_tasks)
        if not has_active_today_task:
            return False

        await self._acquire_user_transaction_lock(user.id)
        plan = await self.study_plan_repository.get_by_user_id(user.id)
        if plan is None:
            return False

        today_tasks = await self.study_plan_repository.list_tasks_in_range(plan.id, server_today, server_today)
        has_active_today_task = any(not task.is_completed and not task.is_skipped for task in today_tasks)
        if not has_active_today_task:
            return False

        await self._replace_plan_from_date(user, server_today)
        await self.session.commit()
        return True

    async def _build_protocol_confirmation_context(self, user: User) -> ProtocolConfirmationContext:
        simulation = await self.exam_simulation_repository.get_latest_by_user(user.id)

        if simulation is None:
            return self._empty_protocol_confirmation_context()

        passed_stage_keys = frozenset(
            stage.stage_key
            for stage in simulation.stages
            if stage.stage_key in PROTOCOL_STAGE_KEY_SET and stage.status == "passed"
        )
        failed_stage_keys = frozenset(
            stage.stage_key
            for stage in simulation.stages
            if stage.stage_key in PROTOCOL_STAGE_KEY_SET and stage.status == "failed"
        )

        return ProtocolConfirmationContext(
            passed_stage_keys=passed_stage_keys,
            failed_stage_keys=failed_stage_keys,
            active_simulation_id=simulation.id,
            latest_simulation_status=simulation.status,
            all_stages_passed=PROTOCOL_STAGE_KEY_SET.issubset(passed_stage_keys),
        )

    @staticmethod
    def _empty_protocol_confirmation_context() -> ProtocolConfirmationContext:
        return ProtocolConfirmationContext(
            passed_stage_keys=frozenset(),
            failed_stage_keys=frozenset(),
            active_simulation_id=None,
            latest_simulation_status=None,
            all_stages_passed=False,
        )

    async def _build_readiness_summary(
        self,
        user: User,
        prioritized_topics: list[PlannedTopic],
        osce_stations: list[PlannedOsceStation],
    ) -> ReadinessSummarySnapshot:
        exam_metrics = await self.analytics_repository.get_test_readiness_metrics(user.id)
        case_attempts = await self.clinical_case_attempt_repository.list_by_user(user.id)
        osce_attempts = await self.osce_attempt_repository.list_by_user(user.id)
        topic_count = len(prioritized_topics)
        covered_topics_count = 0
        stable_topics_count = 0
        critical_topics_count = 0
        fragile_topics_count = 0
        due_topics_count = 0
        overdue_topics_count = 0
        total_topic_accuracy = 0.0

        for topic in prioritized_topics:
            total_topic_accuracy += topic.accuracy_percent

            if topic.answered_questions > 0:
                covered_topics_count += 1

            if self._counts_as_stable_topic(topic):
                stable_topics_count += 1

            if topic.status == "critical":
                critical_topics_count += 1
            elif topic.status == "fragile":
                fragile_topics_count += 1

            if topic.review_urgency == "due":
                due_topics_count += 1
            elif topic.review_urgency == "overdue":
                overdue_topics_count += 1

        average_topic_accuracy = total_topic_accuracy / topic_count if topic_count > 0 else 0.0
        qualifying_case_attempts_count = 0
        recent_case_attempts_count = 0
        weak_case_attempts_count = 0
        total_case_accuracy = 0.0
        recent_case_accuracy_total = 0.0
        best_case_accuracy: float | None = None
        last_case_attempt_at: datetime | None = None
        case_topics: set[int] = set()

        for attempt in case_attempts:
            accuracy = float(attempt.accuracy_percent)
            qualifying_case_attempts_count += 1
            total_case_accuracy += accuracy

            if last_case_attempt_at is None:
                last_case_attempt_at = attempt.submitted_at

            if attempt.topic_id is not None:
                case_topics.add(attempt.topic_id)

            if accuracy < 70.0:
                weak_case_attempts_count += 1

            if best_case_accuracy is None or accuracy > best_case_accuracy:
                best_case_accuracy = accuracy

            if self._is_recent_activity(attempt.submitted_at):
                recent_case_attempts_count += 1
                recent_case_accuracy_total += accuracy

        case_topics_count = len(case_topics)
        average_case_accuracy = (
            total_case_accuracy / qualifying_case_attempts_count
            if qualifying_case_attempts_count > 0
            else None
        )
        recent_case_accuracy = (
            recent_case_accuracy_total / recent_case_attempts_count
            if recent_case_attempts_count > 0
            else None
        )
        started_stations_count = 0
        mastered_stations_count = 0
        total_best_osce_score = 0.0

        for station in osce_stations:
            total_best_osce_score += station.best_score_percent or 0.0

            if station.attempts_count > 0:
                started_stations_count += 1

            if station.status == "mastered":
                mastered_stations_count += 1

        average_best_osce_score = (
            total_best_osce_score / len(osce_stations)
            if len(osce_stations) > 0
            else None
        )
        recent_osce_attempts_count = 0
        recent_osce_score_total = 0.0

        for attempt in osce_attempts:
            if self._is_recent_activity(attempt.submitted_at):
                recent_osce_attempts_count += 1
                recent_osce_score_total += float(attempt.total_score_percent)

        average_recent_osce_score = (
            recent_osce_score_total / recent_osce_attempts_count
            if recent_osce_attempts_count > 0
            else None
        )

        return build_readiness_summary(
            build_test_readiness(
                topic_count=topic_count,
                covered_topics_count=covered_topics_count,
                stable_topics_count=stable_topics_count,
                average_topic_accuracy=round(average_topic_accuracy, 2),
                exam_attempts_count=exam_metrics.exam_attempts_count,
                average_exam_score=exam_metrics.average_exam_score,
                best_exam_score=exam_metrics.best_exam_score,
                overdue_topics_count=overdue_topics_count,
                due_topics_count=due_topics_count,
                critical_topics_count=critical_topics_count,
                fragile_topics_count=fragile_topics_count,
                last_exam_finished_at=exam_metrics.last_exam_finished_at,
            ),
            build_case_readiness(
                topic_count=topic_count,
                case_topics_count=case_topics_count,
                case_attempts_count=qualifying_case_attempts_count,
                average_case_accuracy=round(average_case_accuracy, 2) if average_case_accuracy is not None else None,
                best_case_accuracy=round(best_case_accuracy, 2) if best_case_accuracy is not None else None,
                recent_case_accuracy=round(recent_case_accuracy, 2) if recent_case_accuracy is not None else None,
                recent_case_attempts_count=recent_case_attempts_count,
                weak_case_attempts_count=weak_case_attempts_count,
                last_case_attempt_at=last_case_attempt_at,
            ),
            build_osce_readiness(
                station_count=len(osce_stations),
                started_stations_count=started_stations_count,
                mastered_stations_count=mastered_stations_count,
                average_best_score=round(average_best_osce_score, 2) if average_best_osce_score is not None else None,
                total_attempts_count=len(osce_attempts),
                recent_attempts_count=recent_osce_attempts_count,
                average_recent_score=round(average_recent_osce_score, 2)
                if average_recent_osce_score is not None
                else None,
                last_osce_attempt_at=osce_attempts[0].submitted_at if len(osce_attempts) > 0 else None,
            ),
        )

    async def _list_prioritized_topics(self, user: User) -> list[PlannedTopic]:
        if user.faculty_id is None:
            return []

        topics = await self.topic_repository.list_by_faculty(user.faculty_id)
        topic_metrics = await self.analytics_repository.list_topic_metrics(user.id, user.faculty_id)
        metrics_by_topic = {item.topic_id: item for item in topic_metrics}
        items = []

        for topic in topics:
            metrics = metrics_by_topic.get(topic.id)
            answered_questions = int(metrics.answered_questions) if metrics is not None else 0
            correct_answers = int(metrics.correct_answers) if metrics is not None else 0
            accuracy_percent = round((correct_answers / answered_questions) * 100, 2) if answered_questions else 0.0
            repeated_question_struggles = int(metrics.repeated_question_struggles) if metrics is not None else 0
            last_activity_at = self._latest_datetime(
                metrics.last_test_activity_at if metrics is not None else None,
                metrics.last_case_activity_at if metrics is not None else None,
            )
            last_struggle_at = self._latest_datetime(
                metrics.last_test_incorrect_at if metrics is not None else None,
                metrics.last_case_low_score_at if metrics is not None else None,
            )
            hard_question_accuracy_percent = self._calculate_optional_accuracy_percent(
                int(metrics.hard_question_correct_answers) if metrics is not None else 0,
                int(metrics.hard_question_attempts) if metrics is not None else 0,
            )
            status = self._resolve_topic_status(
                answered_questions,
                accuracy_percent,
                repeated_question_struggles,
                hard_question_accuracy_percent,
            )
            review_interval_days = self._resolve_topic_review_interval_days(
                status,
                answered_questions,
                accuracy_percent,
            )
            review_overdue_days = self._calculate_review_overdue_days(last_activity_at, review_interval_days)
            review_urgency = self._resolve_topic_review_urgency(
                last_activity_at,
                review_interval_days,
                review_overdue_days,
            )
            items.append(
                PlannedTopic(
                    topic=topic,
                    answered_questions=answered_questions,
                    correct_answers=correct_answers,
                    accuracy_percent=accuracy_percent,
                    status=status,
                    recommended_repeats=self._calculate_topic_recommended_repeats(
                        status,
                        answered_questions,
                        repeated_question_struggles,
                        hard_question_accuracy_percent,
                        review_urgency,
                    ),
                    case_attempts_count=metrics.case_attempts_count if metrics is not None else 0,
                    repeated_question_struggles=repeated_question_struggles,
                    hard_question_accuracy_percent=hard_question_accuracy_percent,
                    last_activity_at=last_activity_at,
                    last_struggle_at=last_struggle_at,
                    review_interval_days=review_interval_days,
                    review_urgency=review_urgency,
                    review_overdue_days=review_overdue_days,
                )
            )

        return sorted(
            items,
            key=lambda topic: (
                self._topic_priority_order(topic.status, topic.review_urgency),
                self._topic_repeated_struggle_order(topic.repeated_question_struggles),
                self._topic_recent_struggle_order(topic.last_struggle_at),
                self._topic_review_urgency_order(topic.review_urgency),
                -topic.review_overdue_days,
                topic.hard_question_accuracy_percent if topic.hard_question_accuracy_percent is not None else 101.0,
                topic.accuracy_percent if topic.answered_questions else 0.0,
                topic.answered_questions,
                topic.topic.section.order_index,
                topic.topic.order_index,
                topic.topic.name.lower(),
            ),
        )

    async def _list_prioritized_osce_stations(self, user: User) -> list[PlannedOsceStation]:
        faculty_code = await self._resolve_faculty_code(user)
        stations = [
            station
            for station in await self.osce_station_repository.list_station_records()
            if self._is_accessible_for_faculty(station.faculty_codes, faculty_code)
        ]

        if len(stations) == 0:
            return []

        attempts = await self.osce_attempt_repository.list_by_user(user.id)
        attempts_by_station: dict[str, list[OsceAttempt]] = {}

        for attempt in attempts:
            attempts_by_station.setdefault(attempt.station_slug, []).append(attempt)

        items = []

        for station in stations:
            station_attempts = attempts_by_station.get(station.slug, [])
            best_score_percent = self._get_best_score_percent(station_attempts)
            status = self._resolve_osce_status(station_attempts)
            items.append(
                PlannedOsceStation(
                slug=station.slug,
                title=station.title,
                duration_minutes=station.duration_minutes,
                workload_units=len(station.checklist_items or []) + len(station.quiz_questions or []),
                best_score_percent=best_score_percent,
                attempts_count=len(station_attempts),
                status=status,
                recommended_repeats=self._calculate_osce_recommended_repeats(
                    status,
                    best_score_percent,
                ),
            )
            )

        return sorted(
            items,
            key=lambda item: (
                self._osce_priority_order(item.status),
                item.best_score_percent if item.best_score_percent is not None else 100.0,
                -item.attempts_count,
                item.title.lower(),
            ),
        )

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

    def _build_planner_task_mix(
        self,
        readiness_summary: ReadinessSummarySnapshot,
        load_profile: UserStudyLoadProfile,
    ) -> PlannerTaskMix:
        track_by_key = {track.key: track for track in readiness_summary.tracks}
        test_track = track_by_key.get("tests")
        case_track = track_by_key.get("cases")
        osce_track = track_by_key.get("osce")
        test_readiness = test_track.readiness_percent if test_track is not None else 0.0
        case_readiness = case_track.readiness_percent if case_track is not None else 0.0
        osce_readiness = osce_track.readiness_percent if osce_track is not None else 0.0
        test_freshness = test_track.freshness_percent if test_track is not None else 0.0
        case_momentum = case_track.momentum_percent if case_track is not None else 0.0
        osce_momentum = osce_track.momentum_percent if osce_track is not None else 0.0
        intensive_ratio = self._clamp_ratio(
            INTENSIVE_RATIO
            + max(0.0, 70.0 - test_readiness) / 230.0
            + max(0.0, 65.0 - test_freshness) / 800.0
            + load_profile.intensive_ratio_shift,
            INTENSIVE_RATIO_MIN,
            INTENSIVE_RATIO_MAX,
        )
        reinforcement_ratio = self._clamp_ratio(
            REINFORCEMENT_RATIO
            + max(0.0, 66.0 - test_readiness) / 320.0
            + max(0.0, 58.0 - test_freshness) / 900.0
            - max(0.0, test_readiness - 84.0) / 650.0,
            REINFORCEMENT_RATIO_MIN,
            REINFORCEMENT_RATIO_MAX,
        )
        reinforcement_ratio = self._clamp_ratio(
            reinforcement_ratio + load_profile.reinforcement_ratio_shift,
            REINFORCEMENT_RATIO_MIN,
            REINFORCEMENT_RATIO_MAX,
        )
        case_share = self._clamp_ratio(
            CASE_TASK_SHARE
            + max(0.0, 72.0 - case_readiness) / 230.0
            + max(0.0, 52.0 - case_momentum) / 850.0
            + load_profile.case_share_shift,
            CASE_TASK_SHARE_MIN,
            CASE_TASK_SHARE_MAX,
        )
        osce_share = self._clamp_ratio(
            OSCE_TASK_SHARE
            + max(0.0, 72.0 - osce_readiness) / 210.0
            + max(0.0, 52.0 - osce_momentum) / 750.0
            + load_profile.osce_share_shift,
            OSCE_TASK_SHARE_MIN,
            OSCE_TASK_SHARE_MAX,
        )
        non_test_task_share = case_share + osce_share

        if non_test_task_share > NON_TEST_TASK_SHARE_LIMIT:
            scale = NON_TEST_TASK_SHARE_LIMIT / non_test_task_share
            case_share = round(case_share * scale, 4)
            osce_share = round(osce_share * scale, 4)

        reinforcement_ratio = max(reinforcement_ratio, intensive_ratio + 0.15)
        reinforcement_ratio = min(reinforcement_ratio, REINFORCEMENT_RATIO_MAX)

        return PlannerTaskMix(
            intensive_ratio=round(intensive_ratio, 4),
            reinforcement_ratio=round(reinforcement_ratio, 4),
            case_share=round(case_share, 4),
            osce_share=round(osce_share, 4),
        )

    def _build_user_study_load_profile(self, user: User) -> UserStudyLoadProfile:
        daily_minutes = self._clamp_int(
            user.daily_study_minutes or DEFAULT_DAILY_STUDY_MINUTES,
            MIN_DAILY_STUDY_MINUTES,
            MAX_DAILY_STUDY_MINUTES,
        )
        intensity = user.study_intensity or StudyIntensity.STEADY
        study_weekdays = tuple(normalize_study_weekdays(user.study_weekdays))

        if intensity == StudyIntensity.GENTLE:
            task_budget_ratio = GENTLE_TASK_BUDGET_RATIO
            intensive_ratio_shift = 0.03
            reinforcement_ratio_shift = 0.015
            case_share_shift = -0.015
            osce_share_shift = -0.01
        elif intensity == StudyIntensity.INTENSIVE:
            task_budget_ratio = INTENSIVE_TASK_BUDGET_RATIO
            intensive_ratio_shift = -0.035
            reinforcement_ratio_shift = -0.015
            case_share_shift = 0.025
            osce_share_shift = 0.02
        else:
            task_budget_ratio = STEADY_TASK_BUDGET_RATIO
            intensive_ratio_shift = 0.0
            reinforcement_ratio_shift = 0.0
            case_share_shift = 0.0
            osce_share_shift = 0.0

        task_budget_minutes = self._clamp_int(round(daily_minutes * task_budget_ratio), 18, CASE_TASK_MINUTES_MAX)
        focused_minutes = self._clamp_int(
            round(task_budget_minutes * 0.58),
            FOCUSED_TASK_MINUTES_MIN,
            FOCUSED_TASK_MINUTES_MAX,
        )
        mixed_minutes = self._clamp_int(
            round(task_budget_minutes * 0.82),
            MIXED_TASK_MINUTES_MIN,
            MIXED_TASK_MINUTES_MAX,
        )
        case_minutes = self._clamp_int(
            max(round(task_budget_minutes * 1.02), CASE_TASK_MINUTES_MIN),
            CASE_TASK_MINUTES_MIN,
            CASE_TASK_MINUTES_MAX,
        )
        focused_questions = self._clamp_int(
            round(focused_minutes / 2),
            FOCUSED_TASK_QUESTIONS_MIN,
            FOCUSED_TASK_QUESTIONS_MAX,
        )
        mixed_questions = self._clamp_int(
            round(mixed_minutes / 1.8),
            MIXED_TASK_QUESTIONS_MIN,
            MIXED_TASK_QUESTIONS_MAX,
        )

        return UserStudyLoadProfile(
            daily_minutes=daily_minutes,
            intensity=intensity,
            study_weekdays=study_weekdays,
            focused_test_question_count=focused_questions,
            focused_test_minutes=focused_minutes,
            mixed_test_question_count=mixed_questions,
            mixed_test_minutes=mixed_minutes,
            case_task_minutes=case_minutes,
            intensive_ratio_shift=intensive_ratio_shift,
            reinforcement_ratio_shift=reinforcement_ratio_shift,
            case_share_shift=case_share_shift,
            osce_share_shift=osce_share_shift,
        )

    def _build_study_day_offsets(
        self,
        start_date: date,
        days_until_accreditation: int,
        load_profile: UserStudyLoadProfile,
    ) -> list[int]:
        return build_study_day_offsets(
            start_date=start_date,
            calendar_days_until_target=days_until_accreditation,
            value=load_profile.study_weekdays,
        )

    def _apply_weekly_checkpoint_rhythm(
        self,
        tasks: list[PlanTask],
        *,
        plan_id: int,
        readiness_summary: ReadinessSummarySnapshot,
        load_profile: UserStudyLoadProfile,
        case_sequence: list[PlannedTopic],
        osce_sequence: list[PlannedOsceStation],
        start_date: date,
        days_until_accreditation: int,
        protocol_context: ProtocolConfirmationContext | None,
    ) -> None:
        if len(tasks) <= WEEKLY_CHECKPOINT_FIRST_STUDY_DAY_INDEX:
            return

        checkpoint_count = 0

        for study_day_index, task in enumerate(sorted(tasks, key=lambda item: item.scheduled_date)):
            if study_day_index < WEEKLY_CHECKPOINT_FIRST_STUDY_DAY_INDEX:
                continue

            if (
                study_day_index - WEEKLY_CHECKPOINT_FIRST_STUDY_DAY_INDEX
            ) % WEEKLY_CHECKPOINT_INTERVAL_STUDY_DAYS != 0:
                continue

            remaining_calendar_days = days_until_accreditation - max((task.scheduled_date - start_date).days, 0)

            if remaining_calendar_days <= FINAL_APPROACH_WINDOW_DAYS:
                continue

            if not self._can_replace_with_weekly_checkpoint(task):
                continue

            checkpoint = self._build_weekly_checkpoint_task(
                plan_id=plan_id,
                scheduled_date=task.scheduled_date,
                checkpoint_index=checkpoint_count,
                readiness_summary=readiness_summary,
                load_profile=load_profile,
                case_sequence=case_sequence,
                osce_sequence=osce_sequence,
                protocol_context=protocol_context,
            )

            if checkpoint is None:
                continue

            tasks[tasks.index(task)] = checkpoint
            checkpoint_count += 1

    def _can_replace_with_weekly_checkpoint(self, task: PlanTask) -> bool:
        return (
            task.task_variant == PlanTaskVariant.STANDARD
            and self._resolve_task_intent(task) == "training"
        )

    def _build_weekly_checkpoint_task(
        self,
        *,
        plan_id: int,
        scheduled_date: date,
        checkpoint_index: int,
        readiness_summary: ReadinessSummarySnapshot,
        load_profile: UserStudyLoadProfile,
        case_sequence: list[PlannedTopic],
        osce_sequence: list[PlannedOsceStation],
        protocol_context: ProtocolConfirmationContext | None,
    ) -> PlanTask | None:
        track_keys = self._build_weekly_checkpoint_track_order(
            readiness_summary=readiness_summary,
            case_sequence=case_sequence,
            osce_sequence=osce_sequence,
            protocol_context=protocol_context,
        )

        if not track_keys:
            return None

        track_key = track_keys[checkpoint_index % len(track_keys)]

        if track_key == "cases" and case_sequence:
            topic = case_sequence[checkpoint_index % len(case_sequence)]
            task = self._build_case_task(plan_id, scheduled_date, topic, load_profile)
            task.intent = "control"
            task.task_title = self._truncate_task_title(f"{WEEKLY_CHECKPOINT_TITLE_PREFIX}: клинический кейс - {topic.topic.name}")
            task.target_route = "cases"
            return task

        if track_key == "osce" and osce_sequence:
            station = osce_sequence[checkpoint_index % len(osce_sequence)]
            task = self._build_osce_task(plan_id, scheduled_date, station)
            task.intent = "control"
            task.task_title = self._truncate_task_title(f"{WEEKLY_CHECKPOINT_TITLE_PREFIX}: ОСКЭ - {station.title}")
            task.target_route = "osce"
            return task

        return PlanTask(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            task_type=PlanTaskType.EXAM_SIM,
            task_variant=PlanTaskVariant.STANDARD,
            topic_id=None,
            task_title=f"{WEEKLY_CHECKPOINT_TITLE_PREFIX}: тестовый блок",
            questions_count=load_profile.mixed_test_question_count,
            estimated_minutes=load_profile.mixed_test_minutes,
            intent="control",
            exam_checkpoint_type=None,
            target_route="learning_center",
        )

    def _build_weekly_checkpoint_track_order(
        self,
        *,
        readiness_summary: ReadinessSummarySnapshot,
        case_sequence: list[PlannedTopic],
        osce_sequence: list[PlannedOsceStation],
        protocol_context: ProtocolConfirmationContext | None,
    ) -> list[str]:
        available_track_keys: list[str] = []

        if not self._is_protocol_stage_confirmed(protocol_context, "tests"):
            available_track_keys.append("tests")

        if case_sequence and not self._is_protocol_stage_confirmed(protocol_context, "cases"):
            available_track_keys.append("cases")

        if osce_sequence and not self._is_protocol_stage_confirmed(protocol_context, "osce"):
            available_track_keys.append("osce")

        if not available_track_keys:
            return []

        track_by_key = {track.key: track for track in readiness_summary.tracks}
        preferred_key = readiness_summary.recommended_focus_key

        return sorted(
            available_track_keys,
            key=lambda key: (
                0 if key == preferred_key else 1,
                -track_by_key[key].deficit_percent if key in track_by_key else 0.0,
                PROTOCOL_STAGE_KEYS.index(key) if key in PROTOCOL_STAGE_KEY_SET else len(PROTOCOL_STAGE_KEYS),
            ),
        )

    def _fill_daily_study_budgets(
        self,
        tasks: list[PlanTask],
        *,
        plan_id: int,
        topics: list[PlannedTopic],
        load_profile: UserStudyLoadProfile,
        start_date: date,
        days_until_accreditation: int,
    ) -> None:
        if not tasks or load_profile.daily_minutes < SUPPLEMENTAL_TEST_MINUTES:
            return

        topic_sequence = self._build_topic_focus_sequence(topics, max(len(tasks) * 2, 1))
        topic_index = 0
        dates = sorted({task.scheduled_date for task in tasks})

        for scheduled_date in dates:
            remaining_calendar_days = days_until_accreditation - max((scheduled_date - start_date).days, 0)

            if remaining_calendar_days <= FINAL_APPROACH_WINDOW_DAYS:
                continue

            day_tasks = [task for task in tasks if task.scheduled_date == scheduled_date]

            if any(
                task.task_type == PlanTaskType.EXAM_SIM
                or self._resolve_task_intent(task) in {"control", "exam_checkpoint"}
                or task.task_variant != PlanTaskVariant.STANDARD
                for task in day_tasks
            ):
                continue

            planned_minutes = sum(task.estimated_minutes for task in day_tasks)
            max_tasks = self._max_tasks_for_daily_budget(load_profile.daily_minutes)

            while len(day_tasks) < max_tasks:
                remaining_minutes = load_profile.daily_minutes - planned_minutes

                if remaining_minutes < SUPPLEMENTAL_TEST_MINUTES:
                    break

                minimum_fill_minutes = round(load_profile.daily_minutes * DAILY_BUDGET_MINIMUM_FILL_RATIO)
                should_add_full_focus = remaining_minutes >= load_profile.focused_test_minutes
                should_add_mini = planned_minutes < minimum_fill_minutes

                if should_add_full_focus:
                    questions_count = load_profile.focused_test_question_count
                    estimated_minutes = load_profile.focused_test_minutes
                elif should_add_mini:
                    questions_count = min(load_profile.focused_test_question_count, SUPPLEMENTAL_TEST_QUESTION_COUNT)
                    estimated_minutes = SUPPLEMENTAL_TEST_MINUTES
                else:
                    break

                topic_id = (
                    topic_sequence[topic_index % len(topic_sequence)].topic.id
                    if topic_sequence
                    else None
                )
                topic_index += 1
                task = self._build_test_task(
                    plan_id,
                    scheduled_date,
                    topic_id,
                    questions_count,
                    estimated_minutes,
                )
                tasks.append(task)
                day_tasks.append(task)
                planned_minutes += estimated_minutes

    def _max_tasks_for_daily_budget(self, daily_minutes: int) -> int:
        if daily_minutes >= 100:
            return 4

        if daily_minutes >= 60:
            return 3

        if daily_minutes >= 30:
            return 2

        return 1

    def _resolve_case_start_index(
        self,
        study_day_count: int,
        intensive_limit: int,
        readiness_summary: ReadinessSummarySnapshot,
    ) -> int:
        if study_day_count <= 0:
            return 0

        track_by_key = {track.key: track for track in readiness_summary.tracks}
        case_track = track_by_key.get("cases")
        case_readiness = case_track.readiness_percent if case_track is not None else 0.0

        if readiness_summary.recommended_focus_key == "cases" or case_readiness < FINAL_PHASE_CASE_GATE_PERCENT:
            start_ratio = CASE_CRITICAL_START_RATIO
        elif case_readiness < READINESS_BUILDING_THRESHOLD:
            start_ratio = CASE_WEAK_START_RATIO
        else:
            start_ratio = CASE_EARLY_START_RATIO

        if study_day_count <= 21:
            start_ratio = min(start_ratio, CASE_WEAK_START_RATIO)

        earliest_index = min(CASE_EARLY_START_MIN_INDEX, max(study_day_count - 1, 0))
        latest_index = min(max(study_day_count - 1, 0), max(intensive_limit, 0))
        planned_index = max(earliest_index, ceil(study_day_count * start_ratio))

        return min(planned_index, latest_index)

    def _rebalance_near_term_task_mix(
        self,
        tasks: list[PlanTask],
        *,
        start_date: date,
        days_until_accreditation: int,
    ) -> None:
        if len(tasks) < NEAR_TERM_DIVERSITY_WINDOW or days_until_accreditation <= FINAL_APPROACH_WINDOW_DAYS:
            return

        max_scan_date = start_date + timedelta(days=NEAR_TERM_DIVERSITY_LOOKAHEAD_DAYS)

        for _ in range(len(tasks)):
            sorted_tasks = sorted(tasks, key=lambda item: item.scheduled_date)
            swapped = False

            for window_start in range(0, len(sorted_tasks) - NEAR_TERM_DIVERSITY_WINDOW + 1):
                window = sorted_tasks[window_start : window_start + NEAR_TERM_DIVERSITY_WINDOW]

                if window[0].scheduled_date > max_scan_date:
                    return

                osce_tasks = [
                    task
                    for task in window
                    if task.task_type == PlanTaskType.OSCE and self._can_swap_near_term_task(
                        task,
                        start_date=start_date,
                        days_until_accreditation=days_until_accreditation,
                    )
                ]

                if len(osce_tasks) <= NEAR_TERM_OSCE_TASK_LIMIT:
                    continue

                surplus_task = osce_tasks[-1]
                replacement_task = self._find_near_term_replacement_task(
                    sorted_tasks,
                    start_index=window_start + NEAR_TERM_DIVERSITY_WINDOW,
                    max_scan_date=max_scan_date,
                    start_date=start_date,
                    days_until_accreditation=days_until_accreditation,
                )

                if replacement_task is None:
                    continue

                surplus_task.scheduled_date, replacement_task.scheduled_date = (
                    replacement_task.scheduled_date,
                    surplus_task.scheduled_date,
                )
                swapped = True
                break

            if not swapped:
                return

    def _find_near_term_replacement_task(
        self,
        tasks: list[PlanTask],
        *,
        start_index: int,
        max_scan_date: date,
        start_date: date,
        days_until_accreditation: int,
    ) -> PlanTask | None:
        for task in tasks[start_index:]:
            if task.scheduled_date > max_scan_date:
                return None

            if task.task_type == PlanTaskType.OSCE:
                continue

            if self._can_swap_near_term_task(
                task,
                start_date=start_date,
                days_until_accreditation=days_until_accreditation,
            ):
                return task

        return None

    def _can_swap_near_term_task(
        self,
        task: PlanTask,
        *,
        start_date: date,
        days_until_accreditation: int,
    ) -> bool:
        task_offset = max((task.scheduled_date - start_date).days, 0)
        task_days_until_accreditation = days_until_accreditation - task_offset

        return (
            task.task_variant == PlanTaskVariant.STANDARD
            and self._resolve_task_intent(task) == "training"
            and task_days_until_accreditation > FINAL_APPROACH_WINDOW_DAYS
        )

    def _resolve_final_phase_gate(self, readiness_summary: ReadinessSummarySnapshot) -> FinalPhaseGateDecision:
        track_by_key = {track.key: track for track in readiness_summary.tracks}
        test_track = track_by_key.get("tests")
        case_track = track_by_key.get("cases")
        osce_track = track_by_key.get("osce")
        test_readiness = test_track.readiness_percent if test_track is not None else 0.0
        case_readiness = case_track.readiness_percent if case_track is not None else 0.0
        osce_readiness = osce_track.readiness_percent if osce_track is not None else 0.0
        weakest_momentum = min(
            test_track.momentum_percent if test_track is not None else 0.0,
            case_track.momentum_percent if case_track is not None else 0.0,
            osce_track.momentum_percent if osce_track is not None else 0.0,
        )
        allow_exam_sim = (
            readiness_summary.overall_readiness_percent >= FINAL_PHASE_OVERALL_GATE_PERCENT
            and test_readiness >= FINAL_PHASE_TEST_GATE_PERCENT
            and case_readiness >= FINAL_PHASE_CASE_GATE_PERCENT
            and osce_readiness >= FINAL_PHASE_OSCE_GATE_PERCENT
        )
        allow_final_rehearsal = (
            allow_exam_sim
            and readiness_summary.overall_readiness_percent >= FINAL_REHEARSAL_OVERALL_GATE_PERCENT
            and test_readiness >= FINAL_REHEARSAL_TEST_GATE_PERCENT
            and case_readiness >= FINAL_REHEARSAL_CASE_GATE_PERCENT
            and osce_readiness >= FINAL_REHEARSAL_OSCE_GATE_PERCENT
            and weakest_momentum >= FINAL_REHEARSAL_MOMENTUM_GATE_PERCENT
        )

        return FinalPhaseGateDecision(
            allow_exam_sim=allow_exam_sim,
            focus_track_key=readiness_summary.recommended_focus_key,
            use_focused_test=test_readiness < FINAL_PHASE_FOCUSED_TEST_PERCENT,
            allow_final_rehearsal=allow_final_rehearsal,
        )

    def _build_daily_rhythm_context(
        self,
        scheduled_date: date,
        load_profile: UserStudyLoadProfile,
        remaining_days_until_accreditation: int,
    ) -> DailyRhythmContext:
        if remaining_days_until_accreditation <= FINAL_APPROACH_WINDOW_DAYS:
            return DailyRhythmContext(
                energy_score=1.0,
                fatigue_score=0.0,
                is_recovery_day=False,
                supports_heavy_slot=True,
            )

        weekday_energy = {
            0: 0.92,  # Monday
            1: 1.0,   # Tuesday
            2: 0.96,  # Wednesday
            3: 1.0,   # Thursday
            4: 0.86,  # Friday
            5: 0.9,   # Saturday
            6: 0.72,  # Sunday
        }
        energy_score = weekday_energy.get(scheduled_date.weekday(), 0.9)

        if load_profile.intensity == StudyIntensity.INTENSIVE:
            if scheduled_date.weekday() in {1, 3}:
                energy_score += 0.03
            elif scheduled_date.weekday() in {4, 6}:
                energy_score -= 0.07
        elif load_profile.intensity == StudyIntensity.GENTLE:
            if scheduled_date.weekday() in {1, 3}:
                energy_score -= 0.03
            elif scheduled_date.weekday() in {5, 6}:
                energy_score += 0.02

        if load_profile.daily_minutes >= 90 and scheduled_date.weekday() in {1, 3}:
            energy_score += 0.04
        elif load_profile.daily_minutes <= 35 and scheduled_date.weekday() in {4, 6}:
            energy_score -= 0.03

        energy_score = self._clamp_ratio(round(energy_score, 2), 0.55, 1.05)
        fatigue_score = round(max(0.0, 1.0 - energy_score), 2)

        return DailyRhythmContext(
            energy_score=energy_score,
            fatigue_score=fatigue_score,
            is_recovery_day=energy_score <= RECOVERY_DAY_ENERGY_THRESHOLD,
            supports_heavy_slot=energy_score >= HEAVY_SLOT_ENERGY_THRESHOLD,
        )

    def _build_energy_weighted_day_offsets(
        self,
        start_date: date,
        start_offset: int,
        end_offset_exclusive: int,
        task_count: int,
        load_profile: UserStudyLoadProfile,
        available_offsets: list[int] | None = None,
    ) -> list[int]:
        if end_offset_exclusive <= start_offset or task_count <= 0:
            return []

        candidate_offsets = (
            sorted({offset for offset in available_offsets})
            if available_offsets is not None
            else list(range(start_offset, end_offset_exclusive))
        )
        candidate_offsets = [
            offset
            for offset in candidate_offsets
            if start_offset <= offset < end_offset_exclusive
        ]

        if len(candidate_offsets) == 0:
            return []

        if len(candidate_offsets) <= task_count:
            return candidate_offsets

        remaining_days_by_offset = {
            offset: len(candidate_offsets) - index
            for index, offset in enumerate(candidate_offsets)
        }

        if task_count == 1:
            best_offset = max(
                candidate_offsets,
                key=lambda offset: self._energy_weighted_offset_score(
                    start_date,
                    offset,
                    desired_offset=offset,
                    remaining_days_until_accreditation=remaining_days_by_offset[offset],
                    load_profile=load_profile,
                ),
            )
            return [best_offset]

        desired_offsets = [
            candidate_offsets[round(index * (len(candidate_offsets) - 1) / max(task_count - 1, 1))]
            for index in range(task_count)
        ]
        chosen_offsets: list[int] = []

        for desired_offset in desired_offsets:
            best_offset = max(
                [offset for offset in candidate_offsets if offset not in chosen_offsets],
                key=lambda offset: self._energy_weighted_offset_score(
                    start_date,
                    offset,
                    desired_offset=desired_offset,
                    remaining_days_until_accreditation=remaining_days_by_offset[offset],
                    load_profile=load_profile,
                ),
            )
            chosen_offsets.append(best_offset)

        return sorted(chosen_offsets)

    def _energy_weighted_offset_score(
        self,
        start_date: date,
        offset: int,
        *,
        desired_offset: int,
        remaining_days_until_accreditation: int,
        load_profile: UserStudyLoadProfile,
    ) -> tuple[float, int, int]:
        rhythm = self._build_daily_rhythm_context(
            start_date + timedelta(days=offset),
            load_profile,
            remaining_days_until_accreditation,
        )
        score = rhythm.energy_score - abs(offset - desired_offset) * 0.08

        if rhythm.is_recovery_day:
            score -= 0.18

        return (round(score, 4), -abs(offset - desired_offset), -offset)

    def _build_osce_day_offsets(
        self,
        start_date: date,
        days_until_accreditation: int,
        task_count: int,
        load_profile: UserStudyLoadProfile,
        study_day_offsets: list[int] | None = None,
    ) -> list[int]:
        if days_until_accreditation <= 0 or task_count <= 0:
            return []

        priority_window_days = min(
            days_until_accreditation,
            max(task_count, ceil(days_until_accreditation * OSCE_PRIORITY_WINDOW_RATIO)),
        )

        return self._build_energy_weighted_day_offsets(
            start_date,
            0,
            priority_window_days,
            task_count,
            load_profile,
            available_offsets=study_day_offsets,
        )

    def _build_osce_task_sequence(
        self,
        osce_stations: list[PlannedOsceStation],
        days_until_accreditation: int,
        osce_task_share: float,
    ) -> list[PlannedOsceStation]:
        if len(osce_stations) == 0 or days_until_accreditation <= 0:
            return []

        target_count = self._calculate_osce_target_count(osce_stations, days_until_accreditation, osce_task_share)
        active_stations = [station for station in osce_stations if station.status != "mastered"]
        sequence: list[PlannedOsceStation] = []

        for station in active_stations:
            if len(sequence) >= target_count:
                return sequence

            sequence.append(station)

        repeat_candidates = [
            station
            for station in active_stations
            for _ in range(max(station.recommended_repeats - 1, 0))
        ]

        for station in repeat_candidates:
            if len(sequence) >= target_count:
                return sequence

            sequence.append(station)

        filler_source = active_stations or osce_stations
        filler_index = len(sequence)

        while len(sequence) < target_count and len(filler_source) > 0:
            sequence.append(filler_source[filler_index % len(filler_source)])
            filler_index += 1

        return sequence

    def _build_topic_focus_sequence(
        self,
        topics: list[PlannedTopic],
        target_count: int,
    ) -> list[PlannedTopic]:
        if len(topics) == 0 or target_count <= 0:
            return []

        primary_band_count = min(
            len(topics),
            max(TOPIC_PRIMARY_BAND_MIN, ceil(target_count / 2)),
        )
        primary_band = topics[:primary_band_count]
        sequence: list[PlannedTopic] = []

        for topic in primary_band:
            for _ in range(topic.recommended_repeats):
                if len(sequence) >= target_count:
                    return sequence

                sequence.append(topic)

        for topic in topics[primary_band_count:]:
            if len(sequence) >= target_count:
                return sequence

            sequence.append(topic)

        filler_source = primary_band or topics
        filler_index = 0

        while len(sequence) < target_count:
            sequence.append(filler_source[filler_index % len(filler_source)])
            filler_index += 1

        return sequence

    def _build_case_day_offsets(
        self,
        start_date: date,
        days_until_accreditation: int,
        case_start_index: int,
        task_count: int,
        load_profile: UserStudyLoadProfile,
        study_day_offsets: list[int] | None = None,
    ) -> list[int]:
        if days_until_accreditation <= 0 or task_count <= 0:
            return []

        available_offsets = (
            study_day_offsets[case_start_index:]
            if study_day_offsets is not None
            else None
        )

        if available_offsets is not None and len(available_offsets) == 0:
            return []

        return self._build_energy_weighted_day_offsets(
            start_date,
            0,
            days_until_accreditation,
            task_count,
            load_profile,
            available_offsets=available_offsets,
        )

    def _build_case_task_sequence(
        self,
        topics: list[PlannedTopic],
        days_until_accreditation: int,
        case_start_index: int,
        case_task_share: float,
    ) -> list[PlannedTopic]:
        if len(topics) == 0 or days_until_accreditation <= case_start_index:
            return []

        available_window = days_until_accreditation - case_start_index
        target_count = min(
            available_window,
            max(1, ceil(days_until_accreditation * case_task_share)),
        )
        primary_band_count = min(len(topics), max(1, ceil(target_count / 2)))
        primary_band = topics[:primary_band_count]
        secondary_band = topics[primary_band_count:]
        sequence: list[PlannedTopic] = []

        for topic in primary_band:
            if len(sequence) >= target_count:
                return sequence

            sequence.append(topic)

        filler_source = secondary_band or primary_band or topics
        filler_index = 0

        while len(sequence) < target_count and len(filler_source) > 0:
            sequence.append(filler_source[filler_index % len(filler_source)])
            filler_index += 1

        return sequence

    def _calculate_osce_target_count(
        self,
        osce_stations: list[PlannedOsceStation],
        days_until_accreditation: int,
        osce_task_share: float,
    ) -> int:
        base_target_count = max(1, ceil(days_until_accreditation * osce_task_share))
        active_station_count = len([station for station in osce_stations if station.status != "mastered"])
        expanded_target_count = min(active_station_count, base_target_count + OSCE_TARGET_EXPANSION)

        return min(
            days_until_accreditation,
            max(base_target_count, expanded_target_count),
        )

    def _get_best_score_percent(self, attempts: list[OsceAttempt]) -> float | None:
        if len(attempts) == 0:
            return None

        return max(self._to_float(attempt.total_score_percent) for attempt in attempts)

    def _resolve_osce_status(self, attempts: list[OsceAttempt]) -> str:
        best_score_percent = self._get_best_score_percent(attempts)

        if best_score_percent is None:
            return "not_started"

        if best_score_percent >= OSCE_MASTERY_PERCENT:
            return "mastered"

        return "in_progress"

    def _calculate_osce_recommended_repeats(self, status: str, best_score_percent: float | None) -> int:
        if status == "mastered":
            return 0

        if status == "not_started" or best_score_percent is None:
            return 1

        recommended_repeats = 1

        if best_score_percent < OSCE_REPEAT_THRESHOLD:
            recommended_repeats += 1

        if best_score_percent < OSCE_CRITICAL_REPEAT_THRESHOLD:
            recommended_repeats += 1

        return recommended_repeats

    def _osce_priority_order(self, status: str) -> int:
        if status == "in_progress":
            return 0

        if status == "not_started":
            return 1

        return 2

    def _resolve_topic_status(
        self,
        answered_questions: int,
        accuracy_percent: float,
        repeated_question_struggles: int,
        hard_question_accuracy_percent: float | None,
    ) -> str:
        if answered_questions == 0:
            return "not_started"

        if answered_questions < TOPIC_EARLY_SIGNAL_QUESTIONS:
            return "building"

        if (
            accuracy_percent < TOPIC_CRITICAL_ACCURACY_PERCENT
            or (
                repeated_question_struggles >= TOPIC_REPEATED_QUESTION_ALERT_COUNT
                and accuracy_percent < TOPIC_STABLE_ACCURACY_PERCENT
            )
        ):
            return "critical"

        if (
            accuracy_percent < TOPIC_LOW_ACCURACY_PERCENT
            or repeated_question_struggles > 0
            or (
                hard_question_accuracy_percent is not None
                and hard_question_accuracy_percent < TOPIC_HARD_QUESTION_ALERT_PERCENT
            )
        ):
            return "fragile"

        if answered_questions < TOPIC_CONFIDENCE_QUESTIONS or accuracy_percent < TOPIC_STABLE_ACCURACY_PERCENT:
            return "developing"

        return "stable"

    def _calculate_topic_recommended_repeats(
        self,
        status: str,
        answered_questions: int,
        repeated_question_struggles: int,
        hard_question_accuracy_percent: float | None,
        review_urgency: str,
    ) -> int:
        if status == "critical":
            recommended_repeats = 3
        elif status in {"not_started", "fragile"}:
            recommended_repeats = 2
        elif status == "building":
            recommended_repeats = 2 if answered_questions < TOPIC_CONFIDENCE_QUESTIONS else 1
        else:
            recommended_repeats = 1

        if repeated_question_struggles >= TOPIC_REPEATED_QUESTION_ALERT_COUNT:
            recommended_repeats += 1

        if (
            hard_question_accuracy_percent is not None
            and hard_question_accuracy_percent < TOPIC_HARD_QUESTION_ALERT_PERCENT
        ):
            recommended_repeats += 1

        if review_urgency == "due":
            recommended_repeats += 1
        elif review_urgency == "overdue":
            recommended_repeats += 2

        return min(recommended_repeats, 4)

    def _topic_priority_order(self, status: str, review_urgency: str) -> int:
        if status == "critical":
            return 0

        if status == "not_started":
            return 1

        if status == "fragile":
            return 2

        if status == "building":
            return 3

        if status == "developing":
            return 4 if review_urgency in {"due", "overdue"} else 5

        if status == "stable":
            if review_urgency == "overdue":
                return 4

            if review_urgency == "due":
                return 5

            return 6

        return 7

    def _topic_recent_struggle_order(self, last_struggle_at: datetime | None) -> int:
        if last_struggle_at is None:
            return 3

        days_since_struggle = max((today() - last_struggle_at.date()).days, 0)

        if days_since_struggle <= TOPIC_FRESH_STRUGGLE_DAYS:
            return 0

        if days_since_struggle <= TOPIC_RECENT_STRUGGLE_DAYS:
            return 1

        return 2

    def _topic_repeated_struggle_order(self, repeated_question_struggles: int) -> int:
        if repeated_question_struggles >= TOPIC_REPEATED_QUESTION_ALERT_COUNT:
            return 0

        if repeated_question_struggles > 0:
            return 1

        return 2

    def _topic_review_urgency_order(self, review_urgency: str) -> int:
        if review_urgency == "overdue":
            return 0

        if review_urgency == "due":
            return 1

        if review_urgency == "soon":
            return 2

        if review_urgency == "fresh":
            return 3

        return 4

    def _resolve_topic_review_interval_days(
        self,
        status: str,
        answered_questions: int,
        accuracy_percent: float,
    ) -> int:
        if answered_questions == 0:
            return 0

        if status == "critical":
            return TOPIC_REVIEW_CRITICAL_INTERVAL_DAYS

        if status == "fragile":
            return TOPIC_REVIEW_FRAGILE_INTERVAL_DAYS

        if status == "building":
            return TOPIC_REVIEW_BUILDING_INTERVAL_DAYS

        if status == "developing":
            return TOPIC_REVIEW_DEVELOPING_INTERVAL_DAYS

        if accuracy_percent >= 90.0 and answered_questions >= TOPIC_CONFIDENCE_QUESTIONS * 2:
            return TOPIC_REVIEW_STABLE_INTERVAL_DAYS + 2

        return TOPIC_REVIEW_STABLE_INTERVAL_DAYS

    def _calculate_review_overdue_days(
        self,
        last_activity_at: datetime | None,
        review_interval_days: int,
    ) -> int:
        if last_activity_at is None or review_interval_days <= 0:
            return 0

        days_since_activity = max((today() - last_activity_at.date()).days, 0)
        return max(days_since_activity - review_interval_days, 0)

    def _resolve_topic_review_urgency(
        self,
        last_activity_at: datetime | None,
        review_interval_days: int,
        review_overdue_days: int,
    ) -> str:
        if last_activity_at is None or review_interval_days <= 0:
            return "new"

        days_since_activity = max((today() - last_activity_at.date()).days, 0)
        overdue_threshold = max(2, review_interval_days // 3)

        if review_overdue_days >= overdue_threshold:
            return "overdue"

        if review_overdue_days > 0:
            return "due"

        if days_since_activity >= max(review_interval_days - TOPIC_REVIEW_SOON_WINDOW_DAYS, 1):
            return "soon"

        return "fresh"

    def _counts_as_stable_topic(self, topic: PlannedTopic) -> bool:
        if topic.review_urgency == "overdue":
            return False

        if topic.status == "stable":
            return True

        return topic.status == "developing" and topic.accuracy_percent >= TOPIC_STABLE_ACCURACY_PERCENT

    def _build_osce_task(self, plan_id: int, scheduled_date: date, station: PlannedOsceStation) -> PlanTask:
        return PlanTask(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            task_type=PlanTaskType.OSCE,
            task_variant=PlanTaskVariant.STANDARD,
            topic_id=None,
            task_title=station.title,
            osce_station_slug=station.slug,
            questions_count=station.workload_units,
            estimated_minutes=station.duration_minutes,
            target_route="osce",
        )

    def _build_test_task(
        self,
        plan_id: int,
        scheduled_date: date,
        topic_id: int | None,
        questions_count: int,
        estimated_minutes: int,
    ) -> PlanTask:
        return PlanTask(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            task_type=PlanTaskType.TEST,
            task_variant=PlanTaskVariant.STANDARD,
            topic_id=topic_id,
            questions_count=questions_count,
            estimated_minutes=estimated_minutes,
            intent="training",
            target_route="learning_center",
        )

    @staticmethod
    def _is_protocol_stage_confirmed(
        protocol_context: ProtocolConfirmationContext | None,
        stage_key: str,
    ) -> bool:
        return protocol_context is not None and stage_key in protocol_context.passed_stage_keys

    def _build_final_phase_task(
        self,
        plan_id: int,
        scheduled_date: date,
        focused_topic_sequence: list[PlannedTopic],
        case_sequence: list[PlannedTopic],
        osce_sequence: list[PlannedOsceStation],
        load_profile: UserStudyLoadProfile,
        final_phase_gate: FinalPhaseGateDecision,
        fallback_focus_index: int,
        fallback_case_index: int,
        fallback_osce_index: int,
        final_phase_day_index: int,
        remaining_days_until_accreditation: int,
        day_offset: int,
        deferred_task_signature: DeferredTaskSignature | None,
        protocol_context: ProtocolConfirmationContext | None = None,
    ) -> tuple[PlanTask, int, int, int]:
        if remaining_days_until_accreditation <= 1:
            return (
                self._build_pre_accreditation_review_task(plan_id, scheduled_date, load_profile),
                fallback_focus_index,
                fallback_case_index,
                fallback_osce_index,
            )

        if (
            final_phase_gate.allow_exam_sim
            and FINAL_WEEK_WINDOW_DAYS < remaining_days_until_accreditation <= FINAL_APPROACH_WINDOW_DAYS
        ):
            return self._build_final_approach_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                focused_topic_sequence=focused_topic_sequence,
                case_sequence=case_sequence,
                osce_sequence=osce_sequence,
                load_profile=load_profile,
                final_phase_gate=final_phase_gate,
                fallback_focus_index=fallback_focus_index,
                fallback_case_index=fallback_case_index,
                fallback_osce_index=fallback_osce_index,
                remaining_days_until_accreditation=remaining_days_until_accreditation,
                day_offset=day_offset,
                deferred_task_signature=deferred_task_signature,
                protocol_context=protocol_context,
            )

        if final_phase_gate.allow_exam_sim and remaining_days_until_accreditation <= FINAL_WEEK_WINDOW_DAYS:
            return self._build_final_week_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                focused_topic_sequence=focused_topic_sequence,
                case_sequence=case_sequence,
                osce_sequence=osce_sequence,
                load_profile=load_profile,
                final_phase_gate=final_phase_gate,
                fallback_focus_index=fallback_focus_index,
                fallback_case_index=fallback_case_index,
                fallback_osce_index=fallback_osce_index,
                remaining_days_until_accreditation=remaining_days_until_accreditation,
                day_offset=day_offset,
                deferred_task_signature=deferred_task_signature,
                protocol_context=protocol_context,
            )

        if not final_phase_gate.allow_exam_sim:
            return self._build_final_phase_reinforcement_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                focused_topic_sequence=focused_topic_sequence,
                case_sequence=case_sequence,
                osce_sequence=osce_sequence,
                load_profile=load_profile,
                final_phase_gate=final_phase_gate,
                fallback_focus_index=fallback_focus_index,
                fallback_case_index=fallback_case_index,
                fallback_osce_index=fallback_osce_index,
                day_offset=day_offset,
                deferred_task_signature=deferred_task_signature,
                protocol_context=protocol_context,
            )

        cycle_slot = final_phase_day_index % FINAL_PHASE_CYCLE_LENGTH
        if cycle_slot == 0:
            # Once the planner unlocks full exam simulations, the final-phase cycle
            # should keep its anchor cadence stable instead of letting weekday fatigue
            # replace the exam slot with a different track.
            if not self._is_protocol_stage_confirmed(protocol_context, "tests"):
                return (
                    self._build_exam_sim_task(plan_id, scheduled_date),
                    fallback_focus_index,
                    fallback_case_index,
                    fallback_osce_index,
                )

            return self._build_final_phase_reinforcement_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                focused_topic_sequence=focused_topic_sequence,
                case_sequence=case_sequence,
                osce_sequence=osce_sequence,
                load_profile=load_profile,
                final_phase_gate=final_phase_gate,
                fallback_focus_index=fallback_focus_index,
                fallback_case_index=fallback_case_index,
                fallback_osce_index=fallback_osce_index,
                day_offset=day_offset,
                deferred_task_signature=deferred_task_signature,
                protocol_context=protocol_context,
            )

        if cycle_slot == FINAL_PHASE_REINFORCEMENT_SLOT:
            return self._build_final_phase_reinforcement_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                focused_topic_sequence=focused_topic_sequence,
                case_sequence=case_sequence,
                osce_sequence=osce_sequence,
                load_profile=load_profile,
                final_phase_gate=final_phase_gate,
                fallback_focus_index=fallback_focus_index,
                fallback_case_index=fallback_case_index,
                fallback_osce_index=fallback_osce_index,
                day_offset=day_offset,
                deferred_task_signature=deferred_task_signature,
                protocol_context=protocol_context,
            )

        if cycle_slot == FINAL_PHASE_CASE_SLOT:
            if case_sequence and not self._is_protocol_stage_confirmed(protocol_context, "cases"):
                return self._build_final_phase_case_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    case_sequence=case_sequence,
                    load_profile=load_profile,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                )

            if osce_sequence and not self._is_protocol_stage_confirmed(protocol_context, "osce"):
                return self._build_final_phase_osce_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    osce_sequence=osce_sequence,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                )

        if (
            cycle_slot == FINAL_PHASE_OSCE_SLOT
            and osce_sequence
            and not self._is_protocol_stage_confirmed(protocol_context, "osce")
        ):
            return self._build_final_phase_osce_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                osce_sequence=osce_sequence,
                fallback_focus_index=fallback_focus_index,
                fallback_case_index=fallback_case_index,
                fallback_osce_index=fallback_osce_index,
                day_offset=day_offset,
                deferred_task_signature=deferred_task_signature,
            )

        if case_sequence and not self._is_protocol_stage_confirmed(protocol_context, "cases"):
            return self._build_final_phase_case_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                case_sequence=case_sequence,
                load_profile=load_profile,
                fallback_focus_index=fallback_focus_index,
                fallback_case_index=fallback_case_index,
                fallback_osce_index=fallback_osce_index,
                day_offset=day_offset,
                deferred_task_signature=deferred_task_signature,
            )

        return self._build_final_phase_reinforcement_task(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            focused_topic_sequence=focused_topic_sequence,
            case_sequence=case_sequence,
            osce_sequence=osce_sequence,
            load_profile=load_profile,
            final_phase_gate=final_phase_gate,
            fallback_focus_index=fallback_focus_index,
            fallback_case_index=fallback_case_index,
            fallback_osce_index=fallback_osce_index,
            day_offset=day_offset,
            deferred_task_signature=deferred_task_signature,
            protocol_context=protocol_context,
        )

    def _build_exam_sim_task(self, plan_id: int, scheduled_date: date) -> PlanTask:
        return PlanTask(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            task_type=PlanTaskType.EXAM_SIM,
            task_variant=PlanTaskVariant.STANDARD,
            topic_id=None,
            questions_count=EXAM_SIM_QUESTION_COUNT,
            estimated_minutes=EXAM_SIM_MINUTES,
            intent="exam_checkpoint",
            exam_checkpoint_type="test_stage",
            target_route="accreditation_center",
        )

    def _build_final_approach_task(
        self,
        plan_id: int,
        scheduled_date: date,
        focused_topic_sequence: list[PlannedTopic],
        case_sequence: list[PlannedTopic],
        osce_sequence: list[PlannedOsceStation],
        load_profile: UserStudyLoadProfile,
        final_phase_gate: FinalPhaseGateDecision,
        fallback_focus_index: int,
        fallback_case_index: int,
        fallback_osce_index: int,
        remaining_days_until_accreditation: int,
        day_offset: int,
        deferred_task_signature: DeferredTaskSignature | None,
        protocol_context: ProtocolConfirmationContext | None = None,
    ) -> tuple[PlanTask, int, int, int]:
        if remaining_days_until_accreditation in {14, 11}:
            if not self._is_protocol_stage_confirmed(protocol_context, "tests"):
                return (
                    self._build_exam_sim_task(plan_id, scheduled_date),
                    fallback_focus_index,
                    fallback_case_index,
                    fallback_osce_index,
                )

            return self._build_final_phase_reinforcement_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                focused_topic_sequence=focused_topic_sequence,
                case_sequence=case_sequence,
                osce_sequence=osce_sequence,
                load_profile=load_profile,
                final_phase_gate=final_phase_gate,
                fallback_focus_index=fallback_focus_index,
                fallback_case_index=fallback_case_index,
                fallback_osce_index=fallback_osce_index,
                day_offset=day_offset,
                deferred_task_signature=deferred_task_signature,
                protocol_context=protocol_context,
            )

        if remaining_days_until_accreditation == 8:
            return (
                self._build_final_approach_review_task(plan_id, scheduled_date, load_profile),
                fallback_focus_index,
                fallback_case_index,
                fallback_osce_index,
            )

        if (
            final_phase_gate.focus_track_key == "tests"
            and focused_topic_sequence
            and not self._is_protocol_stage_confirmed(protocol_context, "tests")
        ):
            topic = focused_topic_sequence[fallback_focus_index % len(focused_topic_sequence)]

            if (
                day_offset == 0
                and deferred_task_signature is not None
                and deferred_task_signature.task_type == PlanTaskType.TEST
                and deferred_task_signature.topic_id is not None
            ):
                topic = self._select_next_topic(
                    focused_topic_sequence,
                    deferred_task_signature.topic_id,
                    topic,
                )

            return (
                self._build_test_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    topic_id=topic.topic.id,
                    questions_count=load_profile.focused_test_question_count,
                    estimated_minutes=load_profile.focused_test_minutes,
                ),
                fallback_focus_index + 1,
                fallback_case_index,
                fallback_osce_index,
            )

        return self._build_final_phase_reinforcement_task(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            focused_topic_sequence=focused_topic_sequence,
            case_sequence=case_sequence,
            osce_sequence=osce_sequence,
            load_profile=load_profile,
            final_phase_gate=final_phase_gate,
            fallback_focus_index=fallback_focus_index,
            fallback_case_index=fallback_case_index,
            fallback_osce_index=fallback_osce_index,
            day_offset=day_offset,
            deferred_task_signature=deferred_task_signature,
            protocol_context=protocol_context,
        )

    def _build_final_week_task(
        self,
        plan_id: int,
        scheduled_date: date,
        focused_topic_sequence: list[PlannedTopic],
        case_sequence: list[PlannedTopic],
        osce_sequence: list[PlannedOsceStation],
        load_profile: UserStudyLoadProfile,
        final_phase_gate: FinalPhaseGateDecision,
        fallback_focus_index: int,
        fallback_case_index: int,
        fallback_osce_index: int,
        remaining_days_until_accreditation: int,
        day_offset: int,
        deferred_task_signature: DeferredTaskSignature | None,
        protocol_context: ProtocolConfirmationContext | None = None,
    ) -> tuple[PlanTask, int, int, int]:
        if final_phase_gate.allow_final_rehearsal:
            if remaining_days_until_accreditation == 7:
                return self._build_final_phase_reinforcement_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    focused_topic_sequence=focused_topic_sequence,
                    case_sequence=case_sequence,
                    osce_sequence=osce_sequence,
                    load_profile=load_profile,
                    final_phase_gate=final_phase_gate,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                    protocol_context=protocol_context,
                )

            if remaining_days_until_accreditation == FINAL_REHEARSAL_TEST_DAY:
                if not self._is_protocol_stage_confirmed(protocol_context, "tests"):
                    return (
                        self._build_final_rehearsal_exam_task(plan_id, scheduled_date),
                        fallback_focus_index,
                        fallback_case_index,
                        fallback_osce_index,
                    )

                return self._build_final_phase_reinforcement_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    focused_topic_sequence=focused_topic_sequence,
                    case_sequence=case_sequence,
                    osce_sequence=osce_sequence,
                    load_profile=load_profile,
                    final_phase_gate=final_phase_gate,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                    protocol_context=protocol_context,
                )

            if remaining_days_until_accreditation == FINAL_REHEARSAL_CASE_DAY:
                if case_sequence and not self._is_protocol_stage_confirmed(protocol_context, "cases"):
                    return self._build_final_rehearsal_case_task(
                        plan_id=plan_id,
                        scheduled_date=scheduled_date,
                        case_sequence=case_sequence,
                        fallback_focus_index=fallback_focus_index,
                        fallback_case_index=fallback_case_index,
                        fallback_osce_index=fallback_osce_index,
                        day_offset=day_offset,
                        deferred_task_signature=deferred_task_signature,
                    )

                if osce_sequence and not self._is_protocol_stage_confirmed(protocol_context, "osce"):
                    return self._build_final_phase_osce_task(
                        plan_id=plan_id,
                        scheduled_date=scheduled_date,
                        osce_sequence=osce_sequence,
                        fallback_focus_index=fallback_focus_index,
                        fallback_case_index=fallback_case_index,
                        fallback_osce_index=fallback_osce_index,
                        day_offset=day_offset,
                        deferred_task_signature=deferred_task_signature,
                    )

                return self._build_final_phase_reinforcement_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    focused_topic_sequence=focused_topic_sequence,
                    case_sequence=case_sequence,
                    osce_sequence=osce_sequence,
                    load_profile=load_profile,
                    final_phase_gate=final_phase_gate,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                    protocol_context=protocol_context,
                )

            if remaining_days_until_accreditation == FINAL_REHEARSAL_OSCE_DAY:
                if osce_sequence and not self._is_protocol_stage_confirmed(protocol_context, "osce"):
                    return self._build_final_rehearsal_osce_task(
                        plan_id=plan_id,
                        scheduled_date=scheduled_date,
                        osce_sequence=osce_sequence,
                        fallback_focus_index=fallback_focus_index,
                        fallback_case_index=fallback_case_index,
                        fallback_osce_index=fallback_osce_index,
                        day_offset=day_offset,
                        deferred_task_signature=deferred_task_signature,
                    )

                if case_sequence and not self._is_protocol_stage_confirmed(protocol_context, "cases"):
                    return self._build_final_phase_case_task(
                        plan_id=plan_id,
                        scheduled_date=scheduled_date,
                        case_sequence=case_sequence,
                        load_profile=load_profile,
                        fallback_focus_index=fallback_focus_index,
                        fallback_case_index=fallback_case_index,
                        fallback_osce_index=fallback_osce_index,
                        day_offset=day_offset,
                        deferred_task_signature=deferred_task_signature,
                    )

                return self._build_final_phase_reinforcement_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    focused_topic_sequence=focused_topic_sequence,
                    case_sequence=case_sequence,
                    osce_sequence=osce_sequence,
                    load_profile=load_profile,
                    final_phase_gate=final_phase_gate,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                    protocol_context=protocol_context,
                )

            if remaining_days_until_accreditation == 3:
                return self._build_final_phase_reinforcement_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    focused_topic_sequence=focused_topic_sequence,
                    case_sequence=case_sequence,
                    osce_sequence=osce_sequence,
                    load_profile=load_profile,
                    final_phase_gate=final_phase_gate,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                    protocol_context=protocol_context,
                )

        if remaining_days_until_accreditation in {7, 4}:
            if not self._is_protocol_stage_confirmed(protocol_context, "tests"):
                return (
                    self._build_exam_sim_task(plan_id, scheduled_date),
                    fallback_focus_index,
                    fallback_case_index,
                    fallback_osce_index,
                )

            return self._build_final_phase_reinforcement_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                focused_topic_sequence=focused_topic_sequence,
                case_sequence=case_sequence,
                osce_sequence=osce_sequence,
                load_profile=load_profile,
                final_phase_gate=final_phase_gate,
                fallback_focus_index=fallback_focus_index,
                fallback_case_index=fallback_case_index,
                fallback_osce_index=fallback_osce_index,
                day_offset=day_offset,
                deferred_task_signature=deferred_task_signature,
                protocol_context=protocol_context,
            )

        if remaining_days_until_accreditation == 5:
            if case_sequence and not self._is_protocol_stage_confirmed(protocol_context, "cases"):
                return self._build_final_phase_case_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    case_sequence=case_sequence,
                    load_profile=load_profile,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                )

            if osce_sequence and not self._is_protocol_stage_confirmed(protocol_context, "osce"):
                return self._build_final_phase_osce_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    osce_sequence=osce_sequence,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                )

        if remaining_days_until_accreditation == 3:
            if osce_sequence and not self._is_protocol_stage_confirmed(protocol_context, "osce"):
                return self._build_final_phase_osce_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    osce_sequence=osce_sequence,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                )

            if case_sequence and not self._is_protocol_stage_confirmed(protocol_context, "cases"):
                return self._build_final_phase_case_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    case_sequence=case_sequence,
                    load_profile=load_profile,
                    fallback_focus_index=fallback_focus_index,
                    fallback_case_index=fallback_case_index,
                    fallback_osce_index=fallback_osce_index,
                    day_offset=day_offset,
                    deferred_task_signature=deferred_task_signature,
                )

        if remaining_days_until_accreditation == 2:
            return (
                self._build_final_week_broad_review_task(plan_id, scheduled_date, load_profile),
                fallback_focus_index,
                fallback_case_index,
                fallback_osce_index,
            )

        return self._build_final_phase_reinforcement_task(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            focused_topic_sequence=focused_topic_sequence,
            case_sequence=case_sequence,
            osce_sequence=osce_sequence,
            load_profile=load_profile,
            final_phase_gate=final_phase_gate,
            fallback_focus_index=fallback_focus_index,
            fallback_case_index=fallback_case_index,
            fallback_osce_index=fallback_osce_index,
            day_offset=day_offset,
            deferred_task_signature=deferred_task_signature,
            protocol_context=protocol_context,
        )

    def _build_final_phase_reinforcement_task(
        self,
        plan_id: int,
        scheduled_date: date,
        focused_topic_sequence: list[PlannedTopic],
        case_sequence: list[PlannedTopic],
        osce_sequence: list[PlannedOsceStation],
        load_profile: UserStudyLoadProfile,
        final_phase_gate: FinalPhaseGateDecision,
        fallback_focus_index: int,
        fallback_case_index: int,
        fallback_osce_index: int,
        day_offset: int,
        deferred_task_signature: DeferredTaskSignature | None,
        protocol_context: ProtocolConfirmationContext | None = None,
    ) -> tuple[PlanTask, int, int, int]:
        if (
            final_phase_gate.focus_track_key == "cases"
            and case_sequence
            and not self._is_protocol_stage_confirmed(protocol_context, "cases")
        ):
            return self._build_final_phase_case_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                case_sequence=case_sequence,
                load_profile=load_profile,
                fallback_focus_index=fallback_focus_index,
                fallback_case_index=fallback_case_index,
                fallback_osce_index=fallback_osce_index,
                day_offset=day_offset,
                deferred_task_signature=deferred_task_signature,
            )

        if (
            final_phase_gate.focus_track_key == "osce"
            and osce_sequence
            and not self._is_protocol_stage_confirmed(protocol_context, "osce")
        ):
            return self._build_final_phase_osce_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                osce_sequence=osce_sequence,
                fallback_focus_index=fallback_focus_index,
                fallback_case_index=fallback_case_index,
                fallback_osce_index=fallback_osce_index,
                day_offset=day_offset,
                deferred_task_signature=deferred_task_signature,
            )

        if (
            focused_topic_sequence
            and final_phase_gate.use_focused_test
            and not self._is_protocol_stage_confirmed(protocol_context, "tests")
        ):
            topic = focused_topic_sequence[fallback_focus_index % len(focused_topic_sequence)]

            if (
                day_offset == 0
                and deferred_task_signature is not None
                and deferred_task_signature.task_type == PlanTaskType.TEST
                and deferred_task_signature.topic_id is not None
            ):
                topic = self._select_next_topic(
                    focused_topic_sequence,
                    deferred_task_signature.topic_id,
                    topic,
                )

            return (
                self._build_test_task(
                    plan_id=plan_id,
                    scheduled_date=scheduled_date,
                    topic_id=topic.topic.id,
                    questions_count=load_profile.focused_test_question_count,
                    estimated_minutes=load_profile.focused_test_minutes,
                ),
                fallback_focus_index + 1,
                fallback_case_index,
                fallback_osce_index,
            )

        return (
            self._build_test_task(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                topic_id=None,
                questions_count=load_profile.mixed_test_question_count,
                estimated_minutes=load_profile.mixed_test_minutes,
            ),
            fallback_focus_index,
            fallback_case_index,
            fallback_osce_index,
        )

    def _build_final_phase_case_task(
        self,
        plan_id: int,
        scheduled_date: date,
        case_sequence: list[PlannedTopic],
        load_profile: UserStudyLoadProfile,
        fallback_focus_index: int,
        fallback_case_index: int,
        fallback_osce_index: int,
        day_offset: int,
        deferred_task_signature: DeferredTaskSignature | None,
    ) -> tuple[PlanTask, int, int, int]:
        topic = case_sequence[fallback_case_index % len(case_sequence)]

        if (
            day_offset == 0
            and deferred_task_signature is not None
            and deferred_task_signature.task_type == PlanTaskType.CASE
            and deferred_task_signature.topic_id is not None
        ):
            topic = self._select_next_topic(case_sequence, deferred_task_signature.topic_id, topic)

        return (
            self._build_exam_case_task(plan_id, scheduled_date, topic),
            fallback_focus_index,
            fallback_case_index + 1,
            fallback_osce_index,
        )

    def _build_final_phase_osce_task(
        self,
        plan_id: int,
        scheduled_date: date,
        osce_sequence: list[PlannedOsceStation],
        fallback_focus_index: int,
        fallback_case_index: int,
        fallback_osce_index: int,
        day_offset: int,
        deferred_task_signature: DeferredTaskSignature | None,
    ) -> tuple[PlanTask, int, int, int]:
        station = osce_sequence[fallback_osce_index % len(osce_sequence)]

        if (
            day_offset == 0
            and deferred_task_signature is not None
            and deferred_task_signature.task_type == PlanTaskType.OSCE
            and deferred_task_signature.osce_station_slug is not None
        ):
            station = self._select_next_osce_station(
                osce_sequence,
                deferred_task_signature.osce_station_slug,
                station,
            )

        return (
            self._build_osce_task(plan_id, scheduled_date, station),
            fallback_focus_index,
            fallback_case_index,
            fallback_osce_index + 1,
        )

    def _build_final_approach_review_task(
        self,
        plan_id: int,
        scheduled_date: date,
        load_profile: UserStudyLoadProfile,
    ) -> PlanTask:
        return PlanTask(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            task_type=PlanTaskType.TEST,
            task_variant=PlanTaskVariant.FINAL_APPROACH_REVIEW,
            topic_id=None,
            task_title="Калибровочное смешанное повторение",
            questions_count=min(load_profile.mixed_test_question_count, FINAL_APPROACH_BROAD_REVIEW_QUESTION_CAP),
            estimated_minutes=min(load_profile.mixed_test_minutes, FINAL_APPROACH_BROAD_REVIEW_MINUTES_CAP),
            intent="control",
            target_route="learning_center",
        )

    def _build_recovery_review_task(
        self,
        plan_id: int,
        scheduled_date: date,
        load_profile: UserStudyLoadProfile,
    ) -> PlanTask:
        return PlanTask(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            task_type=PlanTaskType.TEST,
            task_variant=PlanTaskVariant.RECOVERY_REVIEW,
            topic_id=None,
            task_title="Восстановительное повторение",
            questions_count=min(load_profile.mixed_test_question_count, RECOVERY_REVIEW_QUESTION_CAP),
            estimated_minutes=min(load_profile.mixed_test_minutes, RECOVERY_REVIEW_MINUTES_CAP),
            intent="control",
            target_route="learning_center",
        )

    def _build_final_week_broad_review_task(
        self,
        plan_id: int,
        scheduled_date: date,
        load_profile: UserStudyLoadProfile,
    ) -> PlanTask:
        return PlanTask(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            task_type=PlanTaskType.TEST,
            task_variant=PlanTaskVariant.FINAL_WEEK_BROAD_REVIEW,
            topic_id=None,
            task_title="Финальное смешанное повторение",
            questions_count=min(load_profile.mixed_test_question_count, FINAL_WEEK_BROAD_REVIEW_QUESTION_CAP),
            estimated_minutes=min(load_profile.mixed_test_minutes, FINAL_WEEK_BROAD_REVIEW_MINUTES_CAP),
            intent="control",
            target_route="learning_center",
        )

    def _build_final_rehearsal_exam_task(self, plan_id: int, scheduled_date: date) -> PlanTask:
        return PlanTask(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            task_type=PlanTaskType.EXAM_SIM,
            task_variant=PlanTaskVariant.FINAL_REHEARSAL_EXAM,
            topic_id=None,
            task_title="Финальная репетиция: тестовый этап 80/60",
            questions_count=EXAM_SIM_QUESTION_COUNT,
            estimated_minutes=EXAM_SIM_MINUTES,
            intent="exam_checkpoint",
            exam_checkpoint_type="test_stage",
            target_route="accreditation_center",
        )

    def _build_final_rehearsal_case_task(
        self,
        plan_id: int,
        scheduled_date: date,
        case_sequence: list[PlannedTopic],
        fallback_focus_index: int,
        fallback_case_index: int,
        fallback_osce_index: int,
        day_offset: int,
        deferred_task_signature: DeferredTaskSignature | None,
    ) -> tuple[PlanTask, int, int, int]:
        topic = case_sequence[fallback_case_index % len(case_sequence)]

        if (
            day_offset == 0
            and deferred_task_signature is not None
            and deferred_task_signature.task_type == PlanTaskType.CASE
            and deferred_task_signature.topic_id is not None
        ):
            topic = self._select_next_topic(case_sequence, deferred_task_signature.topic_id, topic)

        return (
            PlanTask(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                task_type=PlanTaskType.CASE,
                task_variant=PlanTaskVariant.FINAL_REHEARSAL_CASE,
                topic_id=topic.topic.id,
                task_title=f"Финальная репетиция: кейсовый этап - {topic.topic.name}",
                questions_count=CASE_SIM_QUESTION_COUNT,
                estimated_minutes=CASE_SIM_MINUTES,
                intent="exam_checkpoint",
                exam_checkpoint_type="case_stage",
                target_route="accreditation_center",
            ),
            fallback_focus_index,
            fallback_case_index + 1,
            fallback_osce_index,
        )

    def _build_final_rehearsal_osce_task(
        self,
        plan_id: int,
        scheduled_date: date,
        osce_sequence: list[PlannedOsceStation],
        fallback_focus_index: int,
        fallback_case_index: int,
        fallback_osce_index: int,
        day_offset: int,
        deferred_task_signature: DeferredTaskSignature | None,
    ) -> tuple[PlanTask, int, int, int]:
        station = osce_sequence[fallback_osce_index % len(osce_sequence)]

        if (
            day_offset == 0
            and deferred_task_signature is not None
            and deferred_task_signature.task_type == PlanTaskType.OSCE
            and deferred_task_signature.osce_station_slug is not None
        ):
            station = self._select_next_osce_station(
                osce_sequence,
                deferred_task_signature.osce_station_slug,
                station,
            )

        return (
            PlanTask(
                plan_id=plan_id,
                scheduled_date=scheduled_date,
                task_type=PlanTaskType.OSCE,
                task_variant=PlanTaskVariant.FINAL_REHEARSAL_OSCE,
                topic_id=None,
                task_title=f"Финальная репетиция: практический этап - {station.title}",
                osce_station_slug=station.slug,
                questions_count=station.workload_units,
                estimated_minutes=station.duration_minutes,
                intent="exam_checkpoint",
                exam_checkpoint_type="osce_stage",
                target_route="accreditation_center",
            ),
            fallback_focus_index,
            fallback_case_index,
            fallback_osce_index + 1,
        )

    def _build_pre_accreditation_review_task(
        self,
        plan_id: int,
        scheduled_date: date,
        load_profile: UserStudyLoadProfile,
    ) -> PlanTask:
        return PlanTask(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            task_type=PlanTaskType.TEST,
            task_variant=PlanTaskVariant.PRE_ACCREDITATION_REVIEW,
            topic_id=None,
            task_title="Предэкзаменационное закрепление",
            questions_count=min(load_profile.mixed_test_question_count, PRE_ACCREDITATION_REVIEW_QUESTION_COUNT),
            estimated_minutes=min(load_profile.mixed_test_minutes, PRE_ACCREDITATION_REVIEW_MINUTES),
            intent="control",
            target_route="learning_center",
        )

    def _build_case_task(
        self,
        plan_id: int,
        scheduled_date: date,
        topic: PlannedTopic,
        load_profile: UserStudyLoadProfile,
    ) -> PlanTask:
        return PlanTask(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            task_type=PlanTaskType.CASE,
            task_variant=PlanTaskVariant.STANDARD,
            topic_id=topic.topic.id,
            task_title=f"Клинический кейс: {topic.topic.name}",
            questions_count=CASE_SIM_QUESTION_COUNT,
            estimated_minutes=load_profile.case_task_minutes,
            intent="training",
            target_route="cases",
        )

    def _build_exam_case_task(
        self,
        plan_id: int,
        scheduled_date: date,
        topic: PlannedTopic,
    ) -> PlanTask:
        return PlanTask(
            plan_id=plan_id,
            scheduled_date=scheduled_date,
            task_type=PlanTaskType.CASE,
            task_variant=PlanTaskVariant.FINAL_PHASE_CASE,
            topic_id=topic.topic.id,
            task_title=f"Экзаменационный кейс: {topic.topic.name}",
            questions_count=CASE_SIM_QUESTION_COUNT,
            estimated_minutes=CASE_SIM_MINUTES,
            intent="control",
            target_route="cases",
        )

    def _build_task_signature(self, task: PlanTask) -> DeferredTaskSignature:
        return DeferredTaskSignature(
            task_type=task.task_type,
            topic_id=task.topic_id,
            osce_station_slug=task.osce_station_slug,
        )

    def _select_next_topic(
        self,
        topics: list[PlannedTopic],
        excluded_topic_id: int,
        default_topic: PlannedTopic,
    ) -> PlannedTopic:
        if len(topics) <= 1 or default_topic.topic.id != excluded_topic_id:
            return default_topic

        for topic in topics:
            if topic.topic.id != excluded_topic_id:
                return topic

        return default_topic

    def _select_next_osce_station(
        self,
        osce_sequence: list[PlannedOsceStation],
        excluded_station_slug: str,
        default_station: PlannedOsceStation,
    ) -> PlannedOsceStation:
        if len(osce_sequence) <= 1 or default_station.slug != excluded_station_slug:
            return default_station

        for station in osce_sequence:
            if station.slug != excluded_station_slug:
                return station

        return default_station

    async def _record_regenerate_event(self, user: User, is_initial_plan: bool) -> None:
        next_task = await self._get_next_active_task(user.id)
        title = "План сформирован" if is_initial_plan else "План пересчитан"

        if next_task is None:
            description = "Сейчас в плане нет активных задач."
        else:
            description = (
                f"Ближайшая задача: {self._resolve_task_title(next_task)} "
                f"на {self._format_absolute_date(next_task.scheduled_date)}."
            )

        await self._add_plan_event(
            user_id=user.id,
            event_type="regenerated" if not is_initial_plan else "created",
            tone="green",
            title=title,
            description=description,
        )

    async def _record_skip_event(self, user: User, task: PlanTask) -> None:
        next_task = await self._get_next_active_task(user.id)

        if next_task is None:
            description = "После пропуска в плане не осталось активных задач."
        else:
            description = (
                f"Новый фокус: {self._resolve_task_title(next_task)} "
                f"на {self._format_absolute_date(next_task.scheduled_date)}."
            )

        await self._add_plan_event(
            user_id=user.id,
            event_type="skipped",
            tone="default",
            title=f"Задача пропущена: {self._resolve_task_title(task)}",
            description=description,
        )

    async def _record_postpone_event_explained(self, user: User, task: PlanTask) -> None:
        next_task = await self._get_next_active_task(user.id)
        next_focus_text = (
            f"Новый ближайший фокус: {self._resolve_task_title(next_task)} "
            f"на {self._format_absolute_date(next_task.scheduled_date)}."
            if next_task is not None
            else "Сейчас в плане больше нет активных задач."
        )

        await self._add_plan_event(
            user_id=user.id,
            event_type="postponed",
            tone="warm",
            title=f"Задача перенесена на {self._format_absolute_date(task.scheduled_date)}",
            description=(
                f'"{self._resolve_task_title(task)}" сдвинута на следующий учебный день. '
                f"План после этой точки пересчитан автоматически. {next_focus_text}"
            ),
        )

    async def _record_reschedule_event_explained(
        self,
        user: User,
        task: PlanTask,
        previous_date: date,
    ) -> None:
        next_task = await self._get_next_active_task(user.id)
        next_focus_text = (
            f"Новый ближайший фокус: {self._resolve_task_title(next_task)} "
            f"на {self._format_absolute_date(next_task.scheduled_date)}."
            if next_task is not None
            else "Сейчас в плане больше нет активных задач."
        )

        await self._add_plan_event(
            user_id=user.id,
            event_type="rescheduled",
            tone="warm",
            title=f"Задача перенесена на {self._format_absolute_date(task.scheduled_date)}",
            description=(
                f'"{self._resolve_task_title(task)}" перенесена с '
                f"{self._format_absolute_date(previous_date)}. "
                f"План после этой даты пересчитан автоматически. {next_focus_text}"
            ),
        )

    async def _record_completion_event(self, user: User, task: PlanTask) -> None:
        next_task = await self._get_next_active_task(user.id)
        completed_by_equivalent_practice = (
            getattr(task, "completion_source", None) == COMPLETION_SOURCE_EQUIVALENT_FREE_PRACTICE
        )

        if next_task is None:
            description = (
                "Свободная практика совпала с учебной задачей и закрыла ее. "
                "Текущие задачи на этом горизонте завершены."
                if completed_by_equivalent_practice
                else "Текущие задачи на этом горизонте завершены."
            )
        else:
            prefix = (
                "Свободная практика совпала с учебной задачей и закрыла ее; протокол пробной аккредитации не менялся. "
                if completed_by_equivalent_practice
                else ""
            )
            description = (
                f"{prefix}План адаптирован. Следующая задача: {self._resolve_task_title(next_task)} "
                f"на {self._format_absolute_date(next_task.scheduled_date)}."
            )

        await self._add_plan_event(
            user_id=user.id,
            event_type="completed",
            tone="green",
            title=(
                f"Задача закрыта свободной практикой: {self._resolve_task_title(task)}"
                if completed_by_equivalent_practice
                else f"Задача завершена: {self._resolve_task_title(task)}"
            ),
            description=description,
        )

    async def _record_study_preferences_updated_event(
        self,
        user: User,
        effective_from_date: date,
        previous_daily_study_minutes: int,
        previous_study_intensity: StudyIntensity,
        previous_study_weekdays: list[int],
    ) -> None:
        changes: list[str] = []

        if previous_daily_study_minutes != user.daily_study_minutes:
            changes.append(f"{previous_daily_study_minutes} -> {user.daily_study_minutes} мин/день")

        if previous_study_intensity != user.study_intensity:
            changes.append(
                f"{self._study_intensity_label(previous_study_intensity)} -> "
                f"{self._study_intensity_label(user.study_intensity)}"
            )

        if previous_study_weekdays != normalize_study_weekdays(user.study_weekdays):
            changes.append(
                f"{format_study_weekdays(previous_study_weekdays)} -> "
                f"{format_study_weekdays(user.study_weekdays)}"
            )

        current_profile = (
            f"Новый режим: {user.daily_study_minutes} мин/день, "
            f"{self._study_intensity_label(user.study_intensity).lower()}, "
            f"{format_study_weekdays(user.study_weekdays)}."
        )
        changes_text = f"Изменения: {', '.join(changes)}. " if changes else ""
        description = (
            f"{changes_text}{current_profile} Новый темп применяется к плану начиная с "
            f"{self._format_absolute_date(effective_from_date)}."
        )

        await self._add_plan_event(
            user_id=user.id,
            event_type="preferences_updated",
            tone="accent",
            title="Темп подготовки обновлен",
            description=description,
        )

    async def _record_catch_up_event(
        self,
        *,
        user: User,
        missed_count: int,
        oldest_date: date,
        latest_date: date,
        rebuild_start_date: date,
    ) -> None:
        if oldest_date == latest_date:
            missed_range = self._format_absolute_date(oldest_date)
        else:
            missed_range = f"{self._format_absolute_date(oldest_date)} - {self._format_absolute_date(latest_date)}"

        description = (
            "План устарел: до аккредитации осталось меньше времени, поэтому маршрут пересобран с "
            f"{self._format_absolute_date(rebuild_start_date)}. Просроченных задач сохранено как "
            f"stale/missed: {missed_count} ({missed_range})."
        )

        await self._add_plan_event(
            user_id=user.id,
            event_type="catch_up",
            tone="warm",
            title="План устарел: маршрут пересобран",
            description=description,
        )

    async def _record_remediation_event(
        self,
        *,
        user: User,
        stage_key: str,
        remediation_plan: dict,
        first_task: PlanTask | None,
    ) -> None:
        summary = str(remediation_plan.get("summary") or remediation_plan.get("reason") or "").strip()
        stage_label = self._remediation_stage_label(stage_key)

        if first_task is None:
            next_step = "До даты аккредитации нет доступного учебного дня, поэтому маршрут не был дополнен задачей."
        else:
            next_step = (
                f"Ближайшая remediation-задача: {self._resolve_task_title(first_task)} "
                f"на {self._format_absolute_date(first_task.scheduled_date)}."
            )

        description = f"{summary} {next_step}".strip()

        await self._add_plan_event(
            user_id=user.id,
            event_type="remediation_started",
            tone="accent",
            title=f"План перестроен после провала: {stage_label}",
            description=description,
        )

    async def _record_stage_success_event(
        self,
        *,
        user: User,
        stage_key: str,
        simulation_id: UUID,
        rebuild_start_date: date | None,
    ) -> None:
        stage_label = self._remediation_stage_label(stage_key)
        if rebuild_start_date is None:
            next_step = "До даты аккредитации нет доступного учебного дня, поэтому новых учебных задач не добавлено."
        else:
            next_step = (
                "Будущие задачи пересобраны с "
                f"{self._format_absolute_date(rebuild_start_date)}: подтвержденный трек переходит в поддержание, "
                "а основной фокус смещается на еще не закрытые этапы."
            )

        await self._add_plan_event(
            user_id=user.id,
            event_type="simulation_stage_passed",
            tone="green",
            title=f"Этап пробной аккредитации подтвержден: {stage_label}",
            description=f"Протокол зафиксировал сдачу этапа в пробной аккредитации {simulation_id}. {next_step}",
        )

    @staticmethod
    def _remediation_stage_label(stage_key: str) -> str:
        if stage_key == "tests":
            return "тестовый этап"

        if stage_key == "cases":
            return "кейсовый этап"

        if stage_key == "osce":
            return "практический этап"

        return "этап пробной аккредитации"

    async def _get_next_active_task(self, user_id: int) -> PlanTask | None:
        await self.session.flush()
        return await self.study_plan_repository.get_next_active_task_for_user(user_id)

    async def _resolve_schedule_focus_date(self, user_id: int, server_today: date) -> date:
        next_active_task = await self.study_plan_repository.get_next_active_task_for_user(user_id)

        if next_active_task is not None and next_active_task.scheduled_date < server_today:
            return next_active_task.scheduled_date

        return server_today

    async def _add_plan_event(
        self,
        user_id: int,
        event_type: str,
        tone: str,
        title: str,
        description: str,
    ) -> None:
        await self.session.flush()
        latest_event = await self.plan_event_repository.get_latest_by_user(user_id)

        if (
            latest_event is not None
            and latest_event.event_type == event_type
            and latest_event.tone == tone
            and latest_event.title == title
            and latest_event.description == description
        ):
            return

        self.plan_event_repository.add(
            PlanEvent(
                user_id=user_id,
                event_type=event_type,
                tone=tone,
                title=title,
                description=description,
            )
        )

    def _format_absolute_date(self, value: date) -> str:
        month_name = RUSSIAN_MONTH_NAMES.get(value.month, "")
        return f"{value.day:02d} {month_name} {value.year}"

    def _resolve_task_intent(self, task: PlanTask) -> str:
        explicit_intent = getattr(task, "intent", None)

        if explicit_intent in {"control", "remediation", "exam_checkpoint"}:
            return explicit_intent

        if (
            task.task_type == PlanTaskType.EXAM_SIM
            or self._is_final_rehearsal_case_task(task)
            or self._is_final_rehearsal_osce_task(task)
        ):
            return "exam_checkpoint"

        if (
            self._is_final_approach_review_task(task)
            or self._is_recovery_review_task(task)
            or self._is_final_week_broad_review_task(task)
            or self._is_pre_accreditation_review_task(task)
            or self._is_final_phase_case_task(task)
        ):
            return "control"

        return explicit_intent or "training"

    def _resolve_task_exam_checkpoint_type(self, task: PlanTask) -> str | None:
        if self._resolve_task_intent(task) != "exam_checkpoint":
            return None

        if task.task_type == PlanTaskType.EXAM_SIM:
            return "test_stage"

        if self._is_final_rehearsal_case_task(task):
            return "case_stage"

        if self._is_final_rehearsal_osce_task(task):
            return "osce_stage"

        return getattr(task, "exam_checkpoint_type", None)

    def _resolve_task_target_route(self, task: PlanTask) -> str:
        if self._resolve_task_intent(task) == "exam_checkpoint":
            return "accreditation_center"

        if task.task_type == PlanTaskType.CASE:
            return "cases"

        if task.task_type == PlanTaskType.OSCE:
            return "osce"

        return getattr(task, "target_route", None) or "learning_center"

    def _resolve_task_title(self, task: PlanTask) -> str:
        if task.task_title:
            return task.task_title

        if self._is_final_approach_review_task(task):
            return "Калибровочное смешанное повторение"

        if self._is_recovery_review_task(task):
            return "Восстановительное повторение"

        if self._is_final_week_broad_review_task(task):
            return "Финальное смешанное повторение"

        if self._is_pre_accreditation_review_task(task):
            return "Предэкзаменационное закрепление"

        if self._is_final_rehearsal_exam_task(task):
            return "Финальная репетиция: тестовый этап 80/60"

        if self._is_final_rehearsal_case_task(task):
            if task.topic is not None:
                return f"Финальная репетиция: кейсовый этап - {task.topic.name}"
            return "Финальная репетиция: кейсовый этап"

        if self._is_final_rehearsal_osce_task(task):
            if task.osce_station_slug:
                return f"Финальная репетиция: практический этап - {task.osce_station_slug}"
            return "Финальная репетиция: практический этап"

        if self._is_final_phase_case_task(task):
            if task.topic is not None:
                return f"Экзаменационный кейс: {task.topic.name}"
            return "Экзаменационный кейс"

        if task.task_type == PlanTaskType.EXAM_SIM:
            return "Пробная аккредитация"

        if task.task_type == PlanTaskType.OSCE:
            return "Станция ОСКЭ"

        if task.task_type == PlanTaskType.CASE:
            if task.topic is not None:
                return f"Клинический кейс: {task.topic.name}"
            return "Клинический кейс"

        if task.topic is not None:
            return f"Тест по теме: {task.topic.name}"

        return "Смешанный тренировочный тест"

    def _is_final_phase_case_task(self, task: PlanTask) -> bool:
        return self._has_task_variant(task, PlanTaskVariant.FINAL_PHASE_CASE)

    def _study_intensity_label(self, value: StudyIntensity) -> str:
        if value == StudyIntensity.GENTLE:
            return "Мягкий режим"

        if value == StudyIntensity.INTENSIVE:
            return "Интенсивный режим"

        return "Сбалансированный режим"

    def _to_float(self, value: Decimal | float | int) -> float:
        return round(float(value), 2)

    def _latest_datetime(self, *values: datetime | None) -> datetime | None:
        defined_values = [value for value in values if value is not None]
        return max(defined_values) if defined_values else None

    def _days_since(self, value: datetime | None) -> int | None:
        if value is None:
            return None

        if value.tzinfo is None:
            normalized = value.replace(tzinfo=timezone.utc)
        else:
            normalized = value.astimezone(timezone.utc)

        return max((utc_now() - normalized).days, 0)

    def _is_recent_activity(self, value: datetime | None) -> bool:
        days_since = self._days_since(value)
        return days_since is not None and days_since <= RECENT_ACTIVITY_WINDOW_DAYS

    def _calculate_optional_accuracy_percent(self, correct_answers: int, answered_questions: int) -> float | None:
        if answered_questions <= 0:
            return None

        return round((correct_answers / answered_questions) * 100, 2)

    def _clamp_ratio(self, value: float, minimum: float, maximum: float) -> float:
        return max(minimum, min(value, maximum))

    def _clamp_int(self, value: int, minimum: int, maximum: int) -> int:
        return max(minimum, min(value, maximum))
