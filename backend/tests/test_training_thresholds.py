from datetime import date

from app.services.analytics_service import AnalyticsService
from app.models.enums import StudyIntensity
from app.services.readiness_engine import _resolve_status as resolve_readiness_status
from app.services.schedule_service import (
    FOCUSED_TEST_MINUTES,
    FOCUSED_TEST_QUESTION_COUNT,
    MIXED_TEST_MINUTES,
    MIXED_TEST_QUESTION_COUNT,
    PlannedTopic,
    ScheduleService,
)


def test_topic_analytics_uses_70_pass_and_85_mastery_thresholds() -> None:
    service = object.__new__(AnalyticsService)

    assert service._resolve_status(69.99) == "weak"
    assert service._resolve_status(70.0) == "medium"
    assert service._resolve_status(84.99) == "medium"
    assert service._resolve_status(85.0) == "strong"


def test_schedule_topic_stable_status_starts_at_85_percent() -> None:
    service = object.__new__(ScheduleService)

    assert service._resolve_topic_status(
        answered_questions=12,
        accuracy_percent=84.99,
        repeated_question_struggles=0,
        hard_question_accuracy_percent=None,
    ) == "developing"
    assert service._resolve_topic_status(
        answered_questions=12,
        accuracy_percent=85.0,
        repeated_question_struggles=0,
        hard_question_accuracy_percent=None,
    ) == "stable"


def test_schedule_developing_topic_counts_as_stable_only_from_85_percent() -> None:
    service = object.__new__(ScheduleService)

    def planned_topic(accuracy_percent: float) -> PlannedTopic:
        return PlannedTopic(
            topic=object(),
            answered_questions=8,
            correct_answers=7,
            accuracy_percent=accuracy_percent,
            status="developing",
            recommended_repeats=0,
            case_attempts_count=0,
            repeated_question_struggles=0,
            hard_question_accuracy_percent=None,
            last_activity_at=None,
            last_struggle_at=None,
            review_interval_days=0,
            review_urgency="fresh",
            review_overdue_days=0,
        )

    assert service._counts_as_stable_topic(planned_topic(84.99)) is False
    assert service._counts_as_stable_topic(planned_topic(85.0)) is True


def test_schedule_topic_focus_sequence_interleaves_repeated_topics() -> None:
    service = object.__new__(ScheduleService)

    def planned_topic(topic_id: int, repeats: int) -> PlannedTopic:
        topic = type("TopicStub", (), {"id": topic_id, "name": f"Topic {topic_id}"})()
        return PlannedTopic(
            topic=topic,
            answered_questions=0,
            correct_answers=0,
            accuracy_percent=0,
            status="critical",
            recommended_repeats=repeats,
            case_attempts_count=0,
            repeated_question_struggles=0,
            hard_question_accuracy_percent=None,
            last_activity_at=None,
            last_struggle_at=None,
            review_interval_days=0,
            review_urgency="fresh",
            review_overdue_days=0,
        )

    sequence = service._build_topic_focus_sequence(
        [planned_topic(1, 3), planned_topic(2, 2), planned_topic(3, 1)],
        6,
    )

    assert [item.topic.id for item in sequence] == [1, 2, 3, 1, 2, 1]


def test_schedule_standard_planned_tests_use_full_question_blocks() -> None:
    service = object.__new__(ScheduleService)
    user = type(
        "UserStub",
        (),
        {
            "daily_study_minutes": 45,
            "study_intensity": StudyIntensity.STEADY,
            "study_weekdays": [0, 1, 2, 3, 4, 5, 6],
        },
    )()

    load_profile = service._build_user_study_load_profile(user)

    assert load_profile.focused_test_question_count == FOCUSED_TEST_QUESTION_COUNT == 30
    assert load_profile.focused_test_minutes == FOCUSED_TEST_MINUTES == 15
    assert load_profile.mixed_test_question_count == MIXED_TEST_QUESTION_COUNT == 50
    assert load_profile.mixed_test_minutes == MIXED_TEST_MINUTES == 25


def test_schedule_special_review_tasks_are_not_tiny_blocks() -> None:
    service = object.__new__(ScheduleService)
    user = type(
        "UserStub",
        (),
        {
            "daily_study_minutes": 45,
            "study_intensity": StudyIntensity.STEADY,
            "study_weekdays": [0, 1, 2, 3, 4, 5, 6],
        },
    )()
    load_profile = service._build_user_study_load_profile(user)
    scheduled_date = date(2026, 5, 7)

    recovery_task = service._build_recovery_review_task(1, scheduled_date, load_profile)
    pre_accreditation_task = service._build_pre_accreditation_review_task(1, scheduled_date, load_profile)
    final_week_task = service._build_final_week_broad_review_task(1, scheduled_date, load_profile)

    assert recovery_task.questions_count == 30
    assert pre_accreditation_task.questions_count == 30
    assert final_week_task.questions_count == 50


def test_readiness_status_uses_70_and_85_bands() -> None:
    assert resolve_readiness_status(69.99) == "risk"
    assert resolve_readiness_status(70.0) == "building"
    assert resolve_readiness_status(84.99) == "building"
    assert resolve_readiness_status(85.0) == "ready"
