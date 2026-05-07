from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.clinical_case_attempt import ClinicalCaseAttempt
from app.models.daily_stat import DailyStat
from app.models.enums import QuestionDifficulty, TestSessionMode, TestSessionStatus
from app.models.osce_attempt import OsceAttempt
from app.models.question import Question
from app.models.section import Section
from app.models.test_session import TestSession
from app.models.test_session_answer import TestSessionAnswer
from app.models.topic import Topic
from app.services.evidence_context import ATTEMPT_CONTEXT_CONTROL, ATTEMPT_CONTEXT_INITIAL_DIAGNOSTIC


@dataclass
class OverviewMetrics:
    total_answered: int
    correct_answers: int
    completed_sessions: int
    initial_diagnostic_completed: bool
    latest_initial_diagnostic_score_percent: float | None
    non_diagnostic_completed_sessions: int


@dataclass
class TopicMetrics:
    topic_id: int
    topic_name: str
    section_name: str
    answered_questions: int
    correct_answers: int
    test_incorrect_answers: int
    case_attempts_count: int
    repeated_question_struggles: int
    hard_question_attempts: int
    hard_question_correct_answers: int
    last_test_activity_at: datetime | None
    last_test_incorrect_at: datetime | None
    last_case_activity_at: datetime | None
    last_case_low_score_at: datetime | None


@dataclass
class CaseAttemptMetrics:
    id: UUID
    case_slug: str
    case_title: str
    topic_id: int | None
    topic_name: str | None
    answered_questions: int
    correct_answers: int
    accuracy_percent: float
    study_minutes: int
    submitted_at: datetime


@dataclass
class RepeatingQuestionErrorMetrics:
    question_id: int
    question_text: str
    difficulty: QuestionDifficulty
    topic_id: int | None
    topic_name: str | None
    section_name: str | None
    attempts_count: int
    incorrect_answers: int
    correct_answers: int
    last_seen_at: datetime
    last_incorrect_at: datetime | None


@dataclass
class TopicQuestionErrorMetrics:
    question_id: int
    question_text: str
    difficulty: QuestionDifficulty
    attempts_count: int
    incorrect_answers: int
    correct_answers: int
    last_seen_at: datetime
    last_incorrect_at: datetime | None


@dataclass
class TestReadinessMetrics:
    exam_attempts_count: int
    average_exam_score: float | None
    best_exam_score: float | None
    last_exam_finished_at: datetime | None


@dataclass
class ReadinessAggregateMetrics:
    exam_attempts_count: int
    average_exam_score: float | None
    best_exam_score: float | None
    last_exam_finished_at: datetime | None
    full_exam_attempts_count: int
    latest_full_exam_score: float | None
    latest_full_exam_finished_at: datetime | None
    case_attempts_count: int
    case_topics_count: int
    average_case_accuracy: float | None
    best_case_accuracy: float | None
    recent_case_accuracy: float | None
    recent_case_attempts_count: int
    weak_case_attempts_count: int
    last_case_attempt_at: datetime | None
    total_osce_attempts_count: int
    recent_osce_attempts_count: int
    average_recent_osce_score: float | None
    last_osce_attempt_at: datetime | None


@dataclass
class OsceStationBestScoreMetrics:
    station_slug: str
    best_score: float


class AnalyticsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _initial_diagnostic_filter(user_id: int):
        first_session = aliased(TestSession)
        first_finished_at = (
            select(func.min(first_session.finished_at))
            .where(
                first_session.user_id == user_id,
                first_session.status == TestSessionStatus.FINISHED,
            )
            .scalar_subquery()
        )

        legacy_start_diagnostic = and_(
            TestSession.attempt_context == ATTEMPT_CONTEXT_CONTROL,
            TestSession.mode == TestSessionMode.EXAM,
            TestSession.topic_id.is_(None),
            TestSession.planned_task_id.is_(None),
            TestSession.simulation_id.is_(None),
            TestSession.total_questions == 30,
            TestSession.finished_at == first_finished_at,
        )

        return or_(TestSession.attempt_context == ATTEMPT_CONTEXT_INITIAL_DIAGNOSTIC, legacy_start_diagnostic)

    async def get_overview_metrics(self, user_id: int) -> OverviewMetrics:
        initial_diagnostic_filter = self._initial_diagnostic_filter(user_id)
        test_answer_metrics_subquery = (
            select(
                func.count(TestSessionAnswer.id).label("answered_questions"),
                func.coalesce(
                    func.sum(case((TestSessionAnswer.is_correct.is_(True), 1), else_=0)),
                    0,
                ).label("correct_answers"),
            )
            .join(TestSession, TestSession.id == TestSessionAnswer.session_id)
            .where(TestSession.user_id == user_id)
            .subquery()
        )
        test_session_metrics_subquery = (
            select(
                func.count(TestSession.id).label("completed_sessions"),
                func.coalesce(
                    func.sum(case((initial_diagnostic_filter, 1), else_=0)),
                    0,
                ).label("initial_diagnostic_sessions"),
                func.coalesce(
                    func.sum(case((~initial_diagnostic_filter, 1), else_=0)),
                    0,
                ).label("non_diagnostic_completed_sessions"),
            )
            .where(
                TestSession.user_id == user_id,
                TestSession.status == TestSessionStatus.FINISHED,
            )
            .subquery()
        )
        latest_initial_diagnostic_score = (
            select(TestSession.score_percent)
            .where(
                TestSession.user_id == user_id,
                TestSession.status == TestSessionStatus.FINISHED,
                initial_diagnostic_filter,
            )
            .order_by(TestSession.finished_at.desc(), TestSession.id.desc())
            .limit(1)
            .scalar_subquery()
        )
        case_metrics_subquery = (
            select(
                func.coalesce(func.sum(ClinicalCaseAttempt.answered_questions), 0).label("answered_questions"),
                func.coalesce(func.sum(ClinicalCaseAttempt.correct_answers), 0).label("correct_answers"),
                func.count(ClinicalCaseAttempt.id).label("completed_sessions"),
            )
            .where(ClinicalCaseAttempt.user_id == user_id)
            .subquery()
        )
        osce_metrics_subquery = (
            select(func.count(OsceAttempt.id).label("completed_sessions"))
            .where(OsceAttempt.user_id == user_id)
            .subquery()
        )

        result = await self.session.execute(
            select(
                (
                    func.coalesce(test_answer_metrics_subquery.c.answered_questions, 0)
                    + func.coalesce(case_metrics_subquery.c.answered_questions, 0)
                ),
                (
                    func.coalesce(test_answer_metrics_subquery.c.correct_answers, 0)
                    + func.coalesce(case_metrics_subquery.c.correct_answers, 0)
                ),
                (
                    func.coalesce(test_session_metrics_subquery.c.completed_sessions, 0)
                    + func.coalesce(case_metrics_subquery.c.completed_sessions, 0)
                    + func.coalesce(osce_metrics_subquery.c.completed_sessions, 0)
                ),
                func.coalesce(test_session_metrics_subquery.c.initial_diagnostic_sessions, 0),
                latest_initial_diagnostic_score,
                (
                    func.coalesce(test_session_metrics_subquery.c.non_diagnostic_completed_sessions, 0)
                    + func.coalesce(case_metrics_subquery.c.completed_sessions, 0)
                    + func.coalesce(osce_metrics_subquery.c.completed_sessions, 0)
                ),
            )
            .select_from(test_answer_metrics_subquery)
            .join(test_session_metrics_subquery, true())
            .join(case_metrics_subquery, true())
            .join(osce_metrics_subquery, true())
        )
        row = result.one()

        return OverviewMetrics(
            total_answered=int(row[0] or 0),
            correct_answers=int(row[1] or 0),
            completed_sessions=int(row[2] or 0),
            initial_diagnostic_completed=int(row[3] or 0) > 0,
            latest_initial_diagnostic_score_percent=float(row[4]) if row[4] is not None else None,
            non_diagnostic_completed_sessions=int(row[5] or 0),
        )

    async def list_topic_metrics(self, user_id: int, faculty_id: int) -> list[TopicMetrics]:
        test_question_metrics_subquery = (
            select(
                Question.id.label("question_id"),
                Question.topic_id.label("topic_id"),
                Question.difficulty.label("difficulty"),
                func.count(TestSessionAnswer.id).label("answered_questions"),
                func.coalesce(
                    func.sum(case((TestSessionAnswer.is_correct.is_(True), 1), else_=0)),
                    0,
                ).label("correct_answers"),
                func.coalesce(
                    func.sum(case((TestSessionAnswer.is_correct.is_(False), 1), else_=0)),
                    0,
                ).label("incorrect_answers"),
                func.max(TestSessionAnswer.answered_at).label("last_activity_at"),
                func.max(
                    case((TestSessionAnswer.is_correct.is_(False), TestSessionAnswer.answered_at), else_=None)
                ).label("last_incorrect_at"),
            )
            .join(TestSessionAnswer, TestSessionAnswer.question_id == Question.id)
            .join(TestSession, TestSession.id == TestSessionAnswer.session_id)
            .join(Topic, Topic.id == Question.topic_id)
            .join(Section, Section.id == Topic.section_id)
            .where(
                TestSession.user_id == user_id,
                Question.topic_id.is_not(None),
                Section.faculty_id == faculty_id,
            )
            .group_by(Question.id, Question.topic_id, Question.difficulty)
            .subquery()
        )

        test_metrics_subquery = (
            select(
                test_question_metrics_subquery.c.topic_id,
                func.coalesce(func.sum(test_question_metrics_subquery.c.answered_questions), 0).label("answered_questions"),
                func.coalesce(func.sum(test_question_metrics_subquery.c.correct_answers), 0).label("correct_answers"),
                func.coalesce(func.sum(test_question_metrics_subquery.c.incorrect_answers), 0).label("incorrect_answers"),
                func.max(test_question_metrics_subquery.c.last_activity_at).label("last_activity_at"),
                func.max(test_question_metrics_subquery.c.last_incorrect_at).label("last_incorrect_at"),
                func.coalesce(
                    func.sum(
                        case(
                            (test_question_metrics_subquery.c.incorrect_answers >= 2, 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("repeated_question_struggles"),
                func.coalesce(
                    func.sum(
                        case(
                            (test_question_metrics_subquery.c.difficulty == QuestionDifficulty.HARD, test_question_metrics_subquery.c.answered_questions),
                            else_=0,
                        )
                    ),
                    0,
                ).label("hard_question_attempts"),
                func.coalesce(
                    func.sum(
                        case(
                            (test_question_metrics_subquery.c.difficulty == QuestionDifficulty.HARD, test_question_metrics_subquery.c.correct_answers),
                            else_=0,
                        )
                    ),
                    0,
                ).label("hard_question_correct_answers"),
            )
            .group_by(test_question_metrics_subquery.c.topic_id)
            .subquery()
        )

        case_metrics_subquery = (
            select(
                ClinicalCaseAttempt.topic_id.label("topic_id"),
                func.coalesce(func.sum(ClinicalCaseAttempt.answered_questions), 0).label("answered_questions"),
                func.coalesce(func.sum(ClinicalCaseAttempt.correct_answers), 0).label("correct_answers"),
                func.count(ClinicalCaseAttempt.id).label("attempts_count"),
                func.max(ClinicalCaseAttempt.submitted_at).label("last_activity_at"),
                func.max(
                    case((ClinicalCaseAttempt.accuracy_percent < 70, ClinicalCaseAttempt.submitted_at), else_=None)
                ).label("last_low_score_at"),
            )
            .join(Topic, Topic.id == ClinicalCaseAttempt.topic_id)
            .join(Section, Section.id == Topic.section_id)
            .where(
                ClinicalCaseAttempt.user_id == user_id,
                ClinicalCaseAttempt.topic_id.is_not(None),
                Section.faculty_id == faculty_id,
            )
            .group_by(ClinicalCaseAttempt.topic_id)
            .subquery()
        )

        result = await self.session.execute(
            select(
                Topic.id,
                Topic.name,
                Section.name,
                (
                    func.coalesce(test_metrics_subquery.c.answered_questions, 0)
                    + func.coalesce(case_metrics_subquery.c.answered_questions, 0)
                ),
                (
                    func.coalesce(test_metrics_subquery.c.correct_answers, 0)
                    + func.coalesce(case_metrics_subquery.c.correct_answers, 0)
                ),
                func.coalesce(test_metrics_subquery.c.incorrect_answers, 0),
                func.coalesce(case_metrics_subquery.c.attempts_count, 0),
                func.coalesce(test_metrics_subquery.c.repeated_question_struggles, 0),
                func.coalesce(test_metrics_subquery.c.hard_question_attempts, 0),
                func.coalesce(test_metrics_subquery.c.hard_question_correct_answers, 0),
                test_metrics_subquery.c.last_activity_at,
                test_metrics_subquery.c.last_incorrect_at,
                case_metrics_subquery.c.last_activity_at,
                case_metrics_subquery.c.last_low_score_at,
            )
            .join(Topic.section)
            .outerjoin(test_metrics_subquery, test_metrics_subquery.c.topic_id == Topic.id)
            .outerjoin(case_metrics_subquery, case_metrics_subquery.c.topic_id == Topic.id)
            .where(Section.faculty_id == faculty_id)
            .order_by(Section.order_index.asc(), Topic.order_index.asc(), Topic.name.asc())
        )

        return [
            TopicMetrics(
                topic_id=row[0],
                topic_name=row[1],
                section_name=row[2],
                answered_questions=int(row[3] or 0),
                correct_answers=int(row[4] or 0),
                test_incorrect_answers=int(row[5] or 0),
                case_attempts_count=int(row[6] or 0),
                repeated_question_struggles=int(row[7] or 0),
                hard_question_attempts=int(row[8] or 0),
                hard_question_correct_answers=int(row[9] or 0),
                last_test_activity_at=row[10],
                last_test_incorrect_at=row[11],
                last_case_activity_at=row[12],
                last_case_low_score_at=row[13],
            )
            for row in result.all()
        ]

    async def list_repeating_question_errors(
        self,
        user_id: int,
        faculty_id: int,
        limit: int,
    ) -> list[RepeatingQuestionErrorMetrics]:
        incorrect_answers_count = func.coalesce(
            func.sum(case((TestSessionAnswer.is_correct.is_(False), 1), else_=0)),
            0,
        )
        correct_answers_count = func.coalesce(
            func.sum(case((TestSessionAnswer.is_correct.is_(True), 1), else_=0)),
            0,
        )

        result = await self.session.execute(
            select(
                Question.id,
                Question.text,
                Question.difficulty,
                Question.topic_id,
                Topic.name,
                Section.name,
                func.count(TestSessionAnswer.id).label("attempts_count"),
                incorrect_answers_count.label("incorrect_answers"),
                correct_answers_count.label("correct_answers"),
                func.max(TestSessionAnswer.answered_at).label("last_seen_at"),
                func.max(
                    case((TestSessionAnswer.is_correct.is_(False), TestSessionAnswer.answered_at), else_=None)
                ).label("last_incorrect_at"),
            )
            .join(TestSessionAnswer, TestSessionAnswer.question_id == Question.id)
            .join(TestSession, TestSession.id == TestSessionAnswer.session_id)
            .join(Topic, Topic.id == Question.topic_id)
            .join(Section, Section.id == Topic.section_id)
            .where(
                TestSession.user_id == user_id,
                Section.faculty_id == faculty_id,
                Question.topic_id.is_not(None),
            )
            .group_by(
                Question.id,
                Question.text,
                Question.difficulty,
                Question.topic_id,
                Topic.name,
                Section.name,
            )
            .having(incorrect_answers_count >= 2)
            .order_by(
                incorrect_answers_count.desc(),
                func.count(TestSessionAnswer.id).desc(),
                func.max(
                    case((TestSessionAnswer.is_correct.is_(False), TestSessionAnswer.answered_at), else_=None)
                ).desc(),
                Question.id.desc(),
            )
            .limit(limit)
        )

        return [
            RepeatingQuestionErrorMetrics(
                question_id=row[0],
                question_text=row[1],
                difficulty=row[2],
                topic_id=row[3],
                topic_name=row[4],
                section_name=row[5],
                attempts_count=int(row[6] or 0),
                incorrect_answers=int(row[7] or 0),
                correct_answers=int(row[8] or 0),
                last_seen_at=row[9],
                last_incorrect_at=row[10],
            )
            for row in result.all()
        ]

    async def list_topic_question_errors(
        self,
        user_id: int,
        faculty_id: int,
        topic_id: int,
        limit: int,
    ) -> list[TopicQuestionErrorMetrics]:
        incorrect_answers_count = func.coalesce(
            func.sum(case((TestSessionAnswer.is_correct.is_(False), 1), else_=0)),
            0,
        )
        correct_answers_count = func.coalesce(
            func.sum(case((TestSessionAnswer.is_correct.is_(True), 1), else_=0)),
            0,
        )

        result = await self.session.execute(
            select(
                Question.id,
                Question.text,
                Question.difficulty,
                func.count(TestSessionAnswer.id).label("attempts_count"),
                incorrect_answers_count.label("incorrect_answers"),
                correct_answers_count.label("correct_answers"),
                func.max(TestSessionAnswer.answered_at).label("last_seen_at"),
                func.max(
                    case((TestSessionAnswer.is_correct.is_(False), TestSessionAnswer.answered_at), else_=None)
                ).label("last_incorrect_at"),
            )
            .join(TestSessionAnswer, TestSessionAnswer.question_id == Question.id)
            .join(TestSession, TestSession.id == TestSessionAnswer.session_id)
            .join(Topic, Topic.id == Question.topic_id)
            .join(Section, Section.id == Topic.section_id)
            .where(
                TestSession.user_id == user_id,
                Question.topic_id == topic_id,
                Section.faculty_id == faculty_id,
            )
            .group_by(
                Question.id,
                Question.text,
                Question.difficulty,
            )
            .having(incorrect_answers_count >= 1)
            .order_by(
                incorrect_answers_count.desc(),
                func.count(TestSessionAnswer.id).desc(),
                func.max(
                    case((TestSessionAnswer.is_correct.is_(False), TestSessionAnswer.answered_at), else_=None)
                ).desc(),
                Question.id.desc(),
            )
            .limit(limit)
        )

        return [
            TopicQuestionErrorMetrics(
                question_id=row[0],
                question_text=row[1],
                difficulty=row[2],
                attempts_count=int(row[3] or 0),
                incorrect_answers=int(row[4] or 0),
                correct_answers=int(row[5] or 0),
                last_seen_at=row[6],
                last_incorrect_at=row[7],
            )
            for row in result.all()
        ]

    async def get_latest_incorrect_option_labels(self, user_id: int, question_ids: list[int]) -> dict[int, str]:
        if not question_ids:
            return {}

        result = await self.session.execute(
            select(
                TestSessionAnswer.question_id,
                TestSessionAnswer.selected_option_label,
            )
            .join(TestSession, TestSession.id == TestSessionAnswer.session_id)
            .where(
                TestSession.user_id == user_id,
                TestSessionAnswer.question_id.in_(question_ids),
                TestSessionAnswer.is_correct.is_(False),
            )
            .order_by(
                TestSessionAnswer.question_id.asc(),
                TestSessionAnswer.answered_at.desc(),
                TestSessionAnswer.id.desc(),
            )
        )

        latest_labels: dict[int, str] = {}

        for question_id, selected_option_label in result.all():
            if question_id not in latest_labels and selected_option_label:
                latest_labels[int(question_id)] = str(selected_option_label)

        return latest_labels

    async def list_recent_case_attempts(self, user_id: int, limit: int) -> list[CaseAttemptMetrics]:
        result = await self.session.execute(
            select(
                ClinicalCaseAttempt.id,
                ClinicalCaseAttempt.case_slug,
                ClinicalCaseAttempt.case_title,
                ClinicalCaseAttempt.topic_id,
                Topic.name,
                ClinicalCaseAttempt.answered_questions,
                ClinicalCaseAttempt.correct_answers,
                ClinicalCaseAttempt.accuracy_percent,
                ClinicalCaseAttempt.study_minutes,
                ClinicalCaseAttempt.submitted_at,
            )
            .outerjoin(Topic, Topic.id == ClinicalCaseAttempt.topic_id)
            .where(ClinicalCaseAttempt.user_id == user_id)
            .order_by(ClinicalCaseAttempt.submitted_at.desc(), ClinicalCaseAttempt.id.desc())
            .limit(limit)
        )

        return [
            CaseAttemptMetrics(
                id=row[0],
                case_slug=row[1],
                case_title=row[2],
                topic_id=row[3],
                topic_name=row[4],
                answered_questions=int(row[5] or 0),
                correct_answers=int(row[6] or 0),
                accuracy_percent=float(row[7] or 0),
                study_minutes=int(row[8] or 0),
                submitted_at=row[9],
            )
            for row in result.all()
        ]

    async def get_test_readiness_metrics(self, user_id: int) -> TestReadinessMetrics:
        result = await self.session.execute(
            select(
                func.count(TestSession.id),
                func.avg(TestSession.score_percent),
                func.max(TestSession.score_percent),
                func.max(TestSession.finished_at),
            ).where(
                TestSession.user_id == user_id,
                TestSession.status == TestSessionStatus.FINISHED,
                TestSession.mode == TestSessionMode.EXAM,
                ~self._initial_diagnostic_filter(user_id),
            )
        )
        row = result.one()

        return TestReadinessMetrics(
            exam_attempts_count=int(row[0] or 0),
            average_exam_score=float(row[1]) if row[1] is not None else None,
            best_exam_score=float(row[2]) if row[2] is not None else None,
            last_exam_finished_at=row[3],
        )

    async def get_readiness_aggregate_metrics(
        self,
        user_id: int,
        recent_activity_since: datetime,
    ) -> ReadinessAggregateMetrics:
        test_metrics_subquery = (
            select(
                func.count(TestSession.id).label("exam_attempts_count"),
                func.avg(TestSession.score_percent).label("average_exam_score"),
                func.max(TestSession.score_percent).label("best_exam_score"),
                func.max(TestSession.finished_at).label("last_exam_finished_at"),
            )
            .where(
                TestSession.user_id == user_id,
                TestSession.status == TestSessionStatus.FINISHED,
                TestSession.mode == TestSessionMode.EXAM,
                ~self._initial_diagnostic_filter(user_id),
            )
            .subquery()
        )
        full_exam_metrics_subquery = (
            select(
                func.count(TestSession.id).label("attempts_count"),
                func.max(TestSession.finished_at).label("latest_finished_at"),
            )
            .where(
                TestSession.user_id == user_id,
                TestSession.status == TestSessionStatus.FINISHED,
                TestSession.mode == TestSessionMode.EXAM,
                ~self._initial_diagnostic_filter(user_id),
                TestSession.total_questions >= 80,
            )
            .subquery()
        )
        latest_full_exam_score_subquery = (
            select(TestSession.score_percent)
            .where(
                TestSession.user_id == user_id,
                TestSession.status == TestSessionStatus.FINISHED,
                TestSession.mode == TestSessionMode.EXAM,
                ~self._initial_diagnostic_filter(user_id),
                TestSession.total_questions >= 80,
            )
            .order_by(TestSession.finished_at.desc(), TestSession.id.desc())
            .limit(1)
            .scalar_subquery()
        )
        case_metrics_subquery = (
            select(
                func.count(ClinicalCaseAttempt.id).label("attempts_count"),
                func.count(func.distinct(ClinicalCaseAttempt.topic_id)).label("topics_count"),
                func.avg(ClinicalCaseAttempt.accuracy_percent).label("average_accuracy"),
                func.max(ClinicalCaseAttempt.accuracy_percent).label("best_accuracy"),
                func.coalesce(
                    func.sum(case((ClinicalCaseAttempt.accuracy_percent < 70, 1), else_=0)),
                    0,
                ).label("weak_attempts_count"),
                func.coalesce(
                    func.sum(case((ClinicalCaseAttempt.submitted_at >= recent_activity_since, 1), else_=0)),
                    0,
                ).label("recent_attempts_count"),
                func.avg(
                    case(
                        (ClinicalCaseAttempt.submitted_at >= recent_activity_since, ClinicalCaseAttempt.accuracy_percent),
                        else_=None,
                    )
                ).label("recent_accuracy"),
                func.max(ClinicalCaseAttempt.submitted_at).label("last_attempt_at"),
            )
            .where(ClinicalCaseAttempt.user_id == user_id)
            .subquery()
        )
        osce_metrics_subquery = (
            select(
                func.count(OsceAttempt.id).label("total_attempts_count"),
                func.coalesce(
                    func.sum(case((OsceAttempt.submitted_at >= recent_activity_since, 1), else_=0)),
                    0,
                ).label("recent_attempts_count"),
                func.avg(
                    case(
                        (OsceAttempt.submitted_at >= recent_activity_since, OsceAttempt.total_score_percent),
                        else_=None,
                    )
                ).label("average_recent_score"),
                func.max(OsceAttempt.submitted_at).label("last_attempt_at"),
            )
            .where(OsceAttempt.user_id == user_id)
            .subquery()
        )

        result = await self.session.execute(
            select(
                test_metrics_subquery.c.exam_attempts_count,
                test_metrics_subquery.c.average_exam_score,
                test_metrics_subquery.c.best_exam_score,
                test_metrics_subquery.c.last_exam_finished_at,
                full_exam_metrics_subquery.c.attempts_count,
                latest_full_exam_score_subquery,
                full_exam_metrics_subquery.c.latest_finished_at,
                case_metrics_subquery.c.attempts_count,
                case_metrics_subquery.c.topics_count,
                case_metrics_subquery.c.average_accuracy,
                case_metrics_subquery.c.best_accuracy,
                case_metrics_subquery.c.recent_accuracy,
                case_metrics_subquery.c.recent_attempts_count,
                case_metrics_subquery.c.weak_attempts_count,
                case_metrics_subquery.c.last_attempt_at,
                osce_metrics_subquery.c.total_attempts_count,
                osce_metrics_subquery.c.recent_attempts_count,
                osce_metrics_subquery.c.average_recent_score,
                osce_metrics_subquery.c.last_attempt_at,
            )
            .select_from(test_metrics_subquery)
            .join(case_metrics_subquery, true())
            .join(osce_metrics_subquery, true())
            .join(full_exam_metrics_subquery, true())
        )
        row = result.one()

        return ReadinessAggregateMetrics(
            exam_attempts_count=int(row[0] or 0),
            average_exam_score=float(row[1]) if row[1] is not None else None,
            best_exam_score=float(row[2]) if row[2] is not None else None,
            last_exam_finished_at=row[3],
            full_exam_attempts_count=int(row[4] or 0),
            latest_full_exam_score=float(row[5]) if row[5] is not None else None,
            latest_full_exam_finished_at=row[6],
            case_attempts_count=int(row[7] or 0),
            case_topics_count=int(row[8] or 0),
            average_case_accuracy=float(row[9]) if row[9] is not None else None,
            best_case_accuracy=float(row[10]) if row[10] is not None else None,
            recent_case_accuracy=float(row[11]) if row[11] is not None else None,
            recent_case_attempts_count=int(row[12] or 0),
            weak_case_attempts_count=int(row[13] or 0),
            last_case_attempt_at=row[14],
            total_osce_attempts_count=int(row[15] or 0),
            recent_osce_attempts_count=int(row[16] or 0),
            average_recent_osce_score=float(row[17]) if row[17] is not None else None,
            last_osce_attempt_at=row[18],
        )

    async def list_osce_station_best_scores(self, user_id: int) -> list[OsceStationBestScoreMetrics]:
        result = await self.session.execute(
            select(
                OsceAttempt.station_slug,
                func.max(OsceAttempt.total_score_percent).label("best_score"),
            )
            .where(OsceAttempt.user_id == user_id)
            .group_by(OsceAttempt.station_slug)
        )

        return [
            OsceStationBestScoreMetrics(
                station_slug=row[0],
                best_score=float(row[1] or 0.0),
            )
            for row in result.all()
        ]

    async def list_daily_stats(self, user_id: int, limit: int) -> list[DailyStat]:
        result = await self.session.execute(
            select(DailyStat).where(DailyStat.user_id == user_id).order_by(DailyStat.stat_date.desc()).limit(limit)
        )
        return list(result.scalars().all())
